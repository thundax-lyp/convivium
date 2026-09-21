import { describe, expect, it, vi } from "vitest";
import {
    completeMeetingArchive,
    endMeeting,
    startMeetingArchive,
    type MeetingState
} from "@/domain/index.js";
import { encodeMeetingIdentitySessionLabelV1 } from "@/dsh/index.js";
import { createMeetingArchiveDispatcherV1 } from "@/runtime/services/meeting-archive.js";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";

function terminalState(): MeetingState {
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
}

function archivingState(): MeetingState {
    const result = startMeetingArchive(terminalState(), {
        archiveId: "archive-1",
        actorId: "runtime-recovery",
        now: 3,
        questionIssueDispositionFacts: []
    });
    if (result.kind !== "accepted") throw new Error("archive fixture rejected");
    return result.state;
}

function ownerships(state: MeetingState) {
    return state.identities.map((identity) => {
        const role = identity.roles[0] === "contributor" ? "participant" : identity.roles[0]!;
        return {
            id: `ownership:${identity.id}`,
            meetingId: state.id,
            identityId: identity.id,
            sessionId: `session:${identity.id}`,
            parentSessionId: "captain-1",
            sessionLabel: encodeMeetingIdentitySessionLabelV1({
                role,
                meetingId: state.id,
                identityId: identity.id
            }),
            provider: "spawn",
            role,
            lifecycleStatus: "active" as const,
            capabilityStatus: "active" as const,
            createdAt: 1,
            updatedAt: 1
        };
    });
}

const archiveItem = (attempts = 1) => ({
    id: "effect-archive-1",
    deliveryId: "effect-archive-1",
    kind: "dispatch" as const,
    priority: 1,
    payload: { kind: "archive", archiveId: "archive-1" },
    attempts,
    leaseOwner: "worker",
    leaseToken: "token",
    leaseDeadline: 2
});

function children(current: ReturnType<typeof ownerships>) {
    return current.map((ownership) => ({
        kind: "child",
        id: ownership.sessionId,
        mode: "continuable",
        label: ownership.sessionLabel,
        activity: "inactive",
        hasChildren: false
    }));
}

