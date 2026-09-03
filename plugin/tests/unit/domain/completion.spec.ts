import { describe, expect, it } from "vitest";
import {
    applyCompletionClaims,
    judgeTurnCompletion,
    isObjectiveSatisfied,
    type CompletionFact,
    type MeetingState
} from "../../../src/domain/index.js";

const now = 1_700_000_000_000;

function state(overrides: Partial<MeetingState> = {}): MeetingState {
    return {
        id: "meeting-1",
        teamId: "team-1",
        status: "running",
        participants: [],
        manager: { promptVersion: "test", status: "idle" },
        agenda: [
            {
                id: "agenda-1",
                title: "Agenda",
                objective: "Objective",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipants: [],
                relatedTaskIds: [],
                status: "pending" as const
            }
        ],
        topic: "topic",
        objective: "objective",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [],
            hardConstraints: [],
            requiredReviewers: [],
            riskAcceptanceAuthority: [],
            acceptableRiskLevel: "low"
        },
        issues: [],
        agendaCandidates: [],
        transcript: [],
        proposals: [],
        decisionCandidates: [],
        decisions: [],
        openQuestions: [],
        handRaises: [],
        completionFacts: [],
        artifactRefs: [],
        continuationMaterials: [],
        turnSeq: 1,
        messageSeq: 1,
        eventSeq: 0,
        managerPlanningSeq: 0,
        stallCount: 0,
        replanCount: 0,
        selectionMode: "manager",
        limits: {
            maxTurns: 3,
            maxSpeakersPerTurn: 3,
            maxTotalMessages: 10,
            maxConsecutiveSpeechesPerSpeaker: 2,
            maxConsecutiveAttemptFailuresPerParticipant: 3,
            maxDeliveryRetries: 5,
            maxStalls: 3,
            maxReplans: 1
        },
        version: 1,
        createdAt: now - 1_000,
        updatedAt: now - 1_000,
        ...overrides
    };
}

describe("judgeTurnCompletion", () => {
    it("returns continue while the objective is open", () => {
        expect(judgeTurnCompletion(state(), now)).toEqual({ kind: "continue", reason: "continue" });
    });

    it("prioritizes objective completion over every hard limit", () => {
        const completed = state({
            turnSeq: 3,
            messageSeq: 10,
            objectiveContract: {
                requiredOutputs: [{ id: "output-1", description: "output", status: "accepted" }],
                acceptanceCriteria: [
                    { id: "criterion-1", description: "criterion", satisfied: true }
                ],
                hardConstraints: [],
                requiredReviewers: [],
                riskAcceptanceAuthority: [],
                acceptableRiskLevel: "low"
            },
            agenda: [
                {
                    id: "agenda-1",
                    title: "Agenda",
                    objective: "Objective",
                    inScope: [],
                    outOfScope: [],
                    completionCriteria: [],
                    requiredParticipants: [],
                    relatedTaskIds: [],
                    status: "resolved" as const
                }
            ],
            limits: { ...state().limits, maxDurationMs: 1 }
        });
        expect(judgeTurnCompletion(completed, now)).toEqual({
            kind: "completed",
            reason: "objective_satisfied"
        });
    });

    it("returns the first matching partial limit deterministically", () => {
        expect(judgeTurnCompletion(state({ turnSeq: 3 }), now).reason).toBe("max_turns");
        expect(judgeTurnCompletion(state({ messageSeq: 10 }), now).reason).toBe("message_limit");
        expect(
            judgeTurnCompletion(state({ limits: { ...state().limits, maxDurationMs: 1 } }), now)
                .reason
        ).toBe("time_limit");
    });
});

