import { describe, expect, it, vi } from "vitest";
import {
    completeMeetingArchive,
    endMeeting,
    startMeetingArchive,
    type MeetingState
} from "@/domain/index.js";
import { encodeMeetingIdentitySessionLabel } from "@/dsh/index.js";
import { createMeetingArchiveDispatcher } from "@/runtime/services/meeting-archive.js";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";

const terminalState = (): MeetingState => {
    const running = makeRunningMeetingStateV1();
    running.identities = running.identities.map((identity) => ({
        ...identity,
        sessionOwnershipId: `ownership:${identity.id}`
    }));
    const result = endMeeting(running, {
        terminationId: "termination-1",
        outcome: "partial",
        reason: "done",
        decisionIds: [],
        completionFactIds: [],
        unresolvedQuestionIds: [],
        unresolvedIssueIds: [],
        actorId: "local",
        now: 2
    });
    if (result.kind !== "accepted") throw new Error("terminal fixture rejected");
    return result.state;
};

const archivingState = (): MeetingState => {
    const result = startMeetingArchive(terminalState(), {
        archiveId: "archive-1",
        actorId: "runtime-recovery",
        now: 3,
        questionIssueDispositionFacts: []
    });
    if (result.kind !== "accepted") throw new Error("archive fixture rejected");
    return result.state;
};

const fixture = (terminal = false) => {
    let state = terminal ? terminalState() : archivingState();
    let current = state.identities.map((identity) => ({
        id: identity.sessionOwnershipId!,
        meetingId: state.id,
        identityId: identity.id,
        sessionId: `session:${identity.id}`,
        definition: { agentDefinitionId: "fixture", definitionVersion: "1" },
        sessionLabel: encodeMeetingIdentitySessionLabel({
            role: identity.roles[0] === "contributor" ? "participant" : identity.roles[0]!,
            meetingId: state.id,
            identityId: identity.id
        }),
        role: identity.roles[0] === "contributor" ? "participant" : identity.roles[0]!,
        lifecycleStatus: "active",
        capabilityStatus: "active",
        createdAt: 1,
        updatedAt: 1
    }));
    const calls: string[] = [];
    const execute = vi.fn(async (command, context) => {
        expect(context.caller).toEqual({
            channel: "runtime_recovery",
            principalId: "runtime-recovery"
        });
        if (command.action.kind === "start_archive") {
            expect(context.archiveEffect).toEqual({
                effectId: "effect-archive-1",
                archiveId: "archive-1"
            });
            calls.push("start");
            const result = startMeetingArchive(state, {
                archiveId: "archive-1",
                actorId: "runtime-recovery",
                now: 3,
                questionIssueDispositionFacts: []
            });
            if (result.kind !== "accepted") throw new Error("start rejected");
            state = result.state;
        } else {
            calls.push(`commit:${command.action.sessionOwnershipId}:${command.action.status}`);
            if (command.action.status === "closed")
                current = current.map((o) =>
                    o.id === command.action.sessionOwnershipId
                        ? { ...o, lifecycleStatus: "closed" }
                        : o
                );
            if (current.every((o) => o.lifecycleStatus === "closed")) {
                const result = completeMeetingArchive(state, {
                    actorId: "runtime-recovery",
                    now: 4,
                    allSessionOwnershipClosed: true
                });
                if (result.kind !== "accepted") throw new Error("complete rejected");
                state = result.state;
            }
        }
        return { kind: "accepted" };
    });
    const recover = async () => ({
        snapshot: { meetingId: state.id, version: state.version, state },
        sessionOwnership: current
    });
    const recordSessionOwnership = vi.fn(async (input) => {
        calls.push(`revoke:${input.id}`);
        const persisted = { ...input, createdAt: 1, updatedAt: 2 };
        current = current.map((o) => (o.id === input.id ? persisted : o));
        return persisted;
    });
    const stop = vi.fn(async ({ ownership }) => {
        expect(current.find((o) => o.id === ownership.id)?.capabilityStatus).toBe("revoked");
        expect(ownership.meetingId).toBe(state.id);
        calls.push(`stop:${ownership.id}`);
    });
    const dispatcher = createMeetingArchiveDispatcher({
        repository: { recover, recordSessionOwnership },
        owner: { stop },
        definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
        application: { execute }
    } as never);
    const dispatch = (attempts = 1) =>
        dispatcher.dispatch({
            outboxItem: {
                id: "effect-archive-1",
                deliveryId: "effect-archive-1",
                kind: "dispatch",
                priority: 1,
                payload: { kind: "archive", archiveId: "archive-1" },
                attempts,
                leaseOwner: "worker",
                leaseToken: "token",
                leaseDeadline: 2
            },
            signal: new AbortController().signal
        });
    return {
        dispatch,
        calls,
        stop,
        execute,
        recordSessionOwnership,
        getState: () => state,
        getOwners: () => current
    };
};

describe("peer meeting archive", () => {
    it("materializes the archive and revokes all owned authority before stopping Sessions without a parent", async () => {
        const f = fixture(true);
        await f.dispatch();
        expect(f.getState().lifecycle.status).toBe("archived");
        const ids = f.getOwners().map((o) => o.id);
        expect(f.calls).toEqual([
            "start",
            ...ids.map((id) => `revoke:${id}`),
            ...ids.flatMap((id) => [`stop:${id}`, `commit:${id}:closed`])
        ]);
        expect(f.stop).toHaveBeenCalledTimes(ids.length);
    });
    it("leaves all authority revoked on a stop failure and retries only unfinished Sessions", async () => {
        const f = fixture();
        f.stop.mockRejectedValueOnce(new Error("private transport detail"));
        await expect(f.dispatch()).rejects.toMatchObject({
            code: "SESSION_CLOSE_FAILED",
            retryable: true,
            terminalOnAttemptLimit: false
        });
        expect(f.getOwners().every((o) => o.capabilityStatus === "revoked")).toBe(true);
        expect(JSON.stringify(f.execute.mock.calls)).not.toContain("private transport detail");
        await f.dispatch(2);
        expect(f.getState().lifecycle.status).toBe("archived");
        const count = f.stop.mock.calls.length;
        await f.dispatch(3);
        expect(f.stop).toHaveBeenCalledTimes(count);
    });
    it("refuses foreign ownership before revoking or stopping any Session", async () => {
        const f = fixture();
        f.getOwners()[0]!.meetingId = "other-meeting";
        await expect(f.dispatch()).rejects.toMatchObject({ code: "RECOVERY_UNAVAILABLE" });
        expect(f.recordSessionOwnership).not.toHaveBeenCalled();
        expect(f.stop).not.toHaveBeenCalled();
    });
    it("refuses a mismatched identity label without touching Sessions", async () => {
        const f = fixture();
        f.getOwners()[0]!.sessionLabel = "wrong-label";
        await expect(f.dispatch()).rejects.toMatchObject({ code: "RECOVERY_UNAVAILABLE" });
        expect(f.stop).not.toHaveBeenCalled();
    });
});
