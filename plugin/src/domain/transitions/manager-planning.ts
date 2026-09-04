import { DomainError, invalidStateTransition } from "../errors.js";
import { completedTaskSnapshots, consumeHandRaise } from "../hand-raise.js";
import {
    planManagerTurn,
    planRuleBasedTurn,
    requiredPlanningBlockers,
    type ManagerPlanIds,
    type ManagerPlanInput
} from "../planning.js";
import type {
    DomainEffect,
    MeetingState,
    MeetingTurn,
    ManagerPlanningAttempt,
    TransitionResult
} from "../model.js";
import { transitionManagerAttempt } from "./kernel.js";
import { transitionMeeting } from "./meeting.js";
import type { StartManagerPlanningContext, SubmitManagerPlanContext } from "./types.js";

export type ManagerFallbackReasonCode =
    "manager_plan_invalid" | "manager_timeout" | "manager_delivery_retry_exhausted";

function requiredUnavailable(state: MeetingState, context: SubmitManagerPlanContext): string[] {
    return requiredPlanningBlockers(state, context.dispatchableParticipantIds);
}

function waitForRequiredParticipant(
    state: MeetingState,
    context: SubmitManagerPlanContext,
    ids: ManagerPlanIds,
    reasonCode?: ManagerFallbackReasonCode
): TransitionResult<MeetingState> {
    const participantIds = requiredUnavailable(state, context);
    if (participantIds.length === 0) throw new Error("wait requires unavailable participant");
    const attempt = state.manager.currentPlanningAttempt!;
    const nextState: MeetingState = {
        ...state,
        version: state.version + 1,
        updatedAt: context.now,
        status: "waiting",
        currentTurn: undefined,
        waitState: {
            reason: "required_participant_unavailable",
            waitingSince: context.now,
            taskIds: [],
            participantIds,
            ...(state.activeAgendaItemId ? { resumeAgendaItemId: state.activeAgendaItemId } : {})
        },
        manager: {
            ...state.manager,
            status: "idle",
            currentPlanningAttempt: { ...attempt, status: "failed" }
        }
    };
    return {
        state: nextState,
        effect: {
            events: [
                ...(reasonCode
                    ? [
                          {
                              type: "manager_plan.failed" as const,
                              payload: {
                                  meetingId: state.id,
                                  planningAttemptId: attempt.id,
                                  reasonCode
                              }
                          }
                      ]
                    : []),
                {
                    type: "meeting.waiting",
                    payload: {
                        meetingId: state.id,
                        from: state.status,
                        to: "waiting",
                        reason: "required_participant_unavailable",
                        participantIds,
                        meetingVersion: nextState.version
                    }
                }
            ]
        }
    };
}

export function failManagerPlanningAndCreateFallback(
    state: MeetingState,
    context: SubmitManagerPlanContext & { reasonCode: ManagerFallbackReasonCode },
    ids: ManagerPlanIds
): TransitionResult<MeetingState> {
    if (requiredUnavailable(state, context).length > 0) {
        return waitForRequiredParticipant(state, context, ids, context.reasonCode);
    }
    const attempt = state.manager.currentPlanningAttempt!;
    const fallbackAction =
        attempt.reason === "refocus" || attempt.reason === "replan" ? attempt.reason : "normal";
    const planned = planRuleBasedTurn(
        state,
        { turnId: ids.turnId, stepId: (participantId, index) => ids.stepId(index) },
        context.now,
        fallbackAction
    );
    const firstStep = planned.steps[0]!;
    const firstAttempt = {
        attemptId: `${planned.id}-attempt-0`,
        deliveryId: `${planned.id}-delivery-0`,
        participantId: firstStep.speaker,
        meetingId: state.id,
        turnId: planned.id,
        stepId: firstStep.id,
        contextFromSeq: 0,
        contextThroughSeq: state.messageSeq,
        taskSnapshots: completedTaskSnapshots(state, firstStep.speaker, context.now),
        assignedAt: context.now,
        ...(state.limits.speakerAttemptTimeoutMs === undefined
            ? {}
            : { deadlineAt: context.now + state.limits.speakerAttemptTimeoutMs }),
        status: "running" as const,
        deliveryStatus: "pending" as const
    };
    const nextState: MeetingState = {
        ...state,
        version: state.version + 1,
        updatedAt: context.now,
        manager: {
            ...state.manager,
            status: "idle",
            currentPlanningAttempt: { ...attempt, status: "failed" }
        },
        currentTurn: {
            ...planned,
            status: "running",
            reason: "manager_fallback",
            steps: planned.steps.map((step, index) =>
                index === 0 ? { ...step, status: "running" as const, attempt: firstAttempt } : step
            )
        },
        turnSeq: planned.seq,
        participants: state.participants.map((participant) =>
            participant.id === firstStep.speaker
                ? { ...participant, status: "speaking" as const }
                : participant
        )
    };
    return {
        state: nextState,
        effect: {
            events: [
                {
                    type: "manager_plan.failed",
                    payload: {
                        meetingId: state.id,
                        planningAttemptId: attempt.id,
                        reasonCode: context.reasonCode,
                        meetingVersion: nextState.version
                    }
                },
                {
                    type: "turn.planned",
                    payload: {
                        meetingId: state.id,
                        turnId: planned.id,
                        meetingVersion: nextState.version
                    }
                },
                {
                    type: "turn.started",
                    payload: {
                        meetingId: state.id,
                        turnId: planned.id,
                        meetingVersion: nextState.version
                    }
                },
                {
                    type: "speaker.assigned",
                    payload: {
                        meetingId: state.id,
                        turnId: planned.id,
                        stepId: firstStep.id,
                        participantId: firstStep.speaker,
                        meetingVersion: nextState.version
                    }
                }
            ]
        }
    };
}