function completionState(overrides: Partial<MeetingState> = {}): MeetingState {
    const base = state();
    return state({
        participants: [
            {
                id: "reviewer-1",
                displayName: "Reviewer",
                status: "speaking",
                consecutiveSpeeches: 0,
                consecutiveAttemptFailures: 0,
                totalSpeeches: 0,
                lastDeliveredSeq: 0,
                lastAcknowledgedSeq: 0
            }
        ],
        objectiveContract: {
            requiredOutputs: [{ id: "output-1", description: "Output", status: "pending" }],
            acceptanceCriteria: [{ id: "criterion-1", description: "Criterion", satisfied: false }],
            hardConstraints: [{ id: "constraint-1", description: "Must remain safe" }],
            requiredReviewers: ["reviewer-1"],
            riskAcceptanceAuthority: ["reviewer-1"],
            acceptableRiskLevel: "medium"
        },
        agenda: [
            {
                id: "agenda-1",
                title: "Agenda",
                objective: "Objective",
                inScope: [],
                outOfScope: [],
                completionCriteria: ["output-1", "criterion-1"],
                requiredParticipants: [],
                relatedTaskIds: [],
                status: "discussing"
            }
        ],
        issues: [
            {
                id: "risk-1",
                title: "Risk",
                description: "Low risk",
                sourceMessageId: "message-1",
                affectedOutputIds: ["output-1"],
                affectedCriterionIds: [],
                violatedConstraintIds: [],
                blockingObjectionIds: [],
                blocking: true,
                riskLevel: "low",
                impact: "low",
                urgency: "later",
                reversibility: "reversible",
                safeDefaultAvailable: true,
                disposition: "blocking",
                status: "open",
                relatedTaskIds: []
            }
        ],
        openQuestions: [
            {
                id: "question-1",
                text: "Question",
                blocking: true,
                affectedOutputIds: ["output-1"],
                affectedCriterionIds: ["criterion-1"],
                violatedConstraintIds: ["constraint-1"],
                status: "open",
                askedBy: "reviewer-1",
                agendaItemId: "agenda-1",
                createdAt: now
            }
        ],
        transcript: [
            {
                id: "message-1",
                seq: 1,
                turnSeq: 1,
                turnId: "turn-1",
                stepId: "step-1",
                attemptId: "attempt-1",
                speaker: "reviewer-1",
                agendaItemId: "agenda-1",
                agendaRelation: "on_topic",
                content: "Evidence and answer",
                kind: "evidence",
                mentions: [],
                taskIds: [],
                createdAt: now
            }
        ],
        messageSeq: 1,
        limits: { ...base.limits, maxTurns: 4 },
        ...overrides
    });
}

const factId = (kind: CompletionFact["kind"], index: number) => `${kind}-${index}`;

