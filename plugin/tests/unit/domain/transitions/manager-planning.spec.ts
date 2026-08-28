import { describe, expect, it } from "vitest";

import { startManagerPlanning, submitManagerPlan } from "../../../../src/domain/index.js";
import { meeting, now } from "./fixtures.js";

describe("manager planning transitions", () => {
    it("submits a manager plan and starts only the first speaker", () => {
        const state = {
            ...meeting(),
            selectionMode: "manager" as const,
            activeAgendaItemId: "agenda-1",
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
                    status: "discussing" as const
                }
            ],
            manager: {
                promptVersion: "test",
                status: "planning" as const,
                currentPlanningAttempt: {
                    id: "planning-1",
                    meetingId: "meeting-1",
                    observedMeetingVersion: 3,
                    reason: "initial_plan" as const,
                    deliveryId: "planning-delivery-1",
                    status: "running" as const,
                    createdAt: now
                }
            },
            participants: [
                {
                    id: "a",
                    displayName: "A",
                    status: "available" as const,
                    consecutiveSpeeches: 0,
                    consecutiveAttemptFailures: 0,
                    totalSpeeches: 0,
                    lastDeliveredSeq: 0,
                    lastAcknowledgedSeq: 0
                },
                {
                    id: "c",
                    displayName: "C",
                    status: "available" as const,
                    consecutiveSpeeches: 0,
                    consecutiveAttemptFailures: 0,
                    totalSpeeches: 0,
                    lastDeliveredSeq: 0,
                    lastAcknowledgedSeq: 0
                },
                {
                    id: "b",
                    displayName: "B",
                    status: "available" as const,
                    consecutiveSpeeches: 0,
                    consecutiveAttemptFailures: 0,
                    totalSpeeches: 0,
                    lastDeliveredSeq: 0,
                    lastAcknowledgedSeq: 0
                }
            ]
        };
        const result = submitManagerPlan(
            state,
            {
                agendaItemId: "agenda-1",
                intent: "explore",
                objective: "Objective",
                expectedOutputs: [],
                prohibitedTopics: [],
                steps: [
                    { participantId: "a", instruction: "A", reason: "manager_selected" },
                    { participantId: "c", instruction: "C", reason: "manager_selected" },
                    { participantId: "b", instruction: "B", reason: "manager_selected" }
                ]
            },
            {
                meetingId: "meeting-1",
                planningAttemptId: "planning-1",
                deliveryId: "planning-delivery-1",
                observedMeetingVersion: 3,
                dispatchableParticipantIds: ["a", "c", "b"],
                now
            },
            { turnId: "turn-1", stepId: (index) => `step-${index}` }
        );
        expect(result.state.currentTurn?.steps.map((step) => step.speaker)).toEqual([
            "a",
            "c",
            "b"
        ]);
        expect(result.state.currentTurn?.steps.filter((step) => step.attempt).length).toBe(1);
        expect(result.state.currentTurn?.steps[0]?.attempt?.deliveryStatus).toBe("pending");
        expect(result.state.manager.currentPlanningAttempt).toBeUndefined();
        expect(result.state.version).toBe(4);
        expect(result.effect.events.every((item) => item.payload.meetingVersion === 4)).toBe(true);
    });

    it("waits without creating a turn when a required speaker is unavailable", () => {
        const state = {
            ...meeting(),
            selectionMode: "manager" as const,
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
            manager: {
                promptVersion: "test",
                status: "planning" as const,
                currentPlanningAttempt: {
                    id: "planning-1",
                    meetingId: "meeting-1",
                    observedMeetingVersion: 3,
                    reason: "initial_plan" as const,
                    deliveryId: "planning-delivery-1",
                    status: "running" as const,
                    createdAt: now
                }
            }
        };
        const result = submitManagerPlan(
            state,
            {
                agendaItemId: "agenda-1",
                intent: "explore",
                objective: "Objective",
                expectedOutputs: [],
                prohibitedTopics: [],
                steps: [{ participantId: "a", instruction: "A", reason: "manager_selected" }]
            },
            {
                meetingId: "meeting-1",
                planningAttemptId: "planning-1",
                deliveryId: "planning-delivery-1",
                observedMeetingVersion: 3,
                dispatchableParticipantIds: [],
                now
            },
            { turnId: "turn-1", stepId: (index) => `step-${index}` }
        );
        expect(result.state.status).toBe("waiting");
        expect(result.state.currentTurn).toBeUndefined();
        expect(result.state.manager.currentPlanningAttempt?.status).toBe("failed");
        expect(result.state.waitState?.participantIds).toEqual(["a"]);
        expect(result.effect.events.map((item) => item.type)).toEqual([
            "manager_plan.failed",
            "meeting.waiting"
        ]);
    });
    it("starts one manager planning attempt after entering running", () => {
        const state = {
            ...meeting(),
            selectionMode: "manager" as const,
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
            ]
        };

        const result = startManagerPlanning(state, {
            meetingId: state.id,
            planningAttemptId: "planning-1",
            deliveryId: "delivery-1",
            reason: "initial_plan",
            now
        });

        expect(result.state.status).toBe("running");
        expect(result.state.version).toBe(state.version + 1);
        expect(result.state.replanCount).toBe(state.replanCount + 1);
        expect(result.state.currentTurn).toBeUndefined();
        expect(result.state.manager.status).toBe("planning");
        expect(result.state.manager.currentPlanningAttempt).toEqual({
            id: "planning-1",
            meetingId: state.id,
            observedMeetingVersion: state.version + 1,
            reason: "initial_plan",
            deliveryId: "delivery-1",
            status: "running",
            createdAt: now
        });
        expect(result.effect.events.map((item) => item.type)).toEqual([
            "meeting.started",
            "manager_plan.started"
        ]);
    });

    it("starts the next manager planning attempt from running without a current turn", () => {
        const state = {
            ...meeting("running"),
            selectionMode: "manager" as const,
            handRaises: [
                {
                    id: "raise-1",
                    participant: "participant-1",
                    reason: "task_completed" as const,
                    summary: "completed task",
                    taskIds: ["task-1"],
                    priority: "normal" as const,
                    createdAt: now,
                    status: "pending" as const
                }
            ]
        };

        const result = startManagerPlanning(state, {
            meetingId: state.id,
            planningAttemptId: "planning-next",
            deliveryId: "delivery-next",
            reason: "next_turn",
            now
        });

        expect(result.state.version).toBe(state.version + 1);
        expect(result.state.manager.currentPlanningAttempt).toMatchObject({
            id: "planning-next",
            deliveryId: "delivery-next",
            reason: "next_turn",
            status: "running"
        });
        expect(result.effect.events.map((item) => item.type)).toEqual(["manager_plan.started"]);
    });

    it("rejects round-robin meetings and duplicate planning state", () => {
        expect(() =>
            startManagerPlanning(
                { ...meeting("running"), selectionMode: "manager" as const },
                {
                    meetingId: "meeting-1",
                    planningAttemptId: "planning-next",
                    deliveryId: "delivery-next",
                    reason: "next_turn",
                    now
                }
            )
        ).toThrow("cannot transition from running to running");
        expect(() =>
            startManagerPlanning(meeting(), {
                meetingId: "meeting-1",
                planningAttemptId: "planning-1",
                deliveryId: "delivery-1",
                reason: "initial_plan",
                now
            })
        ).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CAPABILITY" }));

        const state = {
            ...meeting(),
            selectionMode: "manager" as const,
            manager: {
                ...meeting().manager,
                currentPlanningAttempt: {
                    id: "planning-existing",
                    meetingId: "meeting-1",
                    observedMeetingVersion: 3,
                    reason: "initial_plan" as const,
                    deliveryId: "delivery-existing",
                    status: "running" as const,
                    createdAt: now
                }
            }
        };
        expect(() =>
            startManagerPlanning(state, {
                meetingId: state.id,
                planningAttemptId: "planning-1",
                deliveryId: "delivery-1",
                reason: "initial_plan",
                now
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });
});
