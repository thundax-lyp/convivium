import { describe, expect, it } from "vitest";
import { DomainError, transitionMeeting } from "../../../../src/domain/index.js";
import { archivePackage, meeting, now } from "./fixtures.js";

describe("meeting lifecycle and archive transitions", () => {
    it("increments version and records the status change", () => {
        const result = transitionMeeting(meeting(), "running", { now });

        expect(result.state.status).toBe("running");
        expect(result.state.version).toBe(4);
        expect(result.state.updatedAt).toBe(now);
        expect(result.effect.events).toEqual([
            {
                type: "meeting.started",
                payload: {
                    meetingId: "meeting-1",
                    from: "created",
                    to: "running",
                    meetingVersion: 4,
                    reason: undefined
                }
            }
        ]);
    });

    it("rejects transitions that are not in the lifecycle matrix", () => {
        expect(() => transitionMeeting(meeting("archived"), "running", { now })).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
    });

    it("requires a reason and remembers the state paused from", () => {
        expect(() => transitionMeeting(meeting("running"), "paused", { now })).toThrowError(
            DomainError
        );

        const result = transitionMeeting(meeting("waiting"), "paused", {
            now,
            reason: "captain request",
            pause: { at: now, by: { kind: "captain", actorId: "captain-1" } }
        });
        expect(result.state.pausedFromStatus).toBe("waiting");
        expect(result.state.pauseReason).toBe("captain request");
        expect(result.state.pausedAt).toBe(now);
        expect(result.state.pausedBy?.actorId).toBe("captain-1");
    });

    it("persists structured waiting metadata", () => {
        const result = transitionMeeting(meeting("running"), "waiting", {
            now,
            wait: {
                reason: "required task is still running",
                taskIds: ["task-1"],
                participantIds: ["participant-1"],
                deadlineAt: now + 1_000,
                resumeAgendaItemId: "agenda-1"
            }
        });

        expect(result.state.waitState).toEqual({
            reason: "required task is still running",
            taskIds: ["task-1"],
            participantIds: ["participant-1"],
            deadlineAt: now + 1_000,
            resumeAgendaItemId: "agenda-1"
        });

        const resumed = transitionMeeting(result.state, "running", { now: now + 1 });
        expect(resumed.state.waitState).toBeUndefined();
    });

    it("does not revive the paused Turn or planning attempt on resume", () => {
        const paused = transitionMeeting(meeting("running"), "paused", {
            now,
            reason: "captain request",
            pause: { at: now, by: { kind: "captain", actorId: "captain-1" } }
        }).state;
        paused.currentTurn = {
            id: "old-turn",
            seq: 1,
            agendaItemId: "agenda-1",
            intent: "explore",
            objective: "objective",
            expectedOutputs: [],
            prohibitedTopics: [],
            plan: [],
            status: "truncated",
            currentStepIndex: 0,
            steps: []
        };
        paused.manager = {
            promptVersion: "test",
            status: "planning",
            currentPlanningAttempt: {
                id: "old-plan",
                meetingId: "meeting-1",
                observedMeetingVersion: paused.version,
                reason: "old",
                deliveryId: "old-delivery",
                status: "revoked",
                createdAt: now
            }
        };

        const resumed = transitionMeeting(paused, "running", { now: now + 1 });

        expect(resumed.state.currentTurn).toBeUndefined();
        expect(resumed.state.manager).toMatchObject({ status: "idle" });
        expect(resumed.state.manager.currentPlanningAttempt).toBeUndefined();
        expect(resumed.state.transcript).toEqual([]);
    });

    it("revokes active speaker and manager attempts while truncating the turn", () => {
        const state = meeting("running");
        state.currentTurn = {
            id: "turn-1",
            seq: 1,
            agendaItemId: "agenda-1",
            intent: "explore",
            objective: "objective",
            expectedOutputs: [],
            prohibitedTopics: [],
            plan: [],
            status: "running",
            currentStepIndex: 0,
            steps: [
                {
                    id: "step-1",
                    status: "running",
                    attempt: {
                        attemptId: "attempt-1",
                        participantId: "participant-1",
                        meetingId: "meeting-1",
                        turnId: "turn-1",
                        stepId: "step-1",
                        deliveryId: "delivery-1",
                        status: "running",
                        deliveryStatus: "pending",
                        contextFromSeq: 0,
                        contextThroughSeq: 0,
                        taskSnapshots: [],
                        assignedAt: now
                    }
                }
            ]
        };
        state.manager = {
            status: "planning",
            currentPlanningAttempt: {
                id: "plan-1",
                meetingId: "meeting-1",
                observedMeetingVersion: 3,
                reason: "next_turn",
                deliveryId: "manager-delivery-1",
                status: "running",
                createdAt: now
            }
        };
        state.meetingTasks = [
            {
                meetingTaskId: "requested-task",
                participantId: "participant-1",
                originatingSpeakerAttemptId: "attempt-1",
                status: "requested"
            },
            {
                meetingTaskId: "running-task",
                participantId: "participant-1",
                originatingSpeakerAttemptId: "older-attempt",
                status: "running"
            }
        ] as never;

        const result = transitionMeeting(state, "paused", {
            now,
            reason: "captain request",
            pause: { at: now, by: { kind: "captain", actorId: "captain-1" } }
        });

        expect(result.state.currentTurn?.status).toBe("truncated");
        expect(result.state.currentTurn?.steps[0].status).toBe("revoked");
        expect(result.state.currentTurn?.steps[0].attempt?.status).toBe("revoked");
        expect(result.state.manager.currentPlanningAttempt?.status).toBe("revoked");
        expect(result.state.meetingTasks).toMatchObject([
            { meetingTaskId: "requested-task", status: "cancelled", finishedAt: now },
            { meetingTaskId: "running-task", status: "running" }
        ]);
        expect(result.effect.events.map(({ type }) => type)).toEqual([
            "meeting.paused",
            "speaker_attempt.revoked",
            "manager_plan.revoked",
            "meeting_task.cancelled"
        ]);
    });

    it("cancels planned turns and clears active work on terminal transitions", () => {
        const state = meeting("running");
        state.currentTurn = {
            id: "turn-1",
            seq: 1,
            agendaItemId: "agenda-1",
            intent: "explore",
            objective: "objective",
            expectedOutputs: [],
            prohibitedTopics: [],
            plan: [],
            status: "planned",
            currentStepIndex: 0,
            steps: []
        };

        const result = transitionMeeting(state, "cancelled", {
            now,
            termination: {
                code: "user_cancelled",
                reason: "cancelled",
                decisionIds: [],
                unresolvedQuestionIds: [],
                dissentingPositionIds: [],
                blockingAgendaItemIds: [],
                finalMessage: "cancelled",
                endedAt: now
            }
        });

        expect(result.state.currentTurn).toBeUndefined();
    });

    it("does not attach termination or archive data to non-matching transitions", () => {
        const termination = {
            code: "user_cancelled" as const,
            reason: "cancelled",
            decisionIds: [],
            unresolvedQuestionIds: [],
            dissentingPositionIds: [],
            blockingAgendaItemIds: [],
            finalMessage: "cancelled",
            endedAt: now
        };
        expect(() =>
            transitionMeeting(meeting("running"), "paused", {
                now,
                reason: "pause",
                termination,
                pause: { at: now, by: { kind: "captain", actorId: "captain-1" } }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
        expect(() =>
            transitionMeeting(meeting("running"), "waiting", {
                now,
                archive: { package: archivePackage() }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));

        expect(() =>
            transitionMeeting(meeting("running"), "completed", {
                now,
                termination: {
                    code: "objective_satisfied",
                    reason: "done",
                    decisionIds: ["missing-decision"],
                    unresolvedQuestionIds: [],
                    dissentingPositionIds: [],
                    blockingAgendaItemIds: [],
                    finalMessage: "done",
                    endedAt: now
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("requires termination details for execution terminal states", () => {
        expect(() => transitionMeeting(meeting("running"), "completed", { now })).toThrowError(
            expect.objectContaining({ code: "MISSING_TERMINATION" })
        );

        const result = transitionMeeting(meeting("running"), "completed", {
            now,
            termination: {
                code: "objective_satisfied",
                reason: "all outputs accepted",
                decisionIds: [],
                unresolvedQuestionIds: [],
                dissentingPositionIds: [],
                blockingAgendaItemIds: [],
                finalMessage: "done",
                endedAt: now
            }
        });
        expect(result.state.termination?.code).toBe("objective_satisfied");
        expect(() =>
            transitionMeeting(meeting("running"), "completed", {
                now,
                termination: {
                    code: "user_cancelled",
                    reason: "cancelled",
                    decisionIds: [],
                    unresolvedQuestionIds: [],
                    dissentingPositionIds: [],
                    blockingAgendaItemIds: [],
                    finalMessage: "cancelled",
                    endedAt: now
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("requires verified outputs, criteria, and reviews before completion", () => {
        const state = meeting("running");
        state.objectiveContract.requiredOutputs = [
            { id: "output-1", description: "output", status: "pending" }
        ];
        state.objectiveContract.acceptanceCriteria = [
            { id: "criterion-1", description: "criterion", satisfied: false }
        ];
        state.objectiveContract.requiredReviewers = ["reviewer-1"];
        expect(() =>
            transitionMeeting(state, "completed", {
                now,
                termination: {
                    code: "objective_satisfied",
                    reason: "done",
                    decisionIds: [],
                    unresolvedQuestionIds: [],
                    dissentingPositionIds: [],
                    blockingAgendaItemIds: [],
                    finalMessage: "done",
                    endedAt: now
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("requires agenda and blocking facts to be settled before completion", () => {
        const state = meeting("running");
        state.agenda = [
            {
                id: "agenda-1",
                title: "agenda",
                objective: "objective",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipants: [],
                relatedTaskIds: [],
                status: "pending"
            }
        ];
        state.issues = [
            {
                id: "issue-1",
                title: "blocker",
                description: "blocker",
                sourceMessageId: "message-1",
                affectedOutputIds: [],
                affectedCriterionIds: [],
                violatedConstraintIds: [],
                blockingObjectionIds: [],
                blocking: true,
                impact: "blocks completion",
                urgency: "now",
                reversibility: "reversible",
                safeDefaultAvailable: false,
                disposition: "blocking",
                status: "open",
                relatedTaskIds: []
            }
        ];
        state.openQuestions = [
            {
                id: "question-1",
                text: "question",
                askedBy: "participant-1",
                agendaItemId: "agenda-1",
                blocking: true,
                createdAt: now,
                status: "open"
            }
        ];

        expect(() =>
            transitionMeeting(state, "completed", {
                now,
                termination: {
                    code: "objective_satisfied",
                    reason: "done",
                    decisionIds: [],
                    unresolvedQuestionIds: [],
                    dissentingPositionIds: [],
                    blockingAgendaItemIds: [],
                    finalMessage: "done",
                    endedAt: now
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });
});