describe("applyCompletionClaims", () => {
    it("creates immutable facts and derives completion state from valid claims", () => {
        const result = applyCompletionClaims(completionState(), {
            participantId: "reviewer-1",
            authorizedTaskIds: [],
            now,
            factId,
            claims: {
                outputClaims: [
                    { subjectId: "output-1", evidenceMessageIds: ["message-1"], taskIds: [] }
                ],
                criterionClaims: [
                    { subjectId: "criterion-1", evidenceMessageIds: ["message-1"], taskIds: [] }
                ],
                review: {
                    outputId: "output-1",
                    result: "approved",
                    reason: "Reviewed",
                    evidenceMessageIds: ["message-1"]
                },
                questionResolutions: [{ questionId: "question-1", answerMessageId: "message-1" }],
                agendaResolution: {
                    agendaItemId: "agenda-1",
                    resolution: "Resolved",
                    evidenceMessageIds: ["message-1"]
                },
                riskAcceptance: {
                    issueId: "risk-1",
                    decision: "accept",
                    reason: "Within tolerance",
                    evidenceMessageIds: ["message-1"]
                }
            }
        });

        expect(result.state.objectiveContract.requiredOutputs[0]?.status).toBe("accepted");
        expect(result.state.objectiveContract.acceptanceCriteria[0]?.satisfied).toBe(true);
        expect(result.state.agenda[0]).toMatchObject({
            status: "resolved",
            resolution: "Resolved"
        });
        expect(result.state.openQuestions[0]?.status).toBe("answered");
        expect(result.state.openQuestions[0]?.answerMessageId).toBe("message-1");
        expect(result.state.openQuestions[0]).toMatchObject({
            affectedOutputIds: ["output-1"],
            affectedCriterionIds: ["criterion-1"],
            violatedConstraintIds: ["constraint-1"]
        });
        expect(result.state.issues[0]).toMatchObject({
            status: "accepted_risk",
            disposition: "accepted_risk"
        });
        expect(result.state.completionFacts).toHaveLength(6);
        expect(result.state.completionFacts.every(({ status }) => status === "active")).toBe(true);
        expect(result.effect.events).toHaveLength(7);
        expect(result.effect.events.map(({ type }) => type)).toEqual([
            "question.answered",
            "completion_fact.added",
            "completion_fact.added",
            "completion_fact.added",
            "completion_fact.added",
            "completion_fact.added",
            "completion_fact.added"
        ]);
        expect(judgeTurnCompletion(result.state, now)).toEqual({
            kind: "completed",
            reason: "objective_satisfied"
        });
    });

    it("does not block completion for an open non-blocking question", () => {
        const source = completionState();
        source.objectiveContract.requiredOutputs[0]!.status = "accepted";
        source.objectiveContract.acceptanceCriteria[0]!.satisfied = true;
        source.agenda[0]!.status = "resolved";
        source.issues[0]!.status = "accepted_risk";
        source.issues[0]!.disposition = "accepted_risk";
        source.completionFacts.push({
            id: "review-1",
            kind: "review",
            subjectId: "output-1",
            assertedBy: "reviewer-1",
            authority: "required_reviewer",
            result: "approved",
            evidenceMessageIds: ["message-1"],
            taskIds: [],
            reason: "Reviewed",
            status: "active",
            createdAt: now
        });
        source.openQuestions[0]!.blocking = false;

        expect(isObjectiveSatisfied(source)).toBe(true);
    });

    it("rejects invalid claims without mutating the source state", () => {
        const source = completionState();
        expect(() =>
            applyCompletionClaims(source, {
                participantId: "reviewer-1",
                authorizedTaskIds: [],
                now,
                factId,
                claims: {
                    outputClaims: [
                        {
                            subjectId: "other-meeting-output",
                            evidenceMessageIds: ["message-1"],
                            taskIds: []
                        }
                    ]
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
        expect(source.objectiveContract.requiredOutputs[0]?.status).toBe("pending");
        expect(source.completionFacts).toEqual([]);
    });

    it("rejects unknown evidence, unauthorized task evidence and reviewer authority", () => {
        const source = completionState();
        const context = {
            participantId: "reviewer-1",
            authorizedTaskIds: [] as string[],
            now,
            factId
        };
        expect(() =>
            applyCompletionClaims(source, {
                ...context,
                claims: {
                    outputClaims: [
                        { subjectId: "output-1", evidenceMessageIds: ["unknown"], taskIds: [] }
                    ]
                }
            })
        ).toThrow();
        expect(() =>
            applyCompletionClaims(source, {
                ...context,
                claims: {
                    outputClaims: [
                        { subjectId: "output-1", evidenceMessageIds: [], taskIds: ["task-1"] }
                    ]
                }
            })
        ).toThrow();
        expect(() =>
            applyCompletionClaims(
                {
                    ...source,
                    participants: [
                        ...source.participants,
                        { ...source.participants[0]!, id: "participant-2" }
                    ]
                },
                {
                    ...context,
                    participantId: "participant-2",
                    claims: {
                        review: {
                            outputId: "output-1",
                            result: "approved",
                            reason: "Not authorized",
                            evidenceMessageIds: ["message-1"]
                        }
                    }
                }
            )
        ).toThrow();
    });

    it("supersedes the caller's prior fact and lets changes-required reopen an output", () => {
        const first = applyCompletionClaims(completionState(), {
            participantId: "reviewer-1",
            authorizedTaskIds: [],
            now,
            factId: (_kind, index) => `first-${index}`,
            claims: {
                outputClaims: [
                    { subjectId: "output-1", evidenceMessageIds: ["message-1"], taskIds: [] }
                ],
                review: {
                    outputId: "output-1",
                    result: "approved",
                    reason: "Approved",
                    evidenceMessageIds: ["message-1"]
                }
            }
        });
        const second = applyCompletionClaims(first.state, {
            participantId: "reviewer-1",
            authorizedTaskIds: [],
            now: now + 1,
            factId: (_kind, index) => `second-${index}`,
            claims: {
                review: {
                    outputId: "output-1",
                    result: "changes_required",
                    reason: "Regression found",
                    evidenceMessageIds: ["message-1"]
                }
            }
        });

        expect(second.state.objectiveContract.requiredOutputs[0]?.status).toBe("pending");
        expect(second.state.completionFacts.find(({ id }) => id === "first-0")?.status).toBe(
            "superseded"
        );
        expect(second.state.completionFacts.find(({ id }) => id === "first-1")?.status).toBe(
            "superseded"
        );
        expect(second.state.completionFacts.find(({ id }) => id === "second-0")?.result).toBe(
            "changes_required"
        );
    });

    it("rejects risk acceptance that violates a hard constraint", () => {
        const source = completionState();
        source.issues[0] = { ...source.issues[0]!, violatedConstraintIds: ["constraint-1"] };
        expect(() =>
            applyCompletionClaims(source, {
                participantId: "reviewer-1",
                authorizedTaskIds: [],
                now,
                factId,
                claims: {
                    riskAcceptance: {
                        issueId: "risk-1",
                        decision: "accept",
                        reason: "Unsafe",
                        evidenceMessageIds: ["message-1"]
                    }
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
        expect(source.issues[0]?.status).toBe("open");
    });

    it("allows Captain risk authority without requiring a Participant identity", () => {
        const result = applyCompletionClaims(completionState(), {
            participantId: "captain",
            assertedBy: "captain:captain-session",
            riskAuthority: true,
            authorizedTaskIds: [],
            now,
            factId,
            claims: {
                riskAcceptance: {
                    issueId: "risk-1",
                    decision: "accept",
                    reason: "Captain accepted the bounded risk.",
                    evidenceMessageIds: ["message-1"]
                }
            }
        });

        expect(result.state.issues[0]).toMatchObject({
            status: "accepted_risk",
            disposition: "accepted_risk"
        });
        expect(result.state.completionFacts.at(-1)).toMatchObject({
            assertedBy: "captain:captain-session",
            authority: "captain",
            result: "accepted"
        });
    });

    it("returns lifecycle error codes for Captain risk authority in terminal states", () => {
        for (const status of [
            "completed",
            "partial",
            "no_consensus",
            "cancelled",
            "failed",
            "archiving"
        ] as const) {
            const source = completionState({ status });
            const before = structuredClone(source);
            expect(() =>
                applyCompletionClaims(source, {
                    participantId: "captain",
                    assertedBy: "captain:captain-session",
                    riskAuthority: true,
                    authorizedTaskIds: [],
                    now,
                    factId,
                    claims: {
                        riskAcceptance: {
                            issueId: "risk-1",
                            decision: "accept",
                            reason: "Captain accepted the bounded risk.",
                            evidenceMessageIds: ["message-1"]
                        }
                    }
                })
            ).toThrowError(expect.objectContaining({ code: "IMMUTABLE_MEETING" }));
            expect(source).toEqual(before);
        }

        const archived = completionState({ status: "archived" });
        const before = structuredClone(archived);
        expect(() =>
            applyCompletionClaims(archived, {
                participantId: "captain",
                assertedBy: "captain:captain-session",
                riskAuthority: true,
                authorizedTaskIds: [],
                now,
                factId,
                claims: {
                    riskAcceptance: {
                        issueId: "risk-1",
                        decision: "accept",
                        reason: "Captain accepted the bounded risk.",
                        evidenceMessageIds: ["message-1"]
                    }
                }
            })
        ).toThrowError(expect.objectContaining({ code: "ARCHIVED_MEETING" }));
        expect(archived).toEqual(before);
    });

    it("does not let non-Participant risk authority submit Participant completion claims", () => {
        expect(() =>
            applyCompletionClaims(completionState(), {
                participantId: "captain",
                assertedBy: "captain:captain-session",
                riskAuthority: true,
                authorizedTaskIds: [],
                now,
                factId,
                claims: {
                    outputClaims: [
                        {
                            subjectId: "output-1",
                            evidenceMessageIds: ["message-1"],
                            taskIds: []
                        }
                    ],
                    riskAcceptance: {
                        issueId: "risk-1",
                        decision: "accept",
                        reason: "Captain accepted the bounded risk.",
                        evidenceMessageIds: ["message-1"]
                    }
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("restores a blocking issue when risk acceptance is later rejected", () => {
        const accepted = applyCompletionClaims(completionState(), {
            participantId: "reviewer-1",
            authorizedTaskIds: [],
            now,
            factId,
            claims: {
                riskAcceptance: {
                    issueId: "risk-1",
                    decision: "accept",
                    reason: "Accepted temporarily",
                    evidenceMessageIds: ["message-1"]
                }
            }
        });
        const rejected = applyCompletionClaims(accepted.state, {
            participantId: "reviewer-1",
            authorizedTaskIds: [],
            now: now + 1,
            factId,
            claims: {
                riskAcceptance: {
                    issueId: "risk-1",
                    decision: "reject",
                    reason: "Rejection supersedes acceptance",
                    evidenceMessageIds: ["message-1"]
                }
            }
        });

        expect(rejected.state.issues[0]).toMatchObject({
            status: "open",
            disposition: "blocking"
        });
        expect(rejected.state.completionFacts).toContainEqual(
            expect.objectContaining({ result: "rejected", status: "active" })
        );
    });
});
