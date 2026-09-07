import { describe, expect, it, vi } from "vitest";
import {
    runConvergenceStalledScenario,
    runConvergenceNoConsensusScenario,
    runConvergenceResetScenario,
    runConvergenceTurnBudgetCompletionScenario,
    runConvergenceMessageBudgetCompletionScenario
} from "../../../scripts/smoke-profile/probe/scenarios/convergence.js";
import { validateScenarioResult } from "../../../scripts/smoke-profile/result.mjs";
import { createProbeSupport } from "../../../scripts/smoke-profile/probe/support.js";
import { createConvergenceFixture, type ConvergenceScenario } from "./convergence-fixture.js";

function harness(scenario: ConvergenceScenario = "convergence-stalled", fault = "") {
    const o = createConvergenceFixture(scenario).observed;
    let submitted = 0,
        ended = false,
        late = false,
        call = 0;
    const participant = { id: "m-participant-participant-a" };
    const captain = { agent: { session: { id: "captain" } } };
    const callTool = vi.fn(async (_ctx, agent, name, input) => {
        if (name === "convivium_create_meeting") {
            expect(input.selectionMode).toBe("rule_based");
            expect(input.participants).toEqual([{ participantKey: "a", displayName: "A" }]);
            expect(input.limits).toEqual(o.archived.limits);
            return { result: { meetingId: "m" } };
        }
        if (name === "convivium_meeting_status") {
            expect(agent).toBe(captain.agent);
            if (submitted < o.submissions.length || (o.endResult && !ended)) {
                const c = o.checkpoints[submitted - 1];
                return {
                    meetingVersion: submitted ? o.submissions[submitted - 1]!.meetingVersion : 10,
                    result: {
                        status:
                            fault === "converging" && submitted === 2
                                ? "running"
                                : (c?.status ?? "running"),
                        currentAttemptId: "a" + submitted,
                        currentTurn:
                            c?.nextTurnId === null
                                ? undefined
                                : {
                                      id: "t" + submitted,
                                      seq: submitted + 1,
                                      intent: c?.intent ?? "explore",
                                      reason: c?.reason ?? "explore"
                                  },
                        activeAgendaItem: { id: "agenda-agenda-1" },
                        stallCount: fault === "stall" ? 0 : (c?.stallCount ?? 0),
                        replanCount:
                            fault === "replan" || (fault === "reset" && submitted === 4)
                                ? 1
                                : (c?.replanCount ?? 0),
                        maxStalls: 3,
                        maxReplans: 1,
                        questions: o.archived.archive.package.unresolvedQuestions,
                        proposals: o.archived.archive.package.proposals
                    }
                };
            }
            const archived = structuredClone(o.archived);
            if (fault === "fact") archived.archive.package.completionFacts = [];
            if (fault === "proposal") archived.archive.package.proposals = [];
            if (fault === "question") archived.archive.package.unresolvedQuestions = [];
            if (fault === "code") archived.termination.code = "stalled";
            if (fault === "archive") archived.archive.package.formalTranscript.pop();
            if (late && fault === "changed") archived.topic = "changed";
            return { meetingVersion: o.archivedVersion, result: archived };
        }
        if (name === "convivium_submit_turn") {
            expect(agent).toBe(participant);
            const s = o.submissions[submitted]!;
            expect(input).toMatchObject({
                meetingId: "m",
                turnId: s.turnId,
                attemptId: s.attemptId,
                deliveryId: s.deliveryId,
                stepId: "step-" + submitted,
                agendaItemId: "agenda-agenda-1",
                content: scenario + ":a:" + (submitted + 1)
            });
            submitted++;
            return {
                meetingVersion: s.meetingVersion,
                result: {
                    messageId: s.messageId,
                    messageSeq: s.messageSeq,
                    meetingStatus:
                        fault === "terminal" && submitted === o.submissions.length
                            ? "completed"
                            : s.meetingStatus
                }
            };
        }
        if (name === "convivium_end_meeting") {
            ended = true;
            expect(input).toMatchObject({
                outcome: "completed",
                expectedMeetingVersion: 12,
                waivers: [],
                acceptedDecisionIds: [],
                deferredAgendaItemIds: []
            });
            return {
                result:
                    fault === "end"
                        ? { status: "partial", terminationCode: "max_turns" }
                        : o.endResult
            };
        }
        throw new Error("Unexpected tool " + name);
    });
    return {
        scenario,
        captain,
        callTool,
        nextCall: () => ++call,
        assert: createProbeSupport("unused").assert,
        createInput: createProbeSupport("unused").createInput,
        writeResult: vi.fn(async (result) => {
            validateScenarioResult(result, scenario);
        }),
        waitForSpeakerContext: vi.fn(async (_ctx, id, attempt) => {
            expect(id).toBe(participant.id);
            expect(attempt).toBe("a" + submitted);
            return {
                agent: participant,
                value: {
                    meetingId: fault === "context" ? "wrong" : "m",
                    turn: { id: "t" + submitted, seq: submitted + 1 },
                    step: { id: "step-" + submitted, participantId: "participant-a" },
                    attempt: { attemptId: attempt, deliveryId: "d" + submitted },
                    activeAgendaItem: { id: "agenda-agenda-1" },
                    objectiveContract:
                        fault === "criterion"
                            ? { acceptanceCriteria: [] }
                            : o.archived.archive.package.objectiveContract
                }
            };
        }),
        ctx: {
            tools: {
                execute: vi.fn(async (request) => {
                    late = true;
                    expect(request.agent).toBe(participant);
                    expect(request.arguments.input.deliveryId).toBe(
                        o.submissions.at(-1)!.deliveryId
                    );
                    if (fault === "throw") throw new Error("unrelated failure");
                    return fault === "late"
                        ? { value: { ok: true } }
                        : { value: { ok: false, error: { code: "ARCHIVED_MEETING" } } };
                })
            },
            agents: { get: () => (fault === "resident" ? participant : undefined) },
            subagents: { listChildren: vi.fn(async () => (fault === "children" ? [] : o.children)) }
        }
    };
}