describe("meeting archive dispatcher v1", () => {
    it("materializes through the command application then drains the exact owned Session set", async () => {
        let state = terminalState();
        let current = ownerships(state);
        const calls: string[] = [];
        const execute = vi.fn(async (command, context) => {
            expect(context).toMatchObject({
                caller: { channel: "runtime_recovery", principalId: "runtime-recovery" }
            });
            if (command.action.kind === "start_archive") {
                expect(command.requestId).toBe("archive-start:effect-archive-1");
                const started = startMeetingArchive(state, {
                    archiveId: "archive-1",
                    actorId: "runtime-recovery",
                    now: 3,
                    questionIssueDispositionFacts: []
                });
                if (started.kind !== "accepted") throw new Error("start rejected");
                state = started.state;
                return { kind: "accepted" as const };
            }
            const ownership = current.find(
                (candidate) => candidate.id === command.action.sessionOwnershipId
            )!;
            calls.push(`commit:${ownership.sessionId}:${command.action.status}`);
            current = current.map((candidate) =>
                candidate.id === ownership.id
                    ? {
                          ...candidate,
                          lifecycleStatus: "closed" as const,
                          capabilityStatus: "revoked" as const
                      }
                    : candidate
            );
            state = { ...state, version: state.version + 1 };
            if (current.every((candidate) => candidate.lifecycleStatus === "closed")) {
                const completed = completeMeetingArchive(state, {
                    actorId: "runtime-recovery",
                    now: 4,
                    allSessionOwnershipClosed: true
                });
                if (completed.kind !== "accepted") throw new Error("complete rejected");
                state = completed.state;
            }
            return { kind: "accepted" as const };
        });
        const dispatcher = createMeetingArchiveDispatcherV1({
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: state.version,
                        state,
                        createdAt: 0,
                        updatedAt: state.updatedAt
                    },
                    sessionOwnership: current
                })
            } as never,
            sessions: {
                listChildren: async () => children(current) as never,
                interrupt: (sessionId) => calls.push(`interrupt:${String(sessionId)}`),
                drainContinuableDescendants: async (parents) =>
                    calls.push(`drain:${parents.map((parent) => String(parent.id)).join(",")}`)
            },
            application: { execute } as never
        });

        await dispatcher.dispatch({
            outboxItem: archiveItem(),
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        });

        expect(state.lifecycle.status).toBe("archived");
        expect(calls).toEqual([
            "drain:captain-1",
            ...current.map((ownership) => `commit:${ownership.sessionId}:closed`)
        ]);
        expect(execute).toHaveBeenCalledTimes(4);
        expect(execute.mock.calls[0]?.[1]).toMatchObject({
            archiveEffect: { effectId: "effect-archive-1", archiveId: "archive-1" }
        });
    });

    it("fails closed before touching Sessions when the durable child set has an extra entry", async () => {
        const state = archivingState();
        const current = ownerships(state);
        const interrupt = vi.fn();
        const execute = vi.fn();
        const dispatcher = createMeetingArchiveDispatcherV1({
            repository: {
                recover: async () => ({
                    snapshot: { meetingId: state.id, version: state.version, state },
                    sessionOwnership: current
                })
            } as never,
            sessions: {
                listChildren: async () =>
                    [
                        ...children(current),
                        {
                            kind: "child",
                            id: "foreign-session",
                            mode: "continuable",
                            label: "foreign"
                        }
                    ] as never,
                interrupt,
                drainContinuableDescendants: vi.fn()
            },
            application: { execute } as never
        });
        await expect(
            dispatcher.dispatch({
                outboxItem: archiveItem(),
                parent: { id: "captain-1" } as never,
                signal: new AbortController().signal
            })
        ).rejects.toMatchObject({ code: "RECOVERY_UNAVAILABLE" });
        expect(interrupt).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it("records a safe close failure and completes on the next outbox attempt", async () => {
        let state = archivingState();
        let current = ownerships(state);
        const commands: unknown[] = [];
        let failDrain = true;
        const execute = vi.fn(async (command) => {
            commands.push(command);
            const ownership = current.find(
                (candidate) => candidate.id === command.action.sessionOwnershipId
            )!;
            if (command.action.status === "failed") {
                current = current.map((candidate) =>
                    candidate.id === ownership.id
                        ? { ...candidate, lastClosureFailureCode: command.action.failureReason }
                        : candidate
                );
            } else {
                current = current.map((candidate) =>
                    candidate.id === ownership.id
                        ? {
                              ...candidate,
                              lifecycleStatus: "closed" as const,
                              capabilityStatus: "revoked" as const,
                              lastClosureFailureCode: undefined
                          }
                        : candidate
                );
            }
            state = { ...state, version: state.version + 1 };
            if (current.every((candidate) => candidate.lifecycleStatus === "closed"))
                state = {
                    ...state,
                    version: state.version + 1,
                    lifecycle: {
                        status: "archived",
                        changedAt: 5,
                        changedBy: "runtime-recovery"
                    }
                };
            return { kind: "accepted" as const };
        });
        const dispatcher = createMeetingArchiveDispatcherV1({
            repository: {
                recover: async () => ({
                    snapshot: { meetingId: state.id, version: state.version, state },
                    sessionOwnership: current
                })
            } as never,
            sessions: {
                listChildren: async () => children(current) as never,
                interrupt: vi.fn(),
                drainContinuableDescendants: async () => {
                    if (failDrain) {
                        failDrain = false;
                        throw new Error("private session transport detail");
                    }
                }
            },
            application: { execute } as never
        });
        const input = {
            outboxItem: archiveItem(),
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        };
        await expect(dispatcher.dispatch(input)).rejects.toMatchObject({
            code: "SESSION_CLOSE_FAILED",
            retryable: true
        });
        expect(JSON.stringify(commands)).not.toContain("private session transport detail");
        expect(commands[0]).toMatchObject({
            requestId: "archive:archive-1:ownership:manager-v1:1:failed",
            action: {
                status: "failed",
                failureReason: "SESSION_CLOSE_FAILED"
            }
        });

        await dispatcher.dispatch({ ...input, outboxItem: archiveItem(2) });
        expect(state.lifecycle.status).toBe("archived");
    });
});
