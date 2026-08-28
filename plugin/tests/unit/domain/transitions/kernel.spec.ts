import { describe, expect, it } from "vitest";

import {
    submitSpeakerAttempt,
    transitionAttempt,
    transitionManagerAttempt,
    transitionStep,
    transitionTurn
} from "../../../../src/domain/index.js";
import { attemptContext, managerAttemptContext, meeting, now } from "./fixtures.js";

describe("turn, step and attempt transitions", () => {
    it("allows only the specified turn transitions", () => {
        const result = transitionTurn(
            {
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
                steps: [],
                createdAt: now
            },
            "running",
            1
        );
        expect(result.state.status).toBe("running");
        expect(result.effect.events[0]?.type).toBe("turn.started");
        expect(() => transitionTurn(result.state, "planned", 2)).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
    });

    it("models step and speaker attempt retry as new state, never resurrection", () => {
        const step = transitionStep({ id: "step-1", status: "pending" }, "assigned", 1).state;
        const runningStep = transitionStep(step, "running", 2).state;
        expect(transitionStep(step, "running", 2).effect.events[0]?.type).toBe("speaker.started");
        expect(transitionStep(runningStep, "revoked", 3).state.status).toBe("revoked");
        expect(() => transitionStep(runningStep, "assigned", 3)).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );

        const attempt = transitionAttempt(
            {
                attemptId: "attempt-1",
                participantId: "participant-1",
                meetingId: "meeting-1",
                turnId: "turn-1",
                stepId: "step-1",
                deliveryId: "delivery-1",
                contextFromSeq: 0,
                contextThroughSeq: 0,
                taskSnapshots: [],
                assignedAt: now,
                status: "assigned",
                deliveryStatus: "pending"
            },
            "running",
            2,
            attemptContext()
        ).state;
        expect(
            transitionAttempt(
                {
                    ...attempt,
                    status: "assigned",
                    deliveryStatus: "pending"
                },
                "running",
                2,
                attemptContext()
            ).effect.events[0]?.type
        ).toBe("speaker_attempt.started");
        const submitted = transitionAttempt(attempt, "submitted", 3, attemptContext());
        expect(submitted.state.status).toBe("submitted");
        expect(submitted.state.deliveryStatus).toBe("acknowledged");
        expect(() =>
            transitionAttempt(attempt, "submitted", 3, {
                ...attemptContext(),
                deliveryId: "stale-delivery"
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
        expect(transitionAttempt(attempt, "failed", 3, attemptContext()).state.status).toBe(
            "failed"
        );
        expect(() => transitionAttempt(attempt, "assigned", 3, attemptContext())).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
    });

    it("uses the same lifecycle rule for manager planning attempts", () => {
        const running = transitionManagerAttempt(
            {
                id: "plan-1",
                meetingId: "meeting-1",
                observedMeetingVersion: 1,
                reason: "next_turn",
                deliveryId: "manager-delivery-1",
                status: "pending",
                createdAt: now
            },
            "running",
            1,
            managerAttemptContext()
        ).state;
        expect(
            transitionManagerAttempt(
                {
                    ...running,
                    status: "pending"
                },
                "running",
                1,
                managerAttemptContext()
            ).effect.events[0]?.type
        ).toBe("manager_plan.started");
        expect(
            transitionManagerAttempt(running, "submitted", 1, managerAttemptContext()).state.status
        ).toBe("submitted");
        expect(() =>
            transitionManagerAttempt(running, "pending", 2, managerAttemptContext())
        ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        expect(() =>
            transitionManagerAttempt(running, "submitted", 2, managerAttemptContext())
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("commits a current speaker submission and waits after the final step", () => {
        const state = meeting("running");
        state.participants = [
            {
                id: "participant-1",
                displayName: "Participant",
                status: "available",
                consecutiveSpeeches: 0,
                consecutiveAttemptFailures: 0,
                totalSpeeches: 0,
                lastDeliveredSeq: 2,
                lastAcknowledgedSeq: 1
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
            plan: ["participant-1"],
            status: "running",
            currentStepIndex: 0,
            createdAt: now,
            steps: [
                {
                    id: "step-1",
                    speaker: "participant-1",
                    instruction: "speak",
                    reason: "round_robin_fallback",
                    status: "running",
                    attempt: {
                        attemptId: "attempt-1",
                        participantId: "participant-1",
                        meetingId: "meeting-1",
                        turnId: "turn-1",
                        stepId: "step-1",
                        deliveryId: "delivery-1",
                        contextFromSeq: 0,
                        contextThroughSeq: 5,
                        taskSnapshots: [],
                        assignedAt: now,
                        status: "running",
                        deliveryStatus: "accepted"
                    }
                }
            ]
        };

        const result = submitSpeakerAttempt(state, "participant-1", state.version, {
            ...attemptContext(),
            agendaItemId: "agenda-1",
            message: {
                id: "message-1",
                content: "Formal statement",
                kind: "statement",
                mentions: [],
                taskIds: [],
                agendaRelation: "blocking_interrupt",
                createdAt: now
            }
        });

        expect(result.state.currentTurn?.steps[0].attempt?.status).toBe("submitted");
        expect(result.state.currentTurn?.steps[0].attempt?.deliveryStatus).toBe("acknowledged");
        expect(result.state.currentTurn?.steps[0].status).toBe("submitted");
        expect(result.state.currentTurn?.status).toBe("completed");
        expect(result.state.status).toBe("waiting");
        expect(result.state.transcript).toMatchObject([
            {
                id: "message-1",
                seq: 1,
                turnId: "turn-1",
                stepId: "step-1",
                attemptId: "attempt-1",
                speaker: "participant-1",
                agendaItemId: "agenda-1",
                agendaRelation: "blocking_interrupt"
            }
        ]);
        expect(result.state.participants[0].lastDeliveredSeq).toBe(5);
        expect(result.state.participants[0].lastAcknowledgedSeq).toBe(5);
        expect(result.effect.events.map(({ type }) => type)).toEqual([
            "speaker_attempt.submitted",
            "speaker.submitted",
            "message.added",
            "turn.completed",
            "meeting.waiting"
        ]);
    });

    it("rejects stale, duplicate, wrong-agenda, and wrong-speaker submissions without a state effect", () => {
        const state = meeting("running");
        state.participants = [
            {
                id: "participant-1",
                displayName: "Participant",
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
            plan: ["participant-1"],
            status: "running",
            currentStepIndex: 0,
            createdAt: now,
            steps: [
                {
                    id: "step-1",
                    speaker: "participant-1",
                    instruction: "speak",
                    reason: "round_robin_fallback",
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
                        assignedAt: now,
                        status: "running",
                        deliveryStatus: "accepted"
                    }
                }
            ]
        };
        const submission = {
            ...attemptContext(),
            agendaItemId: "agenda-1",
            message: {
                id: "message-1",
                content: "Formal statement",
                kind: "statement" as const,
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic" as const,
                createdAt: now
            }
        };

        for (const [participantId, version, context] of [
            ["participant-1", state.version + 1, submission],
            ["participant-1", state.version, { ...submission, agendaItemId: "wrong-agenda" }],
            ["participant-2", state.version, submission]
        ] as const) {
            expect(() => submitSpeakerAttempt(state, participantId, version, context)).toThrowError(
                expect.objectContaining({ code: "STALE_ATTEMPT", retryable: false })
            );
        }
        expect(state.transcript).toEqual([]);

        const committed = submitSpeakerAttempt(
            state,
            "participant-1",
            state.version,
            submission
        ).state;
        expect(() =>
            submitSpeakerAttempt(committed, "participant-1", committed.version, submission)
        ).toThrowError(expect.objectContaining({ code: "STALE_ATTEMPT", retryable: false }));
        expect(committed.transcript).toHaveLength(1);
    });
});