describe("stalled convergence probe", () => {
    it("drives four formal submits and validates the complete observation", async () => {
        const runtime = harness();
        await runConvergenceStalledScenario(runtime);
        expect(runtime.writeResult).toHaveBeenCalledOnce();
        expect(
            runtime.callTool.mock.calls.filter((call) => call[2] === "convivium_submit_turn")
        ).toHaveLength(4);
        expect(
            runtime.callTool.mock.calls.some((call) => call[2] === "convivium_end_meeting")
        ).toBe(false);
    });
    it.each([
        "context",
        "stall",
        "replan",
        "terminal",
        "archive",
        "late",
        "changed",
        "children",
        "resident",
        "throw"
    ])("rejects %s before publishing success", async (fault) => {
        const runtime = harness("convergence-stalled", fault);
        await expect(runConvergenceStalledScenario(runtime)).rejects.toThrow();
        expect(runtime.writeResult).not.toHaveBeenCalled();
    });
});

describe("blocking question convergence probe", () => {
    it("submits a criterion-bound question and preserves its terminal identity", async () => {
        const runtime = harness("convergence-no-consensus");
        await runConvergenceNoConsensusScenario(runtime);
        const turns = runtime.callTool.mock.calls.filter(
            (call) => call[2] === "convivium_submit_turn"
        );
        expect(turns).toHaveLength(4);
        expect(turns[0]![3].changes).toEqual({
            questions: [
                {
                    text: "Unresolved smoke criterion",
                    blocking: true,
                    affectedOutputIds: [],
                    affectedCriterionIds: ["criterion-smoke-order"],
                    violatedConstraintIds: []
                }
            ]
        });
        expect(turns.slice(1).every((call) => Object.keys(call[3].changes).length === 0)).toBe(
            true
        );
        expect(runtime.writeResult).toHaveBeenCalledOnce();
    });
    it.each(["criterion", "question", "code"])("rejects %s", async (fault) => {
        const runtime = harness("convergence-no-consensus", fault);
        await expect(runConvergenceNoConsensusScenario(runtime)).rejects.toThrow();
        expect(runtime.writeResult).not.toHaveBeenCalled();
    });
});

describe("progress reset convergence probe", () => {
    it("adds only the fourth Proposal and observes both counter resets", async () => {
        const runtime = harness("convergence-reset");
        await runConvergenceResetScenario(runtime);
        const turns = runtime.callTool.mock.calls.filter(
            (call) => call[2] === "convivium_submit_turn"
        );
        expect(turns).toHaveLength(7);
        expect(turns[3]![3].changes).toEqual({
            proposals: [
                { title: "New structured progress", description: "A new proposal after replan" }
            ]
        });
        expect(
            turns
                .filter((_, index) => index !== 3)
                .every((call) => Object.keys(call[3].changes).length === 0)
        ).toBe(true);
        expect(runtime.writeResult).toHaveBeenCalledOnce();
    });
    it.each(["reset", "proposal"])("rejects %s", async (fault) => {
        const runtime = harness("convergence-reset", fault);
        await expect(runConvergenceResetScenario(runtime)).rejects.toThrow();
        expect(runtime.writeResult).not.toHaveBeenCalled();
    });
});

describe.each([
    {
        scenario: "convergence-turn-budget-completion" as const,
        run: runConvergenceTurnBudgetCompletionScenario
    },
    {
        scenario: "convergence-message-budget-completion" as const,
        run: runConvergenceMessageBudgetCompletionScenario
    }
])("$scenario probe", ({ scenario, run }) => {
    it("uses earlier evidence for legal completion then explicitly ends as Captain", async () => {
        const runtime = harness(scenario);
        await run(runtime);
        const turns = runtime.callTool.mock.calls.filter(
            (call) => call[2] === "convivium_submit_turn"
        );
        expect(turns).toHaveLength(2);
        expect(turns[0]![3]).not.toHaveProperty("completionClaims");
        expect(turns[1]![3]).toMatchObject({
            kind: "evidence",
            completionClaims: {
                criterionClaims: [
                    {
                        subjectId: "criterion-smoke-order",
                        evidenceMessageIds: ["message-d0"],
                        taskIds: []
                    }
                ],
                agendaResolution: {
                    agendaItemId: "agenda-agenda-1",
                    resolution: "Smoke criterion satisfied",
                    evidenceMessageIds: ["message-d0"]
                }
            }
        });
        expect(runtime.writeResult).toHaveBeenCalledOnce();
        expect(
            runtime.callTool.mock.calls.filter((call) => call[2] === "convivium_end_meeting")
        ).toHaveLength(1);
    });
    it.each(["terminal", "converging", "end", "fact", "criterion"])("rejects %s", async (fault) => {
        const runtime = harness(scenario, fault);
        await expect(run(runtime)).rejects.toThrow();
        expect(runtime.writeResult).not.toHaveBeenCalled();
    });
});
