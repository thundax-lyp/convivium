import { afterEach, describe, expect, it, vi } from "vitest";
import {
    LocalMeetingRecoveryUnavailableError,
    type LocalMeetingWebRuntime
} from "@/runtime/index.js";
import { createRemoteGateway } from "../fixtures/remote-gateway.js";

const meetingId = "meeting-1";
const base = { protocolVersion: 1 as const, meetingId, meetingVersion: 2 };

function runtimeFixture() {
    const calls = new Map<string, ReturnType<typeof vi.fn>>();
    const results = new Map<string, unknown>();
    const method = (name: string, result: unknown) => {
        const fn = vi.fn(async () => result);
        calls.set(name, fn);
        results.set(name, result);
        return fn;
    };
    let streamSignal: AbortSignal | undefined;
    const runtime = {
        listLocalMeetings: method("list", {
            ok: true as const,
            protocolVersion: 1 as const,
            result: {
                meetings: [
                    {
                        meetingId,
                        teamId: "team-1",
                        topic: "Release",
                        status: "running",
                        meetingVersion: 2,
                        updatedAt: 10
                    }
                ]
            }
        }),
        getLocalMeetingStatus: method("getStatus", {
            ...base,
            ok: true as const,
            result: {
                ...base,
                topic: "Release",
                objective: "Decide scope",
                continuationMaterials: [],
                limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
                messages: [],
                questions: [],
                proposals: [],
                pendingDecisionCandidates: [],
                acceptedDecisions: [],
                decisionHistory: [],
                risks: [],
                blockingFacts: [],
                parkingLot: [],
                meetingTasks: [],
                attendanceRecommendations: [],
                status: "running",
                stallCount: 0,
                maxStalls: 3,
                replanCount: 0,
                maxReplans: 1,
                pendingHandRaises: [],
                pauseControl: { action: "pause" }
            }
        }),
        pauseLocalMeeting: method("pause", {
            ...base,
            ok: true as const,
            meetingVersion: 3,
            result: { status: "paused", changed: true }
        }),
        resumeLocalMeeting: method("resume", {
            ...base,
            ok: true as const,
            meetingVersion: 4,
            result: { status: "running", changed: true }
        }),
        reassignLocalTurn: method("reassign", {
            ...base,
            ok: true as const,
            meetingVersion: 5,
            result: { revokedAttemptId: "attempt-1", action: "skip" }
        }),
        endLocalMeeting: method("end", {
            ...base,
            ok: true as const,
            meetingVersion: 6,
            result: { status: "cancelled", terminationCode: "user_cancelled" }
        }),
        acceptLocalDecision: method("acceptDecision", {
            ...base,
            ok: true as const,
            result: {
                requestId: "accept-1",
                decisionCandidateId: "candidate-1",
                decisionId: "decision-1",
                proposalId: "proposal-1",
                proposalRevision: 1,
                completionFactId: "fact-1"
            }
        }),
        disposeLocalDecision: method("disposeDecision", {
            ...base,
            ok: true as const,
            result: {
                requestId: "dispose-1",
                decisionId: "decision-1",
                action: "revoke",
                completionFactId: "fact-2"
            }
        }),
        disposeLocalRisk: method("disposeRisk", {
            ...base,
            ok: true as const,
            result: {
                requestId: "risk-1",
                issueId: "risk-1",
                disposition: "accepted",
                completionFactId: "fact-3",
                meetingStatus: "running"
            }
        }),
        watchLocalMeetingUpdates: (signal: AbortSignal) => {
            streamSignal = signal;
            return {
                async *[Symbol.asyncIterator]() {
                    yield { kind: "refresh" as const };
                    await new Promise<void>((resolve) => {
                        signal.addEventListener("abort", () => resolve(), { once: true });
                    });
                }
            };
        }
    } as unknown as LocalMeetingWebRuntime;
    return {
        runtime,
        calls,
        results,
        get streamSignal() {
            return streamSignal;
        }
    };
}

const input = {
    protocolVersion: 1,
    meetingId,
    expectedMeetingVersion: 2,
    requestId: "request-1"
};

