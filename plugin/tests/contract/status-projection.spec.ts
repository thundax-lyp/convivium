import type { MeetingState } from "../../src/domain/model.js";
import { projectMeetingStatus } from "../../src/projection/index.js";
import { MeetingStatusResultSchema } from "../../src/protocol/index.js";
import { describe, expect, it } from "vitest";

const state = {
    id: "meeting-1",
    teamId: "team-1",
    status: "running",
    topic: "Release",
    objective: "Decide scope",
    objectiveContract: {},
    continuationMaterials: [],
    limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 8 },
    version: 2,
    agenda: [],
    transcript: [],
    openQuestions: [],
    proposals: [],
    decisions: [],
    issues: [],
    handRaises: [],
    meetingTasks: [],
    currentTurn: undefined,
    manager: {
        status: "planning",
        currentPlanningAttempt: {
            id: "planning-1",
            deliveryId: "delivery-1"
        }
    },
    outbox: { leaseToken: "secret" }
} as unknown as MeetingState;

describe("meeting status projection", () => {
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
            limits: { maxTurns: 3 }
        });
        expect(JSON.stringify(projected)).not.toContain("session-1");
        expect(JSON.stringify(projected)).not.toContain("capability");
        expect(JSON.stringify(projected)).not.toContain("prompt");
        expect(projected).not.toHaveProperty("currentTurn");
        expect(projected).not.toHaveProperty("currentSpeakerId");
        expect(JSON.stringify(projected)).not.toContain("planning-1");
        expect(JSON.stringify(projected)).not.toContain("leaseToken");
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

    it("projects only blocking Issues as blocking facts", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                issues: [
                    { id: "issue-blocking", title: "Required output", blocking: true },
                    { id: "issue-follow-up", title: "Later", blocking: false }
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
                    reason: "required Participant participant-1 is unavailable",
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
                reason: "required Participant participant-1 is unavailable",
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
