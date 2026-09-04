import { describe, expect, it } from "vitest";

import { failSpeakerAttempt, type MeetingState } from "../../../../src/domain/index.js";
import { meeting, now } from "./fixtures.js";

function timeoutState(
    selectionMode: MeetingState["selectionMode"] = "round_robin",
    requiredParticipants: readonly string[] = ["a"]
): MeetingState {
    const state = meeting("running");
    state.selectionMode = selectionMode;
    state.activeAgendaItemId = "agenda-1";
    state.agenda = [
        {
            id: "agenda-1",
            title: "Agenda",
            objective: "Objective",
            inScope: [],
            outOfScope: [],
            completionCriteria: ["output-1"],
            requiredParticipants,
            relatedTaskIds: [],
            status: "discussing"
        }
    ];
    state.objectiveContract.requiredOutputs = [
        { id: "output-1", description: "Output", status: "pending" }
    ];
    state.limits.maxConsecutiveAttemptFailuresPerParticipant = 1;
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
        objective: "Objective",
        expectedOutputs: ["output-1"],
        prohibitedTopics: [],
        plan: ["a"],
        status: "running",
        currentStepIndex: 0,
        createdAt: now,
        steps: [
            {
                id: "step-0",
                speaker: "a",
                instruction: "Speak",
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
                    deadlineAt: now + 1,
                    status: "running",
                    deliveryStatus: "pending"
                }
            }
        ]
    };
    return state;
}

const timeoutContext = {
    meetingId: "meeting-1",
    participantId: "a",
    turnId: "turn-1",
    stepId: "step-0",
    attemptId: "attempt-0",
    deliveryId: "delivery-0",
    agendaItemId: "agenda-1",
    now: now + 1,
    nextPlanningAttemptId: "planning-2",
    nextPlanningDeliveryId: "planning-delivery-2",
    catalogBinding: { kind: "none" as const }
};

describe("SpeakerAttempt timeout", () => {
    it("cancels requested tasks and stops round-robin before a partial required plan", () => {
        const state = timeoutState();
        state.meetingTasks = [
            {
                meetingTaskId: "task-1",
                participantId: "a",
                originatingSpeakerAttemptId: "attempt-0",
                title: "Pending task",
                description: "Pending task",
                blocking: false,
                status: "requested",
                createdAt: now
            }
        ];

        const result = failSpeakerAttempt(state, timeoutContext);

        expect(result.state.meetingTasks).toMatchObject([
            { meetingTaskId: "task-1", status: "cancelled", finishedAt: now + 1 }
        ]);
        expect(result.state.participants).toMatchObject([
            { id: "a", status: "available", consecutiveAttemptFailures: 1 },
            { id: "b", status: "available", consecutiveAttemptFailures: 0 }
        ]);
        expect(result.state.currentTurn).toMatchObject({
            id: "turn-1",
            status: "completed",
            steps: [
                {
                    status: "revoked",
                    attempt: { status: "revoked" }
                }
            ]
        });
        expect(result.state).toMatchObject({
            status: "waiting",
            waitState: {
                reason: "required_participant_unavailable",
                waitingSince: now + 1,
                participantIds: ["a"],
                taskIds: [],
                resumeAgendaItemId: "agenda-1"
            }
        });
        expect(result.effect.events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "speaker_attempt.revoked",
                    payload: expect.objectContaining({ reason: "timeout" })
                }),
                expect.objectContaining({
                    type: "speaker.revoked",
                    payload: expect.objectContaining({ reason: "timeout" })
                })
            ])
        );
        expect(result.effect.events.map(({ type }) => type)).not.toContain("turn.planned");
        expect(result.effect.events.map(({ type }) => type)).not.toContain("manager_plan.failed");
        expect(result.effect.events.map(({ type }) => type)).toContain("meeting_task.cancelled");
        expect(result.effect.events).toContainEqual(
            expect.objectContaining({
                type: "meeting.waiting",
                payload: expect.objectContaining({
                    reason: "required_participant_unavailable"
                })
            })
        );
    });

    it("creates the next Manager planning attempt when remaining speakers are dispatchable", () => {
        const state = timeoutState("manager", []);

        const result = failSpeakerAttempt(state, timeoutContext);

        expect(result.state.manager.currentPlanningAttempt).toMatchObject({
            id: "planning-2",
            deliveryId: "planning-delivery-2",
            status: "running",
            catalogBinding: { kind: "none" }
        });
        expect(result.effect.events.map(({ type }) => type)).toContain("manager_plan.started");
    });
});
