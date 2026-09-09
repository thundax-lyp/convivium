import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalMeetingWebRuntime } from "@/runtime/index.js";
import { createRemoteGateway } from "../fixtures/remote-gateway.js";

const meetingId = "meeting-1";
const base = { protocolVersion: 1 as const, meetingId, meetingVersion: 2 };

function runtimeFixture() {
    const calls = new Map<string, ReturnType<typeof vi.fn>>();
    const method = (name: string, result: unknown) => {
        const fn = vi.fn(async () => result);
        calls.set(name, fn);
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

describe("Remote Gateway boundary", () => {
    let gateway: Awaited<ReturnType<typeof createRemoteGateway>> | undefined;

    afterEach(async () => {
        await gateway?.dispose();
        gateway = undefined;
    });

    it("dispatches all nine unary methods through the generated Gateway", async () => {
        const fixture = runtimeFixture();
        gateway = await createRemoteGateway(fixture.runtime);
        await gateway.invoke("list", {});
        await gateway.invoke("getStatus", { input: { protocolVersion: 1, meetingId } });
        await gateway.invoke("pause", { input: { ...input, reason: "pause" } });
        await gateway.invoke("resume", { input });
        await gateway.invoke("reassign", {
            input: { ...input, currentAttemptId: "attempt-1", action: "skip", reason: "skip" }
        });
        await gateway.invoke("end", {
            input: {
                ...input,
                outcome: "cancelled",
                reason: "end",
                acceptedDecisionIds: [],
                deferredAgendaItemIds: [],
                waivers: []
            }
        });
        await gateway.invoke("acceptDecision", {
            input: {
                ...input,
                decisionCandidateId: "candidate-1",
                reason: "accept",
                evidenceMessageIds: []
            }
        });
        await gateway.invoke("disposeDecision", {
            input: {
                ...input,
                decisionId: "decision-1",
                action: "revoke",
                reason: "revoke",
                evidenceMessageIds: []
            }
        });
        await gateway.invoke("disposeRisk", {
            input: {
                ...input,
                issueId: "risk-1",
                decision: "accept",
                reason: "accept",
                evidenceMessageIds: ["evidence-1"]
            }
        });
        expect([...fixture.calls.values()].every((call) => call.mock.calls.length === 1)).toBe(
            true
        );
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

    it("merges caller and Service lifetime cancellation for streams", async () => {
        const fixture = runtimeFixture();
        gateway = await createRemoteGateway(fixture.runtime);
        const caller = new AbortController();
        const stream = await gateway.stream("watchUpdates", {}, caller.signal);
        const iterator = stream[Symbol.asyncIterator]();
        await expect(iterator.next()).resolves.toEqual({ value: { kind: "refresh" }, done: false });
        const pending = iterator.next();
        await gateway.serviceFiber.dispose();
        await expect(pending).resolves.toMatchObject({ done: true });
        expect(caller.signal.aborted).toBe(false);
        expect(fixture.streamSignal?.aborted).toBe(true);
    });
});
