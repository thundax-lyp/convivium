import { describe, expect, it } from "vitest";
import { validateScenarioResult } from "../../../scripts/smoke-profile/index.mjs";
import type { ArchivedMeetingStatusResultV1 } from "../../../src/protocol/types.js";
import { MeetingStatusResultSchema } from "../../../src/protocol/status.js";

type ConvergenceScenario =
    | "convergence-stalled"
    | "convergence-no-consensus"
    | "convergence-reset"
    | "convergence-turn-budget-completion"
    | "convergence-message-budget-completion";
interface ConvergenceFixture {
    ok: true;
    scenario: ConvergenceScenario;
    assertions: string[];
    meetingId: string;
    observed: {
        submissions: {
            turnId: string;
            turnSeq: number;
            attemptId: string;
            deliveryId: string;
            messageId: string;
            messageSeq: number;
            meetingVersion: number;
            meetingStatus: string;
        }[];
        checkpoints: {
            afterSubmission: number;
            meetingVersion: number;
            status: "running" | "converging";
            stallCount: number;
            maxStalls: 3;
            replanCount: number;
            maxReplans: 1;
            nextTurnId: string | null;
            intent: string | null;
            reason: string | null;
        }[];
        questionId: string | null;
        proposalId: string | null;
        endResult: { status: "completed"; terminationCode: "objective_satisfied" } | null;
        archived: ArchivedMeetingStatusResultV1;
        archivedVersion: number;
        lateSubmit: { kind: "protocol" | "tool"; code: string };
        stableAfterLateSubmit: boolean;
        children: { id: string; mode: "continuable"; activity: "inactive" }[];
        residentSessionIds: string[];
    };
}
const fixtureCases: {
    scenario: ConvergenceScenario;
    count: number;
    checkpointCount: number;
    outcome: string;
    code: string;
    maxTurns: number;
    maxMessages: number;
}[] = [
    {
        scenario: "convergence-stalled",
        count: 4,
        checkpointCount: 3,
        outcome: "partial",
        code: "stalled",
        maxTurns: 10,
        maxMessages: 100
    },
    {
        scenario: "convergence-no-consensus",
        count: 4,
        checkpointCount: 3,
        outcome: "no_consensus",
        code: "no_consensus",
        maxTurns: 10,
        maxMessages: 100
    },
    {
        scenario: "convergence-reset",
        count: 7,
        checkpointCount: 6,
        outcome: "partial",
        code: "stalled",
        maxTurns: 10,
        maxMessages: 100
    },
    {
        scenario: "convergence-turn-budget-completion",
        count: 2,
        checkpointCount: 2,
        outcome: "converging",
        code: "objective_satisfied",
        maxTurns: 2,
        maxMessages: 100
    },
    {
        scenario: "convergence-message-budget-completion",
        count: 2,
        checkpointCount: 2,
        outcome: "converging",
        code: "objective_satisfied",
        maxTurns: 10,
        maxMessages: 2
    }
];
function createConvergenceFixture(scenario: ConvergenceScenario): ConvergenceFixture {
    const c = fixtureCases.find((c) => c.scenario === scenario);
    if (!c) throw new Error("Missing fixture specification");
    const budget = c.count === 2,
        question = scenario === "convergence-no-consensus",
        reset = scenario === "convergence-reset",
        now = 1700000000000;
    const termination = {
        code: c.code,
        reason: c.code,
        decisionIds: [],
        unresolvedQuestionIds: question ? ["question-d0-1"] : []
    };
    const submissions = Array.from({ length: c.count }, (_, i) => ({
        turnId: "t" + i,
        turnSeq: i + 1,
        attemptId: "a" + i,
        deliveryId: "d" + i,
        messageId: "message-d" + i,
        messageSeq: i + 1,
        meetingVersion: 11 + i,
        meetingStatus: i === c.count - 1 ? c.outcome : "running"
    }));
    return {
        ok: true,
        scenario,
        meetingId: "m",
        assertions: [
            ...(budget
                ? [
                      "last-valid-turn-before-budget",
                      "business-completion-before-budget",
                      "captain-completed-after-converging"
                  ]
                : [
                      "first-progress-baseline",
                      "refocus-observed",
                      "replan-observed",
                      ...(reset
                          ? [
                                "progress-resets-both-counters",
                                "refocus-after-reset",
                                "replan-after-reset"
                            ]
                          : []),
                      question ? "blocking-question-no-consensus" : "partial-stalled"
                  ]),
            "terminal-submit-rejected",
            "archive-consistent",
            "sessions-drained"
        ],
        observed: {
            submissions,
            checkpoints: Array.from({ length: c.checkpointCount }, (_, i) => ({
                afterSubmission: i + 1,
                meetingVersion: 11 + i,
                status: budget && i === 1 ? "converging" : "running",
                stallCount: budget && i === 1 ? 0 : i % 3,
                maxStalls: 3,
                replanCount: budget && i === 1 ? 0 : i % 3 === 2 ? 1 : 0,
                maxReplans: 1,
                nextTurnId: budget && i === 1 ? null : "t" + (i + 1),
                intent: budget && i === 1 ? null : i % 3 === 0 ? "explore" : "refocus",
                reason: budget && i === 1 ? null : ["explore", "refocus", "replan"][i % 3]
            })),
            questionId: question ? "question-d0-1" : null,
            proposalId: reset ? "d3-proposal-1" : null,
            endResult: budget
                ? { status: "completed", terminationCode: "objective_satisfied" }
                : null,
            archivedVersion: 20 + c.count,
            lateSubmit: { kind: "protocol", code: "ARCHIVED_MEETING" },
            stableAfterLateSubmit: true,
            children: [
                { id: "m-manager-manager", mode: "continuable", activity: "inactive" },
                { id: "m-participant-participant-a", mode: "continuable", activity: "inactive" }
            ],
            residentSessionIds: [],
            archived: {
                meetingId: "m",
                meetingVersion: 20 + c.count,
                topic: "Convergence fixture",
                objective: "Verify convergence",
                continuationMaterials: [],
                limits: {
                    maxTurns: c.maxTurns,
                    maxSpeakersPerTurn: 1,
                    maxTotalMessages: c.maxMessages
                },
                meetingTasks: [],
                status: "archived",
                pendingHandRaises: [],
                pauseControl: { action: "none" },
                termination: structuredClone(termination),
                archive: {
                    archivedAt: now + 102,
                    package: {
                        schemaVersion: 1,
                        meetingId: "m",
                        teamId: "smoke-team",
                        finalSummary: c.code,
                        endedAt: now + 100,
                        materializedAt: now + 101,
                        objectiveContract: {
                            requiredOutputs: [],
                            acceptanceCriteria: [
                                {
                                    id: "criterion-smoke-order",
                                    description: "Smoke criterion",
                                    satisfied: budget
                                }
                            ],
                            hardConstraints: [],
                            requiredReviewers: [],
                            riskAcceptanceAuthority: [],
                            acceptableRiskLevel: "low"
                        },
                        agenda: [
                            {
                                id: "agenda-agenda-1",
                                title: "Smoke agenda",
                                objective: "Verify convergence",
                                inScope: ["convergence"],
                                outOfScope: [],
                                completionCriteria: ["criterion-smoke-order"],
                                requiredParticipants: ["participant-a"],
                                relatedTaskIds: [],
                                status: budget ? "resolved" : "discussing",
                                ...(budget ? { resolution: "Smoke criterion satisfied" } : {})
                            }
                        ],
                        artifactRefs: [],
                        acceptedDecisions: [],
                        decisionHistory: [],
                        issues: [],
                        parkingLot: [],
                        participantProvenance: [
                            { participantId: "participant-a", displayName: "A" }
                        ],
                        termination: structuredClone(termination),
                        formalTranscript: Array.from({ length: c.count }, (_, i) => ({
                            id: "message-d" + i,
                            seq: i + 1,
                            turnId: "t" + i,
                            stepId: "step-" + i,
                            speaker: "participant-a",
                            agendaItemId: "agenda-agenda-1",
                            kind: budget && i === 1 ? "evidence" : "statement",
                            content: scenario + ":a:" + (i + 1),
                            mentions: [],
                            taskIds: [],
                            createdAt: now + i
                        })),
                        unresolvedQuestions: question
                            ? [
                                  {
                                      id: "question-d0-1",
                                      text: "Unresolved smoke criterion",
                                      askedBy: "participant-a",
                                      agendaItemId: "agenda-agenda-1",
                                      blocking: true,
                                      affectedOutputIds: [],
                                      affectedCriterionIds: ["criterion-smoke-order"],
                                      violatedConstraintIds: [],
                                      status: "open"
                                  }
                              ]
                            : [],
                        proposals: reset
                            ? [
                                  {
                                      id: "d3-proposal-1",
                                      agendaItemId: "agenda-agenda-1",
                                      title: "New structured progress",
                                      description: "A new proposal after replan",
                                      revision: 1,
                                      status: "draft",
                                      positions: []
                                  }
                              ]
                            : [],
                        completionFacts: budget
                            ? [
                                  {
                                      id: "fact-criterion",
                                      kind: "criterion_evidence",
                                      subjectId: "criterion-smoke-order",
                                      assertedBy: "participant-a",
                                      result: "supported",
                                      evidenceMessageIds: ["message-d0"],
                                      taskIds: [],
                                      status: "active"
                                  },
                                  {
                                      id: "fact-agenda",
                                      kind: "agenda_resolution",
                                      subjectId: "agenda-agenda-1",
                                      assertedBy: "participant-a",
                                      result: "resolved",
                                      evidenceMessageIds: ["message-d0"],
                                      taskIds: [],
                                      status: "active",
                                      reason: "Smoke criterion satisfied"
                                  }
                              ]
                            : []
                    }
                }
            }
        }
    };
}
function assertFixtureContract(fixture: ConvergenceFixture): void {
    const { observed: o } = fixture,
        a = o.archived,
        p = a.archive.package;
    expect(() => MeetingStatusResultSchema({ ...a })).not.toThrow();
    expect(a).toMatchObject({
        meetingId: "m",
        topic: "Convergence fixture",
        objective: "Verify convergence",
        status: "archived",
        pauseControl: { action: "none" },
        meetingTasks: [],
        pendingHandRaises: [],
        continuationMaterials: []
    });
    expect(p).toMatchObject({
        schemaVersion: 1,
        meetingId: "m",
        teamId: "smoke-team",
        endedAt: 1700000000100,
        materializedAt: 1700000000101,
        artifactRefs: [],
        acceptedDecisions: [],
        decisionHistory: [],
        issues: [],
        parkingLot: [],
        participantProvenance: [{ participantId: "participant-a", displayName: "A" }]
    });
    expect(a.archive.archivedAt).toBe(1700000000102);
    expect(Object.hasOwn(p, "archivedAt")).toBe(false);
    expect(o.archivedVersion).toBe(a.meetingVersion);
    expect(a.termination).toEqual(p.termination);
    expect(a.termination).not.toBe(p.termination);
    for (const [i, message] of p.formalTranscript.entries()) {
        expect(message).toEqual({
            id: "message-d" + i,
            seq: i + 1,
            turnId: "t" + i,
            stepId: "step-" + i,
            speaker: "participant-a",
            agendaItemId: "agenda-agenda-1",
            kind: o.endResult && i === 1 ? "evidence" : "statement",
            content: fixture.scenario + ":a:" + (i + 1),
            mentions: [],
            taskIds: [],
            createdAt: 1700000000000 + i
        });
        expect(o.submissions[i]).toMatchObject({
            messageId: message.id,
            messageSeq: message.seq,
            turnId: message.turnId,
            turnSeq: i + 1,
            attemptId: "a" + i,
            deliveryId: "d" + i,
            meetingVersion: 11 + i
        });
    }
    expect(o.children).toEqual([
        { id: "m-manager-manager", mode: "continuable", activity: "inactive" },
        { id: "m-participant-participant-a", mode: "continuable", activity: "inactive" }
    ]);
    expect(o.residentSessionIds).toEqual([]);
}
function mutateFixture(
    fixture: ConvergenceFixture,
    path: readonly (string | number)[],
    operation: "delete" | "replace",
    replacement?: unknown
): unknown {
    const copy = structuredClone(fixture);
    let parent: unknown = copy;
    for (const key of path.slice(0, -1)) {
        if (typeof parent !== "object" || parent === null) throw new Error("Invalid mutation path");
        parent = Reflect.get(parent, key);
    }
    const key = path.at(-1);
    if (typeof parent !== "object" || parent === null || key === undefined)
        throw new Error("Invalid mutation path");
    if (operation === "delete") Reflect.deleteProperty(parent, key);
    else Reflect.set(parent, key, replacement);
    return copy;
}
describe("convergence fixture contract", () => {
    it.each(fixtureCases)("constructs independent $scenario DTO", (c) => {
        const f = createConvergenceFixture(c.scenario);
        assertFixtureContract(f);
        const o = f.observed,
            p = o.archived.archive.package;
        expect(o.submissions).toHaveLength(c.count);
        expect(o.checkpoints).toHaveLength(c.checkpointCount);
        expect(o.submissions.at(-1)?.meetingStatus).toBe(c.outcome);
        expect(o.archived.termination.code).toBe(c.code);
        expect(o.archived.limits).toEqual({
            maxTurns: c.maxTurns,
            maxSpeakersPerTurn: 1,
            maxTotalMessages: c.maxMessages
        });
        expect(o.archivedVersion).toBe(20 + c.count);
        const q = c.scenario === "convergence-no-consensus",
            r = c.scenario === "convergence-reset",
            b = c.count === 2;
        expect(o.questionId).toBe(q ? "question-d0-1" : null);
        expect(o.proposalId).toBe(r ? "d3-proposal-1" : null);
        expect(p.unresolvedQuestions).toHaveLength(q ? 1 : 0);
        if (q)
            expect(p.unresolvedQuestions[0]).toMatchObject({
                id: "question-d0-1",
                status: "open",
                blocking: true,
                askedBy: "participant-a",
                affectedCriterionIds: ["criterion-smoke-order"]
            });
        expect(p.proposals).toHaveLength(r ? 1 : 0);
        if (r) expect(p.proposals[0]).toMatchObject({ id: "d3-proposal-1", revision: 1 });
        expect(p.objectiveContract.acceptanceCriteria).toEqual([
            { id: "criterion-smoke-order", description: "Smoke criterion", satisfied: b }
        ]);
        expect(p.agenda[0]?.status).toBe(b ? "resolved" : "discussing");
        expect(
            p.completionFacts.map((f) => [f.kind, f.result, f.status, f.evidenceMessageIds])
        ).toEqual(
            b
                ? [
                      ["criterion_evidence", "supported", "active", ["message-d0"]],
                      ["agenda_resolution", "resolved", "active", ["message-d0"]]
                  ]
                : []
        );
        const before = JSON.stringify(f);
        mutateFixture(
            f,
            ["observed", "archived", "archive", "package", "formalTranscript", 0, "id"],
            "replace",
            "changed"
        );
        expect(JSON.stringify(f)).toBe(before);
        expect(createConvergenceFixture(c.scenario)).toEqual(f);
    });
});

describe("meeting convergence smoke profile", () => {
    it("requires the complete convergence assertion set", () => {
        expect(() =>
            validateScenarioResult({ ok: true, scenario: "unknown", assertions: [] }, "unknown")
        ).not.toThrow();
        expect(() =>
            validateScenarioResult(
                {
                    ok: true,
                    scenario: "convergence",
                    assertions: [
                        "deterministic-fallback",
                        "fallback-replay-idempotent",
                        "fallback-status-projected"
                    ]
                },
                "convergence"
            )
        ).not.toThrow();
        expect(() =>
            validateScenarioResult(
                { ok: true, scenario: "convergence", assertions: ["deterministic-fallback"] },
                "convergence"
            )
        ).toThrow("Convergence smoke assertions are incomplete.");
    });
});
