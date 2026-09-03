import { describe, expect, it } from "vitest";
import {
    failManagerPlanningAndCreateFallback,
    submitManagerPlan
} from "../../../src/domain/transitions/manager-planning.js";
import { meeting, now } from "../domain/transitions/fixtures.js";

function planningState() {
    return {
        ...meeting("running"),
        meetingTasks: [],
        handRaises: [],
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
        participants: [
            {
                id: "participant-a",
                displayName: "A",
                status: "available" as const,
                consecutiveSpeeches: 0,
                consecutiveAttemptFailures: 0,
                totalSpeeches: 0,
                lastDeliveredSeq: 0,
                lastAcknowledgedSeq: 0
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
}

describe("manager fallback", () => {
    it("creates a running first attempt for an invalid plan fallback", () => {
        const result = failManagerPlanningAndCreateFallback(
            planningState(),
            {
                meetingId: "meeting-1",
                planningAttemptId: "planning-1",
                deliveryId: "planning-delivery-1",
                observedMeetingVersion: 3,
                dispatchableParticipantIds: ["participant-a"],
                now,
                reasonCode: "manager_plan_invalid"
            },
            { turnId: "turn-1", stepId: (index) => `step-${index}` }
        );

        expect(result.state.currentTurn?.reason).toBe("manager_fallback");
        expect(result.state.currentTurn?.steps[0]?.attempt).toMatchObject({
            attemptId: "turn-1-attempt-0",
            deliveryId: "turn-1-delivery-0",
            status: "running",
            deliveryStatus: "pending"
        });
        expect(result.effect.events.map((event) => event.type)).toEqual([
            "manager_plan.failed",
            "turn.planned",
            "turn.started",
            "speaker.assigned"
        ]);
    });

    it("does not fallback a stale Manager attempt", () => {
        expect(() =>
            submitManagerPlan(
                planningState(),
                {
                    agendaItemId: "agenda-1",
                    intent: "explore",
                    objective: "Objective",
                    expectedOutputs: [],
                    prohibitedTopics: [],
                    steps: [
                        {
                            participantId: "participant-a",
                            instruction: "A",
                            reason: "manager_selected"
                        }
                    ]
                },
                {
                    meetingId: "meeting-1",
                    planningAttemptId: "stale-planning",
                    deliveryId: "planning-delivery-1",
                    observedMeetingVersion: 3,
                    dispatchableParticipantIds: ["participant-a"],
                    now
                },
                { turnId: "turn-1", stepId: (index) => `step-${index}` }
            )
        ).toThrowError("manager planning attempt is stale in meeting meeting-1");
    });
});