const cases: readonly [string, Record<string, unknown>][] = [
    ["getStatus", { protocolVersion: 1, meetingId }],
    ["pause", { ...input, reason: "pause" }],
    ["resume", { ...input }],
    ["reassign", { ...input, currentAttemptId: "attempt-1", action: "skip", reason: "skip" }],
    [
        "reassign",
        {
            ...input,
            currentAttemptId: "attempt-1",
            action: "reassign",
            replacementParticipantId: "participant-2",
            reason: "replace"
        }
    ],
    [
        "end",
        {
            ...input,
            outcome: "cancelled",
            reason: "end",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: []
        }
    ],
    [
        "acceptDecision",
        { ...input, decisionCandidateId: "candidate-1", reason: "accept", evidenceMessageIds: [] }
    ],
    [
        "disposeDecision",
        {
            ...input,
            decisionId: "decision-1",
            action: "revoke",
            reason: "revoke",
            evidenceMessageIds: []
        }
    ],
    [
        "disposeDecision",
        {
            ...input,
            decisionId: "decision-1",
            action: "supersede",
            replacementCandidateId: "candidate-2",
            reason: "replace",
            evidenceMessageIds: []
        }
    ],
    [
        "disposeRisk",
        {
            ...input,
            issueId: "risk-1",
            decision: "accept",
            reason: "accept",
            evidenceMessageIds: ["message-1"]
        }
    ],
    [
        "disposeRisk",
        {
            ...input,
            issueId: "risk-1",
            decision: "reject",
            reason: "reject",
            evidenceMessageIds: ["message-1"]
        }
    ]
];

