import { describe, expect, it } from "vitest";

import { submitSpeakerAndAdvanceMeeting } from "../../../../src/domain/index.js";
import { meeting, now } from "./fixtures.js";

describe("speaker submission and turn advancement", () => {
    it("submits one speaker and creates only the next ordered attempt", () => {
        const participant = {
            id: "a",
            displayName: "A",
            status: "speaking" as const,
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        };
        const state = {
            ...meeting("running"),
            participants: [participant],
            activeAgendaItemId: "agenda-1",
            agenda: [
                {
                    id: "agenda-1",
                    title: "Agenda",
                    objective: "Objective",
                    inScope: [],
                    outOfScope: [],
                    completionCriteria: [],
                    requiredParticipants: ["a"],
                    relatedTaskIds: [],
                    status: "discussing" as const
                }
            ],
            currentTurn: {
                id: "turn-1",
                seq: 1,
                agendaItemId: "agenda-1",
                intent: "explore" as const,
                objective: "objective",
                expectedOutputs: [],
                prohibitedTopics: [],
                plan: ["a", "b"],
                status: "running" as const,
                currentStepIndex: 0,
                steps: [
                    {
                        id: "step-0",
                        speaker: "a",
                        instruction: "A",
                        reason: "manager_selected" as const,
                        status: "running" as const,
                        attempt: {
                            attemptId: "attempt-0",
                            participantId: "a",
                            meetingId: "meeting-1",
                            turnId: "turn-1",
                            stepId: "step-0",
                            deliveryId: "delivery-0",
                            contextFromSeq: 0,
                            contextThroughSeq: 0,
                            taskSnapshots: [],
                            assignedAt: now,
                            status: "running" as const,
                            deliveryStatus: "pending" as const
                        }
                    },
                    {
                        id: "step-1",
                        speaker: "b",
                        instruction: "B",
                        reason: "manager_selected" as const,
                        status: "pending" as const
                    }
                ],
                createdAt: now
            }
        };
        const result = submitSpeakerAndAdvanceMeeting(state, "a", {
            meetingId: "meeting-1",
            participantId: "a",
            turnId: "turn-1",
            stepId: "step-0",
            attemptId: "attempt-0",
            deliveryId: "delivery-0",
            agendaItemId: "agenda-1",
            message: {
                id: "message-1",
                content: "answer",
                kind: "statement",
                mentions: [],
                taskIds: [],
                agendaRelation: "supporting_context",
                createdAt: now
            },
            now,
            nextPlanningAttemptId: "planning-2",
            nextPlanningDeliveryId: "planning-delivery-2",
            questions: []
        });
        expect(result.state.version).toBe(state.version + 1);
        expect(result.state.currentTurn?.steps[1]?.attempt?.participantId).toBe("b");
        expect(result.state.currentTurn?.steps.filter((step) => step.attempt).length).toBe(2);
        expect(result.state.messageSeq).toBe(1);
        expect(result.state.eventSeq).toBe(state.eventSeq + result.effect.events.length);
        expect(result.effect.events.map(({ type }) => type).slice(0, 3)).toEqual([
            "speaker_attempt.submitted",
            "speaker.submitted",
            "message.added"
        ]);

        const completed = submitSpeakerAndAdvanceMeeting(state, "a", {
            meetingId: "meeting-1",
            participantId: "a",
            turnId: "turn-1",
            stepId: "step-0",
            attemptId: "attempt-0",
            deliveryId: "delivery-0",
            agendaItemId: "agenda-1",
            message: {
                id: "message-1",
                content: "answer",
                kind: "statement",
                mentions: [],
                taskIds: [],
                agendaRelation: "supporting_context",
                createdAt: now
            },
            now,
            nextPlanningAttemptId: "planning-2",
            nextPlanningDeliveryId: "planning-delivery-2",
            questions: [
                {
                    id: "question-1",
                    text: "Is this resolved?",
                    blocking: false,
                    createdAt: now
                }
            ],
            completion: {
                claims: {
                    questionResolutions: [
                        { questionId: "question-1", answerMessageId: "message-1" }
                    ]
                },
                authorizedTaskIds: [],
                factId: (kind, index) => `fact-${kind}-${index}`
            }
        });
        expect(completed.effect.events.map(({ type }) => type).slice(0, 6)).toEqual([
            "speaker_attempt.submitted",
            "speaker.submitted",
            "message.added",
            "question.added",
            "question.answered",
            "completion_fact.added"
        ]);
        expect(completed.state.eventSeq).toBe(state.eventSeq + completed.effect.events.length);
    });

    it("starts the next deterministic round-robin turn without Manager planning", () => {
        const state = meeting("running");
        state.selectionMode = "round_robin";
        state.activeAgendaItemId = "agenda-1";
        state.agenda = [
            {
                id: "agenda-1",
                title: "Agenda",
                objective: "Objective",
                inScope: [],
                outOfScope: [],
                completionCriteria: ["output-1"],
                requiredParticipants: ["a"],
                relatedTaskIds: [],
                status: "discussing"
            }
        ];
        state.objectiveContract.requiredOutputs = [
            { id: "output-1", description: "Output", status: "pending" }
        ];
        state.participants = [
            {
                id: "a",
                displayName: "A",
                status: "speaking",
                consecutiveSpeeches: 0,
                consecutiveAttemptFailures: 0,
                totalSpeeches: 0,
                lastDeliveredSeq: 0,
                lastAcknowledgedSeq: 0
            }
        ];
        state.turnSeq = 1;
        state.currentTurn = {
            id: "turn-1",
            seq: 1,
            agendaItemId: "agenda-1",
            intent: "explore",
            objective: "Objective",
            expectedOutputs: ["output-1"],
            prohibitedTopics: [],
            plan: ["a"],
            status: "running",
            currentStepIndex: 0,
            createdAt: now,
            steps: [
                {
                    id: "step-a-0",
                    speaker: "a",
                    instruction: "Speak",
                    reason: "round_robin_fallback",
                    status: "running",
                    attempt: {
                        attemptId: "attempt-0",
                        participantId: "a",
                        meetingId: "meeting-1",
                        turnId: "turn-1",
                        stepId: "step-a-0",
                        deliveryId: "delivery-0",
                        contextFromSeq: 0,
                        contextThroughSeq: 0,
                        taskSnapshots: [],
                        assignedAt: now,
                        status: "running",
                        deliveryStatus: "pending"
                    }
                }
            ]
        };

        const result = submitSpeakerAndAdvanceMeeting(state, "a", {
            meetingId: "meeting-1",
            participantId: "a",
            turnId: "turn-1",
            stepId: "step-a-0",
            attemptId: "attempt-0",
            deliveryId: "delivery-0",
            agendaItemId: "agenda-1",
            message: {
                id: "message-1",
                content: "Still incomplete",
                kind: "statement",
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic",
                createdAt: now
            },
            now,
            nextPlanningAttemptId: "unused-planning-2",
            nextPlanningDeliveryId: "unused-planning-delivery-2",
            questions: []
        });

        expect(result.state.currentTurn).toMatchObject({
            id: "turn-2",
            seq: 2,
            status: "running",
            steps: [
                {
                    id: "step-turn-2-0",
                    speaker: "a",
                    status: "running",
                    attempt: {
                        attemptId: "turn-2-attempt-0",
                        deliveryId: "turn-2-delivery-0"
                    }
                }
            ]
        });
        expect(result.state.manager.currentPlanningAttempt).toBeUndefined();
        expect(result.effect.events.map(({ type }) => type)).toContain("turn.planned");
        expect(result.effect.events.map(({ type }) => type)).not.toContain("manager_plan.started");
        expect(result.state.eventSeq).toBe(state.eventSeq + result.effect.events.length);
    });

    it("moves an objectively complete turn to converging for Captain termination", () => {
        const state = meeting("running");
        state.participants = [
            {
                id: "a",
                displayName: "A",
                status: "speaking",
                consecutiveSpeeches: 0,
                consecutiveAttemptFailures: 0,
                totalSpeeches: 0,
                lastDeliveredSeq: 0,
                lastAcknowledgedSeq: 0
            }
        ];
        state.currentTurn = {
            id: "turn-1",
            seq: 1,
            agendaItemId: "agenda-1",
            intent: "explore",
            objective: "objective",
            expectedOutputs: [],
            prohibitedTopics: [],
            plan: ["a"],
            status: "running",
            currentStepIndex: 0,
            createdAt: now,
            steps: [
                {
                    id: "step-0",
                    speaker: "a",
                    instruction: "A",
                    reason: "manager_selected",
                    status: "running",
                    attempt: {
                        attemptId: "attempt-0",
                        participantId: "a",
                        meetingId: "meeting-1",
                        turnId: "turn-1",
                        stepId: "step-0",
                        deliveryId: "delivery-0",
                        contextFromSeq: 0,
                        contextThroughSeq: 0,
                        taskSnapshots: [],
                        assignedAt: now,
                        status: "running",
                        deliveryStatus: "pending"
                    }
                }
            ]
        };
        const result = submitSpeakerAndAdvanceMeeting(state, "a", {
            meetingId: "meeting-1",
            participantId: "a",
            turnId: "turn-1",
            stepId: "step-0",
            attemptId: "attempt-0",
            deliveryId: "delivery-0",
            agendaItemId: "agenda-1",
            message: {
                id: "message-1",
                content: "answer",
                kind: "statement",
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic",
                createdAt: now
            },
            now,
            nextPlanningAttemptId: "planning-2",
            nextPlanningDeliveryId: "planning-delivery-2",
            questions: []
        });
        expect(result.state.status).toBe("converging");
        expect(result.effect.events).toContainEqual({
            type: "meeting.replanned",
            payload: expect.objectContaining({ from: "running", to: "converging" })
        });
    });

    it("waits after a blocking task is queued and does not assign the next speaker", () => {
        const state = meeting("running");
        state.participants = [
            {
                id: "a",
                displayName: "A",
                status: "speaking",
                consecutiveSpeeches: 0,
                consecutiveAttemptFailures: 0,
                totalSpeeches: 0,
                lastDeliveredSeq: 0,
                lastAcknowledgedSeq: 0
            },
            {
                id: "b",
                displayName: "B",
                status: "available",
                consecutiveSpeeches: 0,
                consecutiveAttemptFailures: 0,
                totalSpeeches: 0,
                lastDeliveredSeq: 0,
                lastAcknowledgedSeq: 0
            }
        ];
        state.currentTurn = {
            id: "turn-1",
            seq: 1,
            agendaItemId: "agenda-1",
            intent: "explore",
            objective: "objective",
            expectedOutputs: [],
            prohibitedTopics: [],
            plan: ["a", "b"],
            status: "running",
            currentStepIndex: 0,
            createdAt: now,
            steps: [
                {
                    id: "step-0",
                    speaker: "a",
                    instruction: "A",
                    reason: "manager_selected",
                    status: "running",
                    attempt: {
                        attemptId: "attempt-0",
                        participantId: "a",
                        meetingId: state.id,
                        turnId: "turn-1",
                        stepId: "step-0",
                        deliveryId: "delivery-0",
                        contextFromSeq: 0,
                        contextThroughSeq: 0,
                        taskSnapshots: [],
                        assignedAt: now,
                        status: "running",
                        deliveryStatus: "pending"
                    }
                },
                {
                    id: "step-1",
                    speaker: "b",
                    instruction: "B",
                    reason: "manager_selected",
                    status: "pending"
                }
            ]
        };
        state.meetingTasks = [
            {
                meetingTaskId: "task-1",
                participantId: "a",
                originatingSpeakerAttemptId: "attempt-0",
                executionId: "exec-1",
                deliveryId: "delivery-task-1",
                title: "Inspect",
                description: "Inspect",
                blocking: true,
                status: "requested",
                createdAt: now
            }
        ];
        const context = {
            meetingId: state.id,
            participantId: "a",
            turnId: "turn-1",
            stepId: "step-0",
            attemptId: "attempt-0",
            deliveryId: "delivery-0",
            agendaItemId: "agenda-1",
            message: {
                id: "message-1",
                content: "queued",
                kind: "statement",
                mentions: [],
                taskIds: ["task-1"],
                agendaRelation: "on_topic",
                createdAt: now
            },
            now,
            nextPlanningAttemptId: "planning-2",
            nextPlanningDeliveryId: "planning-delivery-2",
            questions: []
        };
        expect(() =>
            submitSpeakerAndAdvanceMeeting(state, "a", {
                ...context,
                message: { ...context.message, taskIds: [] }
            })
        ).toThrowError("must be included in the originating turn submission");

        const result = submitSpeakerAndAdvanceMeeting(state, "a", context);
        expect(result.state.status).toBe("waiting");
        expect(result.state.currentTurn?.steps[1]?.attempt).toBeUndefined();
        expect(result.effect.events.map(({ type }) => type)).toContain("meeting.waiting");

        const evidenceState = structuredClone(state);
        evidenceState.meetingTasks.push({
            meetingTaskId: "completed-task",
            participantId: "a",
            originatingSpeakerAttemptId: "older-attempt",
            status: "completed"
        } as never);
        const withCompletedEvidence = submitSpeakerAndAdvanceMeeting(evidenceState, "a", {
            ...context,
            message: {
                ...context.message,
                id: "message-with-evidence",
                taskIds: ["task-1", "completed-task"]
            }
        });
        expect(withCompletedEvidence.state.meetingTasks).toMatchObject([
            { meetingTaskId: "task-1", status: "queued" },
            { meetingTaskId: "completed-task", status: "completed" }
        ]);
    });
});