export function startManagerPlanning(
    state: MeetingState,
    context: StartManagerPlanningContext
): TransitionResult<MeetingState> {
    if (context.meetingId !== state.id) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `planning context does not belong to meeting ${state.id}`,
            { entityType: "meeting", entityId: state.id, meetingVersion: state.version }
        );
    }
    if (state.selectionMode !== "manager" && state.selectionMode !== "hybrid") {
        throw new DomainError(
            "UNSUPPORTED_CAPABILITY",
            `meeting ${state.id} does not use manager selection`,
            { entityType: "meeting", entityId: state.id, meetingVersion: state.version }
        );
    }
    if (state.currentTurn !== undefined || state.manager.currentPlanningAttempt !== undefined) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} already has active execution state`,
            { entityType: "meeting", entityId: state.id, meetingVersion: state.version }
        );
    }
    const continuingRunningMeeting =
        state.status === "running" && state.handRaises.some((raise) => raise.status === "pending");
    const restartingRunningMeeting =
        state.status === "running" && context.allowRunningRestart === true;
    if (
        !continuingRunningMeeting &&
        !restartingRunningMeeting &&
        state.status !== "created" &&
        state.status !== "waiting"
    ) {
        throw invalidStateTransition("meeting", state.id, state.status, "running", state.version);
    }

    const meeting =
        continuingRunningMeeting || restartingRunningMeeting
            ? {
                  state: {
                      ...state,
                      version: state.version + 1,
                      updatedAt: context.now
                  },
                  effect: { events: [] as DomainEffect["events"] }
              }
            : transitionMeeting(state, "running", {
                  now: context.now,
                  reason: context.reason
              });
    const planningAttempt: ManagerPlanningAttempt = {
        id: context.planningAttemptId,
        meetingId: state.id,
        observedMeetingVersion: meeting.state.version,
        reason: context.reason,
        deliveryId: context.deliveryId,
        status: "running",
        createdAt: context.now,
        catalogBinding: context.catalogBinding,
        ...(state.limits.speakerAttemptTimeoutMs === undefined
            ? {}
            : { deadlineAt: context.now + state.limits.speakerAttemptTimeoutMs })
    };
    const nextState: MeetingState = {
        ...meeting.state,
        activeAgendaItemId: meeting.state.activeAgendaItemId ?? meeting.state.agenda[0]?.id,
        agenda: meeting.state.agenda.map((item, index) =>
            index === 0 && item.status === "pending"
                ? { ...item, status: "discussing" as const }
                : item
        ),
        manager: {
            ...meeting.state.manager,
            status: "planning",
            currentPlanningAttempt: planningAttempt
        },
        managerPlanningSeq: meeting.state.managerPlanningSeq + 1
    };
    return {
        state: nextState,
        effect: {
            events: [
                ...meeting.effect.events,
                {
                    type: "manager_plan.started",
                    payload: {
                        meetingId: state.id,
                        planningAttemptId: planningAttempt.id,
                        deliveryId: planningAttempt.deliveryId,
                        reason: planningAttempt.reason,
                        meetingVersion: nextState.version,
                        observedMeetingVersion: planningAttempt.observedMeetingVersion
                    }
                }
            ]
        }
    };
}

export function submitManagerPlan(
    state: MeetingState,
    input: ManagerPlanInput,
    context: SubmitManagerPlanContext,
    ids: ManagerPlanIds
): TransitionResult<MeetingState> {
    const planningAttempt = state.manager.currentPlanningAttempt;
    if (
        context.meetingId !== state.id ||
        context.planningAttemptId !== planningAttempt?.id ||
        context.deliveryId !== planningAttempt?.deliveryId ||
        context.observedMeetingVersion !== state.version ||
        planningAttempt?.observedMeetingVersion !== state.version ||
        planningAttempt.status !== "running"
    ) {
        throw new DomainError(
            "STALE_MANAGER_ATTEMPT",
            `manager planning attempt is stale in meeting ${state.id}`,
            {
                entityType: "manager_attempt",
                entityId: context.planningAttemptId,
                meetingVersion: state.version
            }
        );
    }
    const dispatchable = new Set(context.dispatchableParticipantIds);
    if (requiredUnavailable(state, context).length > 0) {
        return waitForRequiredParticipant(state, context, ids);
    }

    let planned: MeetingTurn;
    try {
        const selectedUnavailable = input.steps
            .map((step) => step.participantId)
            .filter((participantId) => !dispatchable.has(participantId));
        if (selectedUnavailable.length > 0) {
            throw new DomainError(
                "MANAGER_PLAN_INVALID",
                `manager plan selects unavailable participant ${selectedUnavailable[0]}`,
                {
                    entityType: "manager_attempt",
                    entityId: planningAttempt.id,
                    meetingVersion: state.version
                }
            );
        }
        planned = planManagerTurn(state, input, ids, context.now);
    } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "MANAGER_PLAN_INVALID") throw error;
        return failManagerPlanningAndCreateFallback(
            state,
            { ...context, reasonCode: "manager_plan_invalid" },
            ids
        );
    }
    const submitted = transitionManagerAttempt(planningAttempt, "submitted", state.version, {
        attemptId: context.planningAttemptId,
        meetingId: context.meetingId,
        deliveryId: context.deliveryId
    });
    const firstStep = planned.steps[0]!;
    const firstAttempt = {
        attemptId: `${planned.id}-attempt-0`,
        participantId: firstStep.speaker,
        meetingId: state.id,
        turnId: planned.id,
        stepId: firstStep.id,
        deliveryId: `${planned.id}-delivery-0`,
        contextFromSeq: 0,
        contextThroughSeq: state.messageSeq,
        taskSnapshots: completedTaskSnapshots(state, firstStep.speaker, context.now),
        assignedAt: context.now,
        ...(state.limits.speakerAttemptTimeoutMs === undefined
            ? {}
            : { deadlineAt: context.now + state.limits.speakerAttemptTimeoutMs }),
        status: "running" as const,
        deliveryStatus: "pending" as const
    };
    const runningTurn: MeetingTurn = {
        ...planned,
        status: "running",
        steps: planned.steps.map((step, index) =>
            index === 0 ? { ...step, status: "running", attempt: firstAttempt } : step
        )
    };
    const selectedRaise = state.handRaises.find(
        (raise) => raise.status === "pending" && raise.participant === firstStep.speaker
    );
    const consumed =
        selectedRaise === undefined
            ? { state, effect: { events: [] } }
            : consumeHandRaise(state, selectedRaise.id);
    const nextState: MeetingState = {
        ...consumed.state,
        version: state.version + 1,
        updatedAt: context.now,
        manager: { ...state.manager, status: "idle", currentPlanningAttempt: undefined },
        currentTurn: runningTurn,
        turnSeq: runningTurn.seq,
        participants: state.participants.map((participant) =>
            participant.id === firstStep.speaker
                ? { ...participant, status: "speaking" as const }
                : participant
        )
    };
    const meetingVersion = nextState.version;
    return {
        state: nextState,
        effect: {
            events: [
                ...submitted.effect.events.map((item) => ({
                    ...item,
                    payload: { ...item.payload, meetingVersion }
                })),
                { type: "turn.planned", payload: { turnId: planned.id, meetingVersion } },
                { type: "turn.started", payload: { turnId: planned.id, meetingVersion } },
                {
                    type: "speaker.assigned",
                    payload: {
                        meetingId: state.id,
                        turnId: planned.id,
                        stepId: firstStep.id,
                        participantId: firstStep.speaker,
                        attemptId: firstAttempt.attemptId,
                        deliveryId: firstAttempt.deliveryId,
                        meetingVersion
                    }
                },
                {
                    type: "speaker.started",
                    payload: { stepId: firstStep.id, meetingVersion }
                },
                {
                    type: "speaker_attempt.started",
                    payload: { attemptId: firstAttempt.attemptId, meetingVersion }
                }
            ]
        }
    };
}