describe("Remote Gateway boundary", () => {
    let gateway: Awaited<ReturnType<typeof createRemoteGateway>> | undefined;

    afterEach(async () => {
        await gateway?.dispose();
        gateway = undefined;
    });

    it("preserves inputs and successful results through all nine Gateway methods", async () => {
        const fixture = runtimeFixture();
        gateway = await createRemoteGateway(fixture.runtime);
        await expect(gateway.invoke("list", {})).resolves.toEqual(fixture.results.get("list"));
        expect(fixture.calls.get("list")).toHaveBeenCalledExactlyOnceWith();
        for (const [method, valid] of cases) {
            const call = fixture.calls.get(method)!;
            call.mockClear();
            const expected = structuredClone(fixture.results.get(method));
            await expect(gateway.invoke(method, { input: valid })).resolves.toEqual(expected);
            expect(call).toHaveBeenCalledExactlyOnceWith(valid);
        }
    });

    it("preserves conditional replacement fields and rejects them on other actions", async () => {
        const fixture = runtimeFixture();
        gateway = await createRemoteGateway(fixture.runtime);
        const reassign = {
            ...input,
            currentAttemptId: "attempt-1",
            action: "reassign",
            reason: "replace",
            replacementParticipantId: "participant-2"
        };
        await gateway.invoke("reassign", { input: reassign });
        expect(fixture.calls.get("reassign")).toHaveBeenCalledWith(reassign);
        const supersede = {
            ...input,
            decisionId: "decision-1",
            action: "supersede",
            reason: "replace",
            evidenceMessageIds: [],
            replacementCandidateId: "candidate-2"
        };
        await gateway.invoke("disposeDecision", { input: supersede });
        expect(fixture.calls.get("disposeDecision")).toHaveBeenCalledWith(supersede);
        await expect(
            gateway.invoke("reassign", { input: { ...reassign, action: "skip" } })
        ).rejects.toMatchObject({ code: "convivium/invalid-request" });
        await expect(
            gateway.invoke("disposeDecision", { input: { ...supersede, action: "revoke" } })
        ).rejects.toMatchObject({ code: "convivium/invalid-request" });
        expect(fixture.calls.get("reassign")).toHaveBeenCalledOnce();
        expect(fixture.calls.get("disposeDecision")).toHaveBeenCalledOnce();
    });

    it("rejects extra fields before Runtime invocation", async () => {
        const fixture = runtimeFixture();
        gateway = await createRemoteGateway(fixture.runtime);
        await expect(
            gateway.invoke("pause", { input: { ...input, reason: "pause", authority: "captain" } })
        ).rejects.toMatchObject({ code: "convivium/invalid-request" });
        expect(fixture.calls.get("pause")?.mock.calls).toHaveLength(0);
    });

    it.each(cases)("rejects malformed %s inputs before Runtime", async (method, valid) => {
        const fixture = runtimeFixture();
        gateway = await createRemoteGateway(fixture.runtime);
        const malformed: unknown[] = [
            null,
            [],
            3,
            { ...valid, authority: "captain" },
            { ...valid, protocolVersion: 2 },
            { ...valid, meetingId: "" },
            { ...valid, reason: "x".repeat(16_385) }
        ];
        for (const key of Object.keys(valid)) {
            const missing = { ...valid };
            delete missing[key];
            malformed.push(missing);
        }
        for (const value of malformed)
            await expect(
                gateway.invoke(method, { input: value }),
                JSON.stringify(value).slice(0, 300)
            ).rejects.toBeDefined();
        expect(fixture.calls.get(method)).not.toHaveBeenCalled();
    });

    // Action-specific input checks retain every row; output/error mapping is shared per method.
    it.each(
        cases.filter(([method], index) => cases.findIndex(([name]) => name === method) === index)
    )("preserves %s domain failures and sanitizes broken outputs", async (method, valid) => {
        const fixture = runtimeFixture();
        gateway = await createRemoteGateway(fixture.runtime);
        const call = fixture.calls.get(method)!;
        for (const code of [
            "VERSION_CONFLICT",
            "IDEMPOTENCY_CONFLICT",
            "MEETING_NOT_FOUND",
            "INVALID_ARGUMENT"
        ]) {
            const failure = {
                protocolVersion: 1,
                ok: false,
                code,
                message: "safe failure",
                retryable: false
            };
            call.mockResolvedValueOnce(failure);
            await expect(gateway.invoke(method, { input: valid })).resolves.toEqual(failure);
        }
        for (const value of [
            { ok: true },
            { protocolVersion: 1, ok: false, code: "private", message: "private" }
        ]) {
            call.mockResolvedValueOnce(value);
            await expect(gateway.invoke(method, { input: valid })).rejects.toMatchObject({
                code: "convivium/internal",
                message: "Meeting data is unavailable."
            });
        }
        call.mockRejectedValueOnce(new Error("private exception"));
        await expect(gateway.invoke(method, { input: valid })).rejects.toMatchObject({
            code: "convivium/internal",
            message: "Meeting data is unavailable."
        });
        call.mockRejectedValueOnce(new LocalMeetingRecoveryUnavailableError("private recovery"));
        await expect(gateway.invoke(method, { input: valid })).rejects.toMatchObject({
            code: "convivium/recovery-unavailable",
            message: "Meeting data is unavailable."
        });
    });

    it("rejects an already cancelled call without invoking Runtime", async () => {
        const fixture = runtimeFixture();
        gateway = await createRemoteGateway(fixture.runtime);
        const controller = new AbortController();
        controller.abort(new Error("cancelled"));
        await expect(
            gateway.invoke("pause", { input: { ...input, reason: "pause" } }, controller.signal)
        ).rejects.toBeDefined();
        expect(fixture.calls.get("pause")).not.toHaveBeenCalled();
    });

    it.each(["caller", "service"] as const)(
        "ends the stream on %s cancellation",
        async (source) => {
            const fixture = runtimeFixture();
            gateway = await createRemoteGateway(fixture.runtime);
            const caller = new AbortController();
            const stream = await gateway.stream("watchUpdates", {}, caller.signal);
            const iterator = stream[Symbol.asyncIterator]();
            await expect(iterator.next()).resolves.toEqual({
                value: { kind: "refresh" },
                done: false
            });
            const pending = iterator.next();
            const finished =
                source === "caller"
                    ? expect(pending).rejects.toMatchObject({ code: "gateway/cancelled" })
                    : expect(pending).resolves.toMatchObject({ done: true });
            if (source === "caller") caller.abort();
            else await gateway.serviceFiber.dispose();
            expect(fixture.streamSignal?.aborted).toBe(true);
            await finished;
            expect(caller.signal.aborted).toBe(source === "caller");
        }
    );
});
