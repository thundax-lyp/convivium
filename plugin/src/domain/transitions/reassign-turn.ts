import { DomainError } from "../errors.js";
import { completedTaskSnapshots, participantHasActiveMeetingTask } from "../hand-raise.js";
import { cancelRequestedMeetingTasksForAttempts } from "../meeting-task.js";
import type { MeetingState, SpeakerAttempt, TransitionResult } from "../model.js";

export interface ReassignTurnContext {
    readonly currentAttemptId: string;
    readonly action: "reassign" | "skip";
    readonly replacementParticipantId?: string;
    readonly reason: string;
    readonly now: number;
}

function requireCurrentAttempt(state: MeetingState, context: ReassignTurnContext) {
    const turn = state.currentTurn;
    const step = turn?.steps[turn.currentStepIndex];
    const attempt = step?.attempt;
    if (
        state.status !== "running" ||
        turn?.status !== "running" ||
        step?.status !== "running" ||
        attempt?.status !== "running" ||
        attempt.attemptId !== context.currentAttemptId
    ) {
        throw new DomainError(
            "STALE_ATTEMPT",
            `attempt ${context.currentAttemptId} is not the current running speaker attempt`,
            {
                entityType: "attempt",
                entityId: context.currentAttemptId,
                meetingVersion: state.version
            }
        );
    }
    return { turn, step, attempt };
}

function replacementAttempt(
    state: MeetingState,
    previous: SpeakerAttempt,
    participantId: string,
    stepId: string,
    now: number
): SpeakerAttempt {
    const suffix = `reassign-${state.version + 1}`;
    return {
        ...previous,
        attemptId: `${previous.attemptId}-${suffix}`,
        participantId,
        stepId,
        deliveryId: `${previous.deliveryId}-${suffix}`,
        contextThroughSeq: state.messageSeq,
        taskSnapshots: completedTaskSnapshots(state, participantId, now),
        assignedAt: now,
        ...(state.limits.speakerAttemptTimeoutMs === undefined
            ? {}
            : { deadlineAt: now + state.limits.speakerAttemptTimeoutMs }),
        startedAt: undefined,
        completedAt: undefined,
        status: "running",
        deliveryStatus: "pending"
    };
}

