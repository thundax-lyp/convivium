import { describe, expect, it, vi } from "vitest";
import { createMeetingCommandApplication } from "@/runtime/application-service/meeting-command.js";

const actions = [
    { kind: "activate_agenda", agendaId: "a", previousDisposition: "completed", reason: "next" },
    { kind: "dispose_agenda_candidate", candidateId: "c", disposition: "parked", reason: "later" },
    {
        kind: "resolve_question",
        questionId: "q",
        status: "deferred",
        rationale: "later",
        evidenceIds: ["v"]
    },
    {
        kind: "dispose_issue",
        issueId: "i",
        status: "resolved",
        rationale: "fixed",
        evidenceIds: ["v"]
    },
    { kind: "abort_round", roundId: "r", reason: "stop" },
    { kind: "decide", candidateId: "c" },
    {
        kind: "change_decision",
        decisionId: "d",
        status: "revoked",
        rationale: "invalid",
        evidenceIds: ["v"]
    },
    {
        kind: "dispose_risk",
        issueId: "i",
        action: "accept",
        scope: "current",
        rationale: "bounded",
        evidenceIds: ["v"]
    },
    {
        kind: "record_completion_fact",
        outputId: "o",
        statement: "done",
        rationale: "verified",
        evidenceIds: ["v"],
        decisionIds: ["d"]
    },
    { kind: "change_completion_fact", factId: "f", status: "revoked", rationale: "invalid" }
];
const user = { channel: "loopback_remote", principalId: "local-controller" } as const;
const envelope = {
    protocolVersion: 1 as const,
    meetingId: "m",
    expectedMeetingVersion: 1,
    requestId: "request-1"
};
const authorizationFixture = (caller, role = "captain", ownerRole = "participant") => {
    const execute = vi.fn(async () => ({
        result: {
            kind: "accepted",
            meetingId: "m",
            committedVersion: 2,
            receiptId: "receipt",
            factIds: ["fact"],
            effects: []
        }
    }));
    const openMeeting = vi.fn(async () => ({ execute }));
    const application = createMeetingCommandApplication({
        registry: { openMeeting },
        creation: { create: vi.fn() },
        ids: { nextId: vi.fn() },
        clock: { now: () => 10 },
        resolveCallerScope: async () => ({
            caller,
            meetingId: "m",
            role,
            ...(caller.channel === "dsh_tool"
                ? {
                      identityId: caller.principalId,
                      ownership: {
                          id: caller.sessionBindingId,
                          identityId: caller.principalId,
                          meetingId: "m",
                          role: ownerRole,
                          lifecycleStatus: "active",
                          capabilityStatus: "active"
                      }
                  }
                : {})
        })
    } as never);
    return { application, openMeeting, execute };
};
describe("Captain trusted user authorization", () => {
    it.each(actions)(
        "allows the user and refuses forged sources for $kind before receipt replay",
        async (action) => {
            const allowed = authorizationFixture(user);
            await expect(
                allowed.application.execute(
                    { ...envelope, action } as never,
                    { caller: user },
                    new AbortController().signal
                )
            ).resolves.toMatchObject({ kind: "accepted" });
            expect(allowed.execute).toHaveBeenCalledOnce();
            for (const caller of [
                { ...user, principalId: "other" },
                { ...user, sessionBindingId: "user-session" },
                {
                    channel: "dsh_tool",
                    principalId: "local-controller",
                    sessionBindingId: "owned-session"
                },
                { channel: "runtime_recovery", principalId: "runtime-recovery" }
            ]) {
                const denied = authorizationFixture(caller);
                await expect(
                    denied.application.execute(
                        { ...envelope, action } as never,
                        { caller } as never,
                        new AbortController().signal
                    )
                ).resolves.toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
                expect(denied.openMeeting).not.toHaveBeenCalled();
            }
        }
    );
    it("does not allow a role claim to promote a Contributor into Manager", async () => {
        const caller = {
            channel: "dsh_tool",
            principalId: "contributor",
            sessionBindingId: "owner"
        };
        const f = authorizationFixture(caller, "manager", "participant");
        await expect(
            f.application.execute(
                { ...envelope, action: { kind: "open_round", agendaId: "a", planId: "p" } },
                { caller } as never,
                new AbortController().signal
            )
        ).resolves.toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(f.openMeeting).not.toHaveBeenCalled();
    });
    it("keeps system archive and identity contributions outside user controls", async () => {
        for (const action of [
            { kind: "start_archive" },
            { kind: "raise_hand", roundId: "r", purpose: "speak" }
        ]) {
            const f = authorizationFixture(user);
            await expect(
                f.application.execute(
                    { ...envelope, action } as never,
                    { caller: user },
                    new AbortController().signal
                )
            ).resolves.toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
            expect(f.openMeeting).not.toHaveBeenCalled();
        }
    });
});
