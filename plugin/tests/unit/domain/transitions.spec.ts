import { describe, expect, it } from "vitest";
import {
    DomainError,
    type ArchivePackage,
    type MeetingState,
    submitSpeakerAttempt,
    submitSpeakerAndAdvanceMeeting,
    startManagerPlanning,
    submitManagerPlan,
    transitionAttempt,
    transitionManagerAttempt,
    transitionMeeting,
    transitionStep,
    transitionTurn
} from "../../../src/domain/index.js";

const now = 1_700_000_000_000;

function meeting(status: MeetingState["status"] = "created"): MeetingState {
    return {
        id: "meeting-1",
        teamId: "team-1",
        status,
        participants: [],
        manager: { promptVersion: "test", status: "idle" },
        agenda: [],
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
        decisions: [],
        openQuestions: [],
        handRaises: [],
        completionFacts: [],
        artifactRefs: [],
        continuationMaterials: [],
        turnSeq: 0,
        messageSeq: 0,
        eventSeq: 0,
        stallCount: 0,
        replanCount: 0,
        selectionMode: "hybrid",
        limits: {
            maxTurns: 10,
            maxSpeakersPerTurn: 5,
            maxTotalMessages: 100,
            maxConsecutiveSpeechesPerSpeaker: 2,
            maxConsecutiveAttemptFailuresPerParticipant: 3,
            maxDeliveryRetries: 5,
            maxStalls: 3,
            maxReplans: 1
        },
        version: 3,
        createdAt: now - 1000,
        updatedAt: now - 1000,
        termination: [
            "completed",
            "partial",
            "no_consensus",
            "cancelled",
            "failed",
            "archiving"
        ].includes(status)
            ? {
                  code: "objective_satisfied",
                  reason: "done",
                  decisionIds: [],
                  unresolvedQuestionIds: [],
                  dissentingPositionIds: [],
                  blockingAgendaItemIds: [],
                  finalMessage: "done",
                  endedAt: now
              }
            : undefined
    };
}

function archivePackage(): ArchivePackage {
    return {
        schemaVersion: 1,
        meetingId: "meeting-1",
        teamId: "team-1",
        objectiveContract: meeting().objectiveContract,
        finalSummary: "summary",
        artifactRefs: [],
        acceptedDecisions: [],
        proposals: [],
        completionFacts: [],
        agenda: [],
        issues: [],
        unresolvedQuestions: [],
        parkingLot: [],
        formalTranscript: [],
        participantProvenance: [],
        termination: {
            code: "objective_satisfied",
            reason: "done",
            decisionIds: [],
            unresolvedQuestionIds: [],
            dissentingPositionIds: [],
            blockingAgendaItemIds: [],
            finalMessage: "done",
            endedAt: now
        },
        endedAt: now,
        materializedAt: now
    };
}