export function reassignTurn(
    state: MeetingState,
    context: ReassignTurnContext
): TransitionResult<MeetingState> {
    if (!context.reason.trim()) {
        throw new DomainError("INVALID_ENTITY_STATE", "turn reassignment requires a reason");
    }
    const { turn, step, attempt } = requireCurrentAttempt(state, context);
    const revocationEvent = {
        type: "speaker_attempt.revoked" as const,
        payload: { meetingId: state.id, attemptId: attempt.attemptId, reason: context.reason }
    };
    const revokedAttempt = { ...attempt, status: "revoked" as const, completedAt: context.now };
    const revokedStep = { ...step, status: "revoked" as const, attempt: revokedAttempt };
    const cancelled = cancelRequestedMeetingTasksForAttempts(
        state,
        [attempt.attemptId],
        context.now
    );

    if (context.action === "reassign") {
        const replacementId = context.replacementParticipantId;
        const replacement = state.participants.find(
            (participant) => participant.id === replacementId
        );
        if (
            replacementId === undefined ||
            replacementId === attempt.participantId ||
            replacement === undefined ||
            replacement.status !== "available" ||
            participantHasActiveMeetingTask(cancelled.state, replacementId)
        ) {
            throw new DomainError(
                "REQUIRED_SPEAKER_UNAVAILABLE",
                "The replacement Participant is unavailable for the current turn.",
                {
                    entityType: "participant",
                    entityId: replacementId,
                    meetingVersion: state.version
                }
            );
        }
        const nextAttempt = replacementAttempt(
            cancelled.state,
            attempt,
            replacementId,
            step.id,
            context.now
        );
        const nextState = {
            ...cancelled.state,
            version: state.version + 1,
            updatedAt: context.now,
            eventSeq: state.eventSeq + 4 + cancelled.effect.events.length,
            currentTurn: {
                ...turn,
                steps: turn.steps.map((candidate, index) =>
                    index === turn.currentStepIndex
                        ? {
                              ...revokedStep,
                              speaker: replacementId,
                              status: "running" as const,
                              attempt: nextAttempt
                          }
                        : candidate
                )
            },
            participants: cancelled.state.participants.map((participant) =>
                participant.id === attempt.participantId
                    ? { ...participant, status: "available" as const }
                    : participant.id === replacementId
                      ? { ...participant, status: "speaking" as const }
                      : participant
            )
        };
        return {
            state: nextState,
            effect: {
                events: [
                    revocationEvent,
                    ...cancelled.effect.events,
                    {
                        type: "speaker.assigned",
                        payload: {
                            meetingId: state.id,
                            turnId: turn.id,
                            stepId: step.id,
                            participantId: replacementId,
                            attemptId: nextAttempt.attemptId,
                            deliveryId: nextAttempt.deliveryId,
                            meetingVersion: nextState.version
                        }
                    },
                    {
                        type: "speaker.started",
                        payload: { stepId: step.id, meetingVersion: nextState.version }
                    },
                    {
                        type: "speaker_attempt.started",
                        payload: {
                            attemptId: nextAttempt.attemptId,
                            meetingVersion: nextState.version
                        }
                    }
                ]
            }
        };
    }

    const nextIndex = turn.currentStepIndex + 1;
    const nextStep = turn.steps[nextIndex];
    const completed = nextStep === undefined;
    const nextAttempt = completed
        ? undefined
        : replacementAttempt(cancelled.state, attempt, nextStep.speaker, nextStep.id, context.now);
    const nextState = {
        ...cancelled.state,
        status: completed ? ("waiting" as const) : cancelled.state.status,
        version: state.version + 1,
        updatedAt: context.now,
        eventSeq: state.eventSeq + (completed ? 4 : 5) + cancelled.effect.events.length,
        currentTurn: {
            ...turn,
            status: completed ? ("completed" as const) : turn.status,
            currentStepIndex: completed ? turn.steps.length : nextIndex,
            completedAt: completed ? context.now : turn.completedAt,
            steps: turn.steps.map((candidate, index) =>
                index === turn.currentStepIndex
                    ? { ...revokedStep, status: "skipped" as const }
                    : index === nextIndex && nextAttempt !== undefined
                      ? { ...candidate, status: "running" as const, attempt: nextAttempt }
                      : candidate
            )
        },
        ...(completed
            ? {
                  waitState: {
                      reason: "turn completed after Captain skipped speaker",
                      taskIds: [],
                      participantIds: [],
                      resumeAgendaItemId: turn.agendaItemId
                  }
              }
            : {}),
        participants: cancelled.state.participants.map((participant) =>
            participant.id === nextAttempt?.participantId
                ? { ...participant, status: "speaking" as const }
                : participant.id === attempt.participantId
                  ? { ...participant, status: "available" as const }
                  : participant
        )
    };
    return {
        state: nextState,
        effect: {
            events: [
                revocationEvent,
                ...cancelled.effect.events,
                {
                    type: "speaker.skipped",
                    payload: { stepId: step.id, meetingVersion: nextState.version }
                },
                ...(completed
                    ? [
                          {
                              type: "turn.completed" as const,
                              payload: { turnId: turn.id, meetingVersion: nextState.version }
                          },
                          {
                              type: "meeting.waiting" as const,
                              payload: {
                                  meetingId: state.id,
                                  from: state.status,
                                  to: "waiting",
                                  meetingVersion: nextState.version,
                                  reason: nextState.waitState!.reason
                              }
                          }
                      ]
                    : [
                          {
                              type: "speaker.assigned" as const,
                              payload: {
                                  meetingId: state.id,
                                  turnId: turn.id,
                                  stepId: nextStep!.id,
                                  participantId: nextAttempt!.participantId,
                                  attemptId: nextAttempt!.attemptId,
                                  deliveryId: nextAttempt!.deliveryId,
                                  meetingVersion: nextState.version
                              }
                          },
                          {
                              type: "speaker.started" as const,
                              payload: { stepId: nextStep!.id, meetingVersion: nextState.version }
                          },
                          {
                              type: "speaker_attempt.started" as const,
                              payload: {
                                  attemptId: nextAttempt!.attemptId,
                                  meetingVersion: nextState.version
                              }
                          }
                      ])
            ]
        }
    };
}
