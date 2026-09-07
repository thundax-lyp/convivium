import { prepareMeetingCreation } from "../../src/runtime/meeting-runtime.js";
import {
    projectManagerMeetingContext,
    projectSpeakerMeetingContext
} from "../../src/projection/status.js";
import {
    startManagerPlanning,
    submitManagerPlan,
    submitSpeakerAndAdvanceMeeting,
    type MeetingState
} from "../../src/domain/index.js";
import {
    CreateMeetingInputSchema,
    ManagerPlanSubmissionSchema,
    TurnSubmissionSchema,
    type CreateMeetingInputV1,
    type ManagerMeetingContextV1,
    type SpeakerMeetingContextV1,
    type ManagerPlanSubmissionV1,
    type TurnSubmissionV1
} from "../../src/protocol/index.js";

export interface OfflineMeetingProtocolFixture {
    createInput: CreateMeetingInputV1;
    planningState: MeetingState;
    managerContext: ManagerMeetingContextV1;
    managerSubmission: ManagerPlanSubmissionV1;
    plannedState: MeetingState;
    aContext: SpeakerMeetingContextV1;
    aSubmission: TurnSubmissionV1;
    afterAState: MeetingState;
    bContext: SpeakerMeetingContextV1;
    bSubmission: TurnSubmissionV1;
}

function speakerInput(
    context: SpeakerMeetingContextV1,
    content: string,
    replyTo?: string
): TurnSubmissionV1 {
    const input: TurnSubmissionV1 = {
        protocolVersion: 1,
        meetingId: context.meetingId,
        turnId: context.turn.id,
        stepId: context.step.id,
        attemptId: context.attempt.attemptId,
        deliveryId: context.attempt.deliveryId,
        agendaItemId: context.activeAgendaItem.id,
        kind: "statement",
        content,
        mentions: [],
        taskIds: [],
        agendaRelation: "on_topic",
        changes: {},
        ...(replyTo === undefined ? {} : { replyTo })
    };
    TurnSubmissionSchema({ ...input });
    return input;
}

export function createOfflineMeetingProtocolFixture(): OfflineMeetingProtocolFixture {
    const now = 1700000000000;
    const createInput: CreateMeetingInputV1 = {
        protocolVersion: 1,
        requestId: "offline-create-1",
        teamId: "offline-team",
        topic: "Offline protocol preparation",
        objective: "A presents amber-47; B cites A from the delivered public context.",
        selectionMode: "manager",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [{ key: "reference", description: "B cites A" }],
            hardConstraints: [],
            requiredReviewerKeys: [],
            riskAcceptanceAuthorityKeys: [],
            acceptableRiskLevel: "low"
        },
        agenda: [
            {
                key: "reference",
                title: "Sequential reference",
                objective: "A then B",
                inScope: ["public reference"],
                outOfScope: ["network"],
                completionCriteria: ["reference"],
                requiredParticipantKeys: ["a", "b"]
            }
        ],
        participants: [
            { participantKey: "a", displayName: "A" },
            { participantKey: "b", displayName: "B" }
        ],
        limits: {
            maxTurns: 2,
            maxSpeakersPerTurn: 2,
            maxTotalMessages: 4,
            speakerAttemptTimeoutMs: 60000
        }
    };
    const parsedCreate = CreateMeetingInputSchema(createInput);
    const initial = prepareMeetingCreation(
        parsedCreate,
        "offline-meeting",
        { callerBinding: "session:offline-captain", capabilityId: "captain:offline-captain" },
        { now }
    ).state;
    const planningState = startManagerPlanning(initial, {
        meetingId: "offline-meeting",
        planningAttemptId: "offline-planning-1",
        deliveryId: "offline-manager-delivery-1",
        reason: "initial_plan",
        now: now + 1,
        catalogBinding: { kind: "none" }
    }).state;
    const managerContext = projectManagerMeetingContext(planningState, [
        "participant-a",
        "participant-b"
    ]);
    const managerSubmission: ManagerPlanSubmissionV1 = {
        protocolVersion: 1,
        meetingId: managerContext.meetingId,
        planningAttemptId: managerContext.planningAttemptId,
        observedMeetingVersion: managerContext.meetingVersion,
        requestId: "offline-plan-1",
        agendaItemId: managerContext.activeAgendaItem.id,
        intent: "explore",
        objective: "A then B",
        expectedOutputs: [],
        prohibitedTopics: ["network"],
        steps: [
            {
                participantId: "participant-a",
                instruction: "Present amber-47",
                reason: "manager_selected"
            },
            { participantId: "participant-b", instruction: "Cite A", reason: "manager_selected" }
        ]
    };
    ManagerPlanSubmissionSchema(managerSubmission);
    const plannedState = submitManagerPlan(
        planningState,
        managerSubmission,
        {
            meetingId: managerSubmission.meetingId,
            planningAttemptId: managerSubmission.planningAttemptId,
            deliveryId: "offline-manager-delivery-1",
            observedMeetingVersion: managerSubmission.observedMeetingVersion,
            dispatchableParticipantIds: ["participant-a", "participant-b"],
            now: now + 2,
            managerSessionId: "offline-manager"
        },
        { turnId: "offline-turn-1", stepId: (index) => `offline-step-${index}` }
    ).state;
    const aAttempt = plannedState.currentTurn?.steps[0]?.attempt;
    if (!aAttempt) throw new Error("A attempt missing");
    const aContext = projectSpeakerMeetingContext(
        plannedState,
        "participant-a",
        aAttempt.attemptId
    );
    const aSubmission = speakerInput(
        aContext,
        "Marker: amber-47. Reason: a local fixture needs no network."
    );
    const afterAState = submitSpeakerAndAdvanceMeeting(plannedState, "participant-a", {
        meetingId: aSubmission.meetingId,
        turnId: aSubmission.turnId,
        stepId: aSubmission.stepId,
        attemptId: aSubmission.attemptId,
        deliveryId: aSubmission.deliveryId,
        agendaItemId: aSubmission.agendaItemId,
        participantId: "participant-a",
        message: {
            id: "offline-message-a",
            content: aSubmission.content,
            kind: "statement",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            createdAt: now + 3
        },
        questions: [],
        now: now + 3,
        nextPlanningAttemptId: "offline-planning-2",
        nextPlanningDeliveryId: "offline-manager-delivery-2",
        catalogBinding: { kind: "none" }
    }).state;
    const bAttempt = afterAState.currentTurn?.steps[1]?.attempt;
    if (!bAttempt) throw new Error("B attempt missing");
    const bContext = projectSpeakerMeetingContext(afterAState, "participant-b", bAttempt.attemptId);
    const aMessage = bContext.recentMessages.find((message) => message.id === "offline-message-a");
    if (!aMessage) throw new Error("A message missing from B context");
    const bSubmission = speakerInput(
        bContext,
        "I cite amber-47: a local fixture needs no network.",
        aMessage.id
    );
    return structuredClone({
        createInput,
        planningState,
        managerContext,
        managerSubmission,
        plannedState,
        aContext,
        aSubmission,
        afterAState,
        bContext,
        bSubmission
    });
}
