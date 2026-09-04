import type { MeetingState } from "../../src/domain/model.js";
import {
    projectManagerMeetingContext,
    projectMeetingStatus,
    projectSpeakerMeetingContext
} from "../../src/projection/index.js";
import { MeetingStatusResultSchema } from "../../src/protocol/index.js";
import { describe, expect, it } from "vitest";

const state = {
    formatVersion: 2,
    id: "meeting-1",
    teamId: "team-1",
    status: "running",
    topic: "Release",
    objective: "Decide scope",
    objectiveContract: {},
    continuationMaterials: [],
    limits: {
        maxTurns: 3,
        maxSpeakersPerTurn: 2,
        maxTotalMessages: 8,
        maxStalls: 3,
        maxReplans: 1
    },
    stallCount: 0,
    replanCount: 0,
    version: 2,
    agenda: [],
    transcript: [],
    openQuestions: [],
    proposals: [],
    decisionCandidates: [],
    decisions: [],
    issues: [],
    handRaises: [],
    attendanceRecommendations: [],
    meetingTasks: [],
    currentTurn: undefined,
    manager: {
        status: "planning",
        currentPlanningAttempt: {
            id: "planning-1",
            deliveryId: "delivery-1",
            catalogBinding: { kind: "none" }
        }
    },
    outbox: { leaseToken: "secret" }
} as unknown as MeetingState;