describe("meeting transitions", () => {
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
            nextPlanningDeliveryId: "planning-delivery-2"
        });
        expect(result.state.version).toBe(state.version + 1);
        expect(result.state.currentTurn?.steps[1]?.attempt?.participantId).toBe("b");
        expect(result.state.currentTurn?.steps.filter((step) => step.attempt).length).toBe(2);
        expect(result.state.messageSeq).toBe(1);
        expect(result.state.eventSeq).toBe(state.eventSeq + result.effect.events.length);
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
            nextPlanningDeliveryId: "unused-planning-delivery-2"
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

    it("ends a completed turn from the committed running state", () => {
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
            nextPlanningDeliveryId: "planning-delivery-2"
        });
        expect(result.state.status).toBe("completed");
        expect(result.effect.events).toContainEqual({
            type: "meeting.ended",
            payload: expect.objectContaining({ from: "running", to: "completed" })
        });
    });

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

    it("rejects round-robin meetings and duplicate planning state", () => {
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

        const result = transitionMeeting(state, "paused", {
            now,
            reason: "captain request",
            pause: { at: now, by: { kind: "captain", actorId: "captain-1" } }
        });

        expect(result.state.currentTurn?.status).toBe("truncated");
        expect(result.state.currentTurn?.steps[0].status).toBe("revoked");
        expect(result.state.currentTurn?.steps[0].attempt?.status).toBe("revoked");
        expect(result.state.manager.currentPlanningAttempt?.status).toBe("revoked");
        expect(result.effect.events.map(({ type }) => type)).toEqual([
            "meeting.paused",
            "speaker_attempt.revoked",
            "manager_plan.revoked"
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
        state.openQuestions = [{ id: "question-1", text: "question", status: "open" }];

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

    it("requires a materialized archive before archived", () => {
        const archivingMeeting = meeting("archiving");
        expect(() => transitionMeeting(archivingMeeting, "archived", { now })).toThrowError(
            expect.objectContaining({ code: "MISSING_ARCHIVE" })
        );

        const materialized = transitionMeeting(meeting("completed"), "archiving", {
            now,
            archive: { package: archivePackage() }
        }).state;
        const result = transitionMeeting(materialized, "archived", {
            now,
            archive: { archivedAt: now }
        });
        expect(result.state.archive?.package.meetingId).toBe("meeting-1");
        expect(result.state.archive?.archivedAt).toBe(now);
    });

    it("rejects an archive package that disagrees with the terminal facts", () => {
        const archive = archivePackage();
        archive.termination = {
            ...archive.termination,
            finalMessage: "different"
        };
        expect(() =>
            transitionMeeting(meeting("completed"), "archiving", {
                now,
                archive: { package: archive }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("requires archive packages to include committed facts", () => {
        const state = meeting("completed");
        state.transcript = [
            {
                id: "message-1",
                seq: 1,
                turnSeq: 1,
                turnId: "turn-1",
                stepId: "step-1",
                attemptId: "attempt-1",
                speaker: "participant-1",
                agendaItemId: "agenda-1",
                agendaRelation: "on_topic",
                kind: "statement",
                mentions: [],
                taskIds: [],
                createdAt: now,
                content: "committed fact"
            }
        ];

        expect(() =>
            transitionMeeting(state, "archiving", {
                now,
                archive: { package: archivePackage() }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("rejects archive cross-references that are not meeting facts", () => {
        const archive = archivePackage();
        archive.proposals = [
            {
                id: "proposal-1",
                agendaItemId: "missing-agenda",
                title: "proposal",
                description: "proposal",
                revision: 1,
                status: "draft",
                positions: []
            }
        ];
        expect(() =>
            transitionMeeting(meeting("completed"), "archiving", {
                now,
                archive: { package: archive }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("rejects termination references to unknown positions and agenda items", () => {
        const state = meeting("running");
        expect(() =>
            transitionMeeting(state, "completed", {
                now,
                termination: {
                    code: "objective_satisfied",
                    reason: "done",
                    decisionIds: [],
                    unresolvedQuestionIds: [],
                    dissentingPositionIds: ["missing-position"],
                    blockingAgendaItemIds: ["missing-agenda"],
                    finalMessage: "done",
                    endedAt: now
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("rejects archive facts from another meeting or team", () => {
        const archive = archivePackage();
        archive.meetingId = "meeting-2";
        expect(() =>
            transitionMeeting(
                transitionMeeting(meeting("completed"), "archiving", {
                    now,
                    archive: { package: archivePackage() }
                }).state,
                "archived",
                {
                    now,
                    archive: { package: archive, archivedAt: now }
                }
            )
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("revokes active attempts before entering archiving", () => {
        const state = meeting("completed");
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
                        deliveryStatus: "acknowledged",
                        contextFromSeq: 0,
                        taskSnapshots: [],
                        assignedAt: now,
                        contextThroughSeq: 0
                    }
                }
            ]
        };

        const result = transitionMeeting(state, "archiving", {
            now,
            archive: { package: archivePackage() }
        });

        expect(result.state.currentTurn?.status).toBe("truncated");
        expect(result.state.currentTurn?.steps[0].attempt?.status).toBe("revoked");
        expect(result.effect.events.map(({ type }) => type)).toContain("speaker_attempt.revoked");
    });

    it("snapshots termination facts before returning the terminal state", () => {
        const termination = {
            code: "objective_satisfied" as const,
            reason: "done",
            decisionIds: [] as string[],
            unresolvedQuestionIds: [] as string[],
            dissentingPositionIds: [] as string[],
            blockingAgendaItemIds: [] as string[],
            finalMessage: "done",
            endedAt: now
        };
        const result = transitionMeeting(meeting("running"), "completed", {
            now,
            termination
        });

        termination.decisionIds.push("mutated-after-transition");
        termination.finalMessage = "mutated-after-transition";
        expect(result.state.termination?.decisionIds).toEqual([]);
        expect(result.state.termination?.finalMessage).toBe("done");
    });

    it("snapshots the archive so later input mutation cannot change committed state", () => {
        const input = { package: archivePackage(), archivedAt: now };
        const materialized = transitionMeeting(meeting("completed"), "archiving", {
            now,
            archive: { package: input.package }
        }).state;
        const result = transitionMeeting(materialized, "archived", {
            now,
            archive: { archivedAt: now }
        });

        input.package.finalSummary = "mutated after transition";
        expect(result.state.archive?.package.finalSummary).toBe("summary");
    });
});

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

function attemptContext() {
    return {
        attemptId: "attempt-1",
        participantId: "participant-1",
        meetingId: "meeting-1",
        turnId: "turn-1",
        stepId: "step-1",
        deliveryId: "delivery-1"
    };
}

function managerAttemptContext() {
    return {
        attemptId: "plan-1",
        meetingId: "meeting-1",
        deliveryId: "manager-delivery-1"
    };
}
