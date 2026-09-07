import type { ArchivedMeetingStatusResultV1 } from "../../../src/protocol/types.js";

export type ConvergenceScenario =
    | "convergence-stalled"
    | "convergence-no-consensus"
    | "convergence-reset"
    | "convergence-turn-budget-completion"
    | "convergence-message-budget-completion";
export interface ConvergenceFixture {
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
export const fixtureCases: {
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
export function createConvergenceFixture(scenario: ConvergenceScenario): ConvergenceFixture {
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