describe("meeting status projection", () => {
    it("projects only the safe Catalog fields into Manager context", () => {
        const projected = projectManagerMeetingContext(
            {
                ...state,
                activeAgendaItemId: "agenda-1",
                agenda: [
                    {
                        id: "agenda-1",
                        title: "Scope",
                        objective: "Agree scope",
                        inScope: [],
                        outOfScope: [],
                        completionCriteria: [],
                        requiredParticipants: [],
                        relatedTaskIds: [],
                        status: "discussing"
                    }
                ],
                manager: {
                    ...state.manager,
                    currentPlanningAttempt: {
                        ...state.manager.currentPlanningAttempt!,
                        catalogBinding: {
                            kind: "verified",
                            snapshot: {
                                protocolVersion: 1,
                                catalogId: "catalog-1",
                                catalogVersion: "v1",
                                teamId: "team-1",
                                capturedAt: 1,
                                roles: [
                                    {
                                        roleDefinitionId: "domain_architect",
                                        version: "1",
                                        displayName: "Generalist",
                                        summary: "General support",
                                        expertiseTags: ["review"],
                                        evidenceScopes: [],
                                        responsibilities: ["Review"],
                                        nonResponsibilities: []
                                    }
                                ],
                                candidates: [
                                    {
                                        candidateId: "candidate-1",
                                        roleDefinitionId: "domain_architect",
                                        roleDefinitionVersion: "1",
                                        sourceMemberName: "private-member",
                                        agentDefinitionId: "private-definition",
                                        availability: "available"
                                    }
                                ]
                            }
                        }
                    }
                }
            } as MeetingState,
            []
        );

        expect(projected.agentCatalog).toEqual({
            protocolVersion: 1,
            catalogId: "catalog-1",
            catalogVersion: "v1",
            candidates: [
                {
                    candidateId: "candidate-1",
                    roleDefinitionId: "domain_architect",
                    roleDefinitionVersion: "1",
                    displayName: "Generalist",
                    summary: "General support",
                    expertiseTags: ["review"],
                    evidenceScopes: [],
                    responsibilities: ["Review"],
                    nonResponsibilities: [],
                    availability: "available"
                }
            ],
            researchNeeds: []
        });
        expect(JSON.stringify(projected.agentCatalog)).not.toMatch(
            /sourceMemberName|agentDefinitionId|session|prompt|model|credential|preset|skill|tool|mcp/i
        );
    });

    it("projects pending recommendations in canonical order for an authorized Agent caller", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                attendanceRecommendations: [
                    {
                        id: "recommendation-2",
                        candidateId: "candidate-2",
                        roleDefinitionId: "runtime_engineer",
                        roleDefinitionVersion: "1",
                        displayName: "Runtime Engineer",
                        agentDefinitionId: "private-definition-2",
                        agendaItemId: "agenda-1",
                        rationale: "Second",
                        expectedContribution: "Review runtime",
                        evidenceGapIds: [],
                        urgency: "later_agenda",
                        recommendedByManagerSessionId: "manager-1",
                        catalogId: "catalog-1",
                        catalogVersion: "v1",
                        planningAttemptId: "planning-1",
                        status: "pending",
                        createdAt: 1
                    },
                    {
                        id: "recommendation-1",
                        candidateId: "candidate-1",
                        roleDefinitionId: "domain_architect",
                        roleDefinitionVersion: "1",
                        displayName: "Domain Architect",
                        agentDefinitionId: "private-definition-1",
                        agendaItemId: "agenda-1",
                        rationale: "First",
                        expectedContribution: "Review design",
                        evidenceGapIds: [],
                        urgency: "current_agenda",
                        recommendedByManagerSessionId: "manager-1",
                        catalogId: "catalog-1",
                        catalogVersion: "v1",
                        planningAttemptId: "planning-1",
                        status: "pending",
                        createdAt: 2
                    }
                ]
            } as MeetingState,
            { kind: "captain", sessionId: "captain-1" }
        );
        expect(projected).toMatchObject({
            attendanceRecommendations: [
                { recommendationId: "recommendation-2" },
                { recommendationId: "recommendation-1" }
            ]
        });
        expect(JSON.stringify(projected.attendanceRecommendations)).not.toMatch(
            /agentDefinitionId|recommendedByManagerSessionId|catalogId|catalogVersion|planningAttemptId/i
        );
    });

    it("projects question facts without inventing optional fields", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                openQuestions: [
                    {
                        id: "question-1",
                        text: "Question",
                        askedBy: "participant-1",
                        agendaItemId: "agenda-1",
                        blocking: false,
                        status: "open",
                        createdAt: 1
                    }
                ]
            } as MeetingState,
            { kind: "participant", sessionId: "session-1", participantId: "participant-1" }
        );

        expect(projected).toMatchObject({ questions: [{ id: "question-1", blocking: false }] });
        expect(projected.questions?.[0]).not.toHaveProperty("directedTo");
        expect(projected.questions?.[0]).not.toHaveProperty("answerMessageId");
    });

    it("projects canonical blocking-question evidence arrays", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                openQuestions: [
                    {
                        id: "question-1",
                        text: "Question",
                        askedBy: "participant-1",
                        agendaItemId: "agenda-1",
                        blocking: true,
                        affectedOutputIds: ["output-1"],
                        affectedCriterionIds: ["criterion-1"],
                        violatedConstraintIds: ["constraint-1"],
                        status: "open",
                        createdAt: 1
                    }
                ]
            } as MeetingState,
            { kind: "participant", sessionId: "session-1", participantId: "participant-1" }
        );

        expect(projected.questions).toEqual([
            {
                id: "question-1",
                text: "Question",
                askedBy: "participant-1",
                agendaItemId: "agenda-1",
                blocking: true,
                affectedOutputIds: ["output-1"],
                affectedCriterionIds: ["criterion-1"],
                violatedConstraintIds: ["constraint-1"],
                status: "open"
            }
        ]);
    });

    it("maps only public canonical meeting facts", () => {
        const projected = projectMeetingStatus(state, {
            kind: "participant",
            sessionId: "session-1",
            participantId: "participant-1"
        });

        expect(projected).toMatchObject({
            meetingId: "meeting-1",
            meetingVersion: 2,
            status: "running",
            limits: { maxTurns: 3 },
            stallCount: 0,
            maxStalls: 3,
            replanCount: 0,
            maxReplans: 1
        });
        expect(JSON.stringify(projected)).not.toContain("session-1");
        expect(JSON.stringify(projected)).not.toContain("capability");
        expect(JSON.stringify(projected)).not.toContain("prompt");
        expect(projected).not.toHaveProperty("currentTurn");
        expect(projected).not.toHaveProperty("currentSpeakerId");
        expect(JSON.stringify(projected)).not.toContain("planning-1");
        expect(JSON.stringify(projected)).not.toContain("leaseToken");
    });

    it("projects target-owned continuation materials into the exact speaker attempt", () => {
        const projected = projectSpeakerMeetingContext(
            {
                ...state,
                objectiveContract: {
                    requiredOutputs: [],
                    acceptanceCriteria: [],
                    hardConstraints: [],
                    requiredReviewers: [],
                    riskAcceptanceAuthority: [],
                    acceptableRiskLevel: "low"
                },
                agenda: [
                    {
                        id: "agenda-1",
                        title: "Scope",
                        objective: "Decide scope",
                        inScope: ["target only"],
                        outOfScope: [],
                        completionCriteria: [],
                        requiredParticipants: ["participant-1"],
                        relatedTaskIds: [],
                        status: "discussing"
                    }
                ],
                continuationMaterials: [
                    {
                        sourceMeetingId: "source-1",
                        sourceKind: "artifact",
                        sourceObjectId: "artifact-1",
                        summary: "Selected artifact only",
                        checksum: "sha256:artifact-1"
                    }
                ],
                currentTurn: {
                    id: "turn-1",
                    seq: 1,
                    agendaItemId: "agenda-1",
                    intent: "explore",
                    reason: "initial_plan",
                    objective: "Decide scope",
                    expectedOutputs: [],
                    prohibitedTopics: [],
                    status: "running",
                    currentStepIndex: 0,
                    steps: [
                        {
                            id: "step-1",
                            speaker: "participant-1",
                            instruction: "Review selected material",
                            reason: "rule_score",
                            status: "running",
                            attempt: {
                                attemptId: "attempt-1",
                                participantId: "participant-1",
                                meetingId: "meeting-1",
                                turnId: "turn-1",
                                stepId: "step-1",
                                deliveryId: "delivery-1",
                                contextFromSeq: 0,
                                contextThroughSeq: 0,
                                taskSnapshots: [],
                                assignedAt: 1,
                                status: "running",
                                deliveryStatus: "pending"
                            }
                        }
                    ]
                }
            } as MeetingState,
            "participant-1",
            "attempt-1"
        );

        expect(projected.continuationMaterials).toEqual([
            {
                sourceMeetingId: "source-1",
                sourceKind: "artifact",
                sourceObjectId: "artifact-1",
                summary: "Selected artifact only",
                checksum: "sha256:artifact-1"
            }
        ]);
        expect(JSON.stringify(projected)).not.toContain("sourceSessionId");
    });

    it("projects only the current running attempt ID for local skip control", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                currentTurn: {
                    id: "turn-1",
                    seq: 1,
                    agendaItemId: "agenda-1",
                    intent: "review",
                    reason: "next_turn",
                    objective: "Review",
                    expectedOutputs: [],
                    prohibitedTopics: [],
                    status: "running",
                    currentStepIndex: 0,
                    steps: [
                        {
                            id: "step-1",
                            speaker: "participant-1",
                            instruction: "Review",
                            reason: "required",
                            status: "running",
                            attempt: {
                                attemptId: "attempt-public",
                                deliveryId: "delivery-private",
                                status: "running"
                            }
                        }
                    ]
                }
            } as unknown as MeetingState,
            { kind: "local_host", sessionId: "loopback-web" }
        );

        expect(projected).toMatchObject({
            currentTurn: { intent: "review", reason: "next_turn" },
            currentSpeakerId: "participant-1",
            currentAttemptId: "attempt-public"
        });
        expect(JSON.stringify(projected)).not.toContain("delivery-private");
        expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();
    });

    it("projects canonical proposal revisions and positions for later participants", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                proposals: [
                    {
                        id: "proposal-1",
                        title: "Use SQLite",
                        description: "Persist locally",
                        proposedBy: "participant-1",
                        revision: 1,
                        status: "under_review",
                        agendaItemId: "agenda-1",
                        positions: [
                            {
                                id: "position-1",
                                participantId: "participant-1",
                                position: "support",
                                blocking: false,
                                proposalRevision: 1
                            }
                        ],
                        createdAt: 1,
                        updatedAt: 1
                    }
                ]
            } as MeetingState,
            { kind: "participant", sessionId: "session-2", participantId: "participant-2" }
        );

        expect(projected.proposals).toEqual([
            expect.objectContaining({
                id: "proposal-1",
                revision: 1,
                positions: [expect.objectContaining({ participantId: "participant-1" })]
            })
        ]);
        expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();
    });

    it("clears pending decision candidates for execution-terminal meetings", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                status: "partial",
                termination: {
                    code: "partial",
                    reason: "Stopped",
                    decisionIds: [],
                    unresolvedQuestionIds: [],
                    dissentingPositionIds: [],
                    blockingAgendaItemIds: [],
                    finalMessage: "Stopped",
                    endedAt: 1
                },
                completionFacts: [],
                stallCount: 0,
                maxStalls: 3,
                replanCount: 0,
                maxReplans: 1,
                decisionCandidates: [
                    {
                        id: "candidate-1",
                        proposalId: "proposal-1",
                        proposalRevision: 1,
                        statement: "Decide",
                        rationale: "Evidence",
                        proposedBy: "participant-1",
                        sourceMessageId: "message-1",
                        agendaItemId: "agenda-1",
                        createdAt: 1
                    }
                ],
                proposals: [
                    {
                        id: "proposal-1",
                        title: "Proposal",
                        description: "Description",
                        proposedBy: "participant-1",
                        revision: 1,
                        status: "under_review",
                        agendaItemId: "agenda-1",
                        positions: []
                    }
                ]
            } as MeetingState,
            { kind: "local_host", sessionId: "loopback-web" }
        );

        expect(projected.pendingDecisionCandidates).toEqual([]);
        expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();
    });

    it("projects only blocking Issues as blocking facts", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                issues: [
                    {
                        id: "issue-blocking",
                        title: "Required output",
                        description: "Output missing",
                        sourceMessageId: "message-1",
                        affectedOutputIds: [],
                        affectedCriterionIds: [],
                        violatedConstraintIds: [],
                        blockingObjectionIds: [],
                        riskLevel: "high",
                        impact: "high",
                        urgency: "now",
                        reversibility: "partially_reversible",
                        safeDefaultAvailable: false,
                        relatedTaskIds: [],
                        status: "open",
                        disposition: "blocking",
                        blocking: true
                    },
                    {
                        id: "issue-follow-up",
                        title: "Later",
                        description: "Later",
                        sourceMessageId: "message-1",
                        affectedOutputIds: [],
                        affectedCriterionIds: [],
                        violatedConstraintIds: [],
                        blockingObjectionIds: [],
                        riskLevel: "low",
                        impact: "low",
                        urgency: "later",
                        reversibility: "reversible",
                        safeDefaultAvailable: true,
                        relatedTaskIds: [],
                        status: "open",
                        disposition: "blocking",
                        blocking: false
                    },
                    {
                        id: "issue-accepted",
                        title: "Accepted risk",
                        description: "Accepted",
                        sourceMessageId: "message-1",
                        affectedOutputIds: [],
                        affectedCriterionIds: [],
                        violatedConstraintIds: [],
                        blockingObjectionIds: [],
                        riskLevel: "low",
                        impact: "low",
                        urgency: "later",
                        reversibility: "reversible",
                        safeDefaultAvailable: true,
                        relatedTaskIds: [],
                        status: "accepted_risk",
                        disposition: "accepted_risk",
                        blocking: true
                    }
                ]
            } as unknown as MeetingState,
            { kind: "captain", sessionId: "captain-1" }
        );
        expect(projected.blockingFacts).toEqual([
            {
                id: "issue-blocking",
                kind: "issue",
                subjectId: "issue-blocking",
                summary: "Required output"
            }
        ]);
        expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();
    });

    it("accepts a legacy risk projection without riskLevel", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                issues: [
                    {
                        id: "issue-legacy-risk",
                        title: "Legacy risk",
                        description: "Risk level was not persisted.",
                        sourceMessageId: "message-1",
                        affectedOutputIds: [],
                        affectedCriterionIds: [],
                        violatedConstraintIds: [],
                        blockingObjectionIds: [],
                        impact: "low",
                        urgency: "later",
                        reversibility: "reversible",
                        safeDefaultAvailable: true,
                        relatedTaskIds: [],
                        status: "open",
                        disposition: "follow_up",
                        blocking: false
                    }
                ]
            } as MeetingState,
            { kind: "captain", sessionId: "captain-1" }
        );

        expect(projected.risks[0]).not.toHaveProperty("riskLevel");
        expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();
    });

    it("projects open blocking Questions for Manager planning", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                openQuestions: [
                    {
                        id: "question-blocking",
                        text: "Required output needs evidence",
                        askedBy: "participant-1",
                        agendaItemId: "agenda-1",
                        blocking: true,
                        affectedOutputIds: ["output-1"],
                        affectedCriterionIds: [],
                        violatedConstraintIds: [],
                        status: "open",
                        createdAt: 1
                    }
                ]
            } as MeetingState,
            { kind: "manager", sessionId: "manager-1" }
        );
        expect(projected.blockingFacts).toContainEqual({
            id: "question-blocking",
            kind: "question",
            subjectId: "question-blocking",
            summary: "Required output needs evidence"
        });
    });

    it("keeps pause available while an active meeting is waiting", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                status: "waiting",
                waitState: {
                    reason: "required_participant_unavailable",
                    waitingSince: 1,
                    taskIds: [],
                    participantIds: ["participant-1"],
                    resumeAgendaItemId: "agenda-1"
                }
            } as MeetingState,
            { kind: "captain", sessionId: "captain-1" }
        );

        expect(projected).toMatchObject({
            status: "waiting",
            pauseControl: { action: "pause" },
            waitState: {
                reason: "required_participant_unavailable",
                waitingSince: 1,
                participantIds: ["participant-1"],
                resumeAgendaItemId: "agenda-1"
            }
        });
        expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();
    });

    it("projects local host pause metadata without treating it as an Agent caller", () => {
        const pausedState = {
            ...state,
            status: "paused",
            pausedAt: 10,
            pausedBy: { kind: "local_host", actorId: "loopback-web" },
            pauseReason: "local control"
        } as MeetingState;
        const caller = { kind: "local_host", sessionId: "loopback-web" } as const;
        const projected = projectMeetingStatus(pausedState, caller);

        expect(projected).toMatchObject({
            status: "paused",
            pauseControl: {
                action: "resume",
                pausedAt: 10,
                pausedBy: { kind: "local_host", actorId: "loopback-web" },
                reason: "local control"
            }
        });
        expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();

        const resumed = projectMeetingStatus({ ...pausedState, status: "running" }, caller);
        expect(resumed.pauseControl).toEqual({ action: "pause" });
    });

    it("projects the optional HandRaise reply target", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                handRaises: [
                    {
                        id: "raise-1",
                        participant: "participant-1",
                        reason: "correction",
                        summary: "Correct the prior statement",
                        taskIds: [],
                        replyToMessageId: "message-1",
                        priority: "normal",
                        createdAt: 1,
                        status: "pending"
                    }
                ]
            } as MeetingState,
            { kind: "captain", sessionId: "captain-1" }
        );

        expect(projected.pendingHandRaises).toEqual([
            expect.objectContaining({ replyToMessageId: "message-1" })
        ]);
        expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();
    });

    it.each(["completed", "partial", "no_consensus", "cancelled", "failed"] as const)(
        "maps %s through the execution-terminal schema without active execution data",
        (status) => {
            const projected = projectMeetingStatus(
                {
                    ...state,
                    status,
                    completionFacts: [
                        { id: "fact-active", status: "active" },
                        { id: "fact-superseded", status: "superseded" }
                    ],
                    termination: {
                        code: status === "failed" ? "internal_error" : "captain_accepted",
                        reason: "Formal terminal reason",
                        decisionIds: ["decision-1"],
                        unresolvedQuestionIds: ["question-1"],
                        dissentingPositionIds: ["position-1"],
                        blockingAgendaItemIds: ["agenda-1"],
                        finalMessage: "Final public message",
                        endedAt: 1_700_000_000_000
                    },
                    currentTurn: {
                        id: "turn-secret",
                        currentStepIndex: 0,
                        steps: [
                            {
                                id: "step-secret",
                                speaker: "participant-secret",
                                attempt: { attemptId: "attempt-secret" }
                            }
                        ]
                    },
                    handRaises: [{ id: "raise-secret", status: "pending" }]
                } as unknown as MeetingState,
                {
                    kind: "captain",
                    sessionId: "session-secret"
                }
            );

            expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();
            expect(projected).toMatchObject({
                status,
                pendingHandRaises: [],
                pauseControl: { action: "none" },
                completionFactIds: ["fact-active"],
                termination: {
                    decisionIds: ["decision-1"],
                    unresolvedQuestionIds: ["question-1"],
                    dissentingPositionIds: ["position-1"],
                    blockingAgendaItemIds: ["agenda-1"],
                    finalMessage: "Final public message",
                    endedAt: 1_700_000_000_000
                }
            });
            expect(projected).not.toHaveProperty("currentTurn");
            expect(projected).not.toHaveProperty("currentSpeakerId");
            expect(JSON.stringify(projected)).not.toMatch(
                /session-secret|turn-secret|step-secret|attempt-secret|raise-secret/
            );
        }
    );
});
