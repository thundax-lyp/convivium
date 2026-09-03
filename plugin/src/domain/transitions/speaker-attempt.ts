import { DomainError } from "../errors.js";
import { cancelRequestedMeetingTasksForAttempts } from "../meeting-task.js";
import type { MeetingState, SpeakerSubmissionContext, TransitionResult } from "../model.js";
import { transitionAttempt, transitionStep } from "./kernel.js";
import { executionTerminalStatuses } from "./termination.js";
import { advanceAfterSpeakerSubmission } from "./turn-advancement.js";

export function submitSpeakerAttempt(
    state: MeetingState,
    participantId: string,
    meetingVersion: number,
    context: SpeakerSubmissionContext
): TransitionResult<MeetingState> {
    if (executionTerminalStatuses.includes(state.status)) {
        throw new DomainError("IMMUTABLE_MEETING", `meeting ${state.id} is immutable`, {
            entityType: "meeting",
            entityId: state.id,
            meetingVersion: state.version
        });
    }
    const participant = state.participants.find(({ id }) => id === participantId);
    const turn = state.currentTurn;
    const step = turn?.steps[turn.currentStepIndex];
    const attempt = step?.attempt;
    if (
        meetingVersion !== state.version ||
        context.meetingId !== state.id ||
        !participant ||
        !turn ||
        turn.status !== "running" ||
        turn.agendaItemId !== context.agendaItemId ||
        !step ||
        step.status !== "running" ||
        !attempt ||
        attempt.attemptId !== context.attemptId ||
        attempt.participantId !== participantId
    ) {
        throw new DomainError(
            "STALE_ATTEMPT",
            `attempt ${context.attemptId} is not current in meeting ${state.id}`,
            { entityType: "attempt", entityId: context.attemptId, meetingVersion }
        );
    }
    if (state.transcript.some(({ id }) => id === context.message.id)) {
        throw new DomainError(
            "STALE_ATTEMPT",
            `message ${context.message.id} was already committed`,
            { entityType: "attempt", entityId: context.attemptId, meetingVersion }
        );
    }

    const attemptResult = transitionAttempt(attempt, "submitted", meetingVersion, context);
    const stepResult = transitionStep(
        { ...step, attempt: attemptResult.state },
        "submitted",
        meetingVersion
    );
    const steps = turn.steps.map((candidate, index) =>
        index === turn.currentStepIndex ? stepResult.state : candidate
    );
    const completed = steps.every(({ status }) =>
        ["submitted", "skipped", "revoked", "failed"].includes(status)
    );
    const currentTurn = {
        ...turn,
        steps,
        currentStepIndex: completed ? steps.length : turn.currentStepIndex + 1,
        ...(completed
            ? { status: "completed" as const, completedAt: context.message.createdAt }
            : {})
    };
    const message = {
        ...context.message,
        seq: state.messageSeq + 1,
        turnSeq: turn.seq,
        turnId: turn.id,
        stepId: step.id,
        attemptId: attempt.attemptId,
        speaker: participantId,
        agendaItemId: turn.agendaItemId
    };
    const events = [
        ...attemptResult.effect.events,
        ...stepResult.effect.events,
        {
            type: "message.added" as const,
            payload: {
                meetingId: state.id,
                messageId: message.id,
                attemptId: attempt.attemptId,
                meetingVersion: state.version + 1
            }
        },
        ...(completed
            ? [
                  {
                      type: "turn.completed" as const,
                      payload: {
                          turnId: turn.id,
                          meetingId: state.id,
                          meetingVersion: state.version + 1
                      }
                  },
                  {
                      type: "meeting.waiting" as const,
                      payload: {
                          meetingId: state.id,
                          from: state.status,
                          to: "waiting",
                          meetingVersion: state.version + 1,
                          reason: "turn completed"
                      }
                  }
              ]
            : [])
    ];
    return {
        state: {
            ...state,
            status: completed ? "waiting" : state.status,
            version: state.version + 1,
            updatedAt: context.message.createdAt,
            messageSeq: message.seq,
            eventSeq: state.eventSeq + events.length,
            transcript: [...state.transcript, message],
            participants: state.participants.map((candidate) =>
                candidate.id === participantId
                    ? {
                          ...candidate,
                          lastDeliveredSeq: Math.max(
                              candidate.lastDeliveredSeq,
                              attempt.contextThroughSeq
                          ),
                          lastAcknowledgedSeq: Math.max(
                              candidate.lastAcknowledgedSeq,
                              attempt.contextThroughSeq
                          ),
                          totalSpeeches: candidate.totalSpeeches + 1,
                          consecutiveAttemptFailures: 0,
                          status: "available" as const
                      }
                    : candidate
            ),
            currentTurn,
            ...(completed
                ? {
                      waitState: {
                          reason: "captain_action",
                          waitingSince: context.now,
                          taskIds: [],
                          participantIds: [],
                          resumeAgendaItemId: turn.agendaItemId
                      }
                  }
                : {})
        },
        effect: { events }
    };
}

export interface FailSpeakerAttemptContext {
    readonly meetingId: string;
    readonly participantId: string;
    readonly turnId: string;
    readonly stepId: string;
    readonly attemptId: string;
    readonly deliveryId: string;
    readonly agendaItemId: string;
    readonly now: number;
    readonly nextPlanningAttemptId: string;
    readonly nextPlanningDeliveryId: string;
}

/** Records one expired current attempt; the normal turn-advance path owns the next step. */
export function failSpeakerAttempt(
    state: MeetingState,
    context: FailSpeakerAttemptContext
): TransitionResult<MeetingState> {
    const participant = state.participants.find(({ id }) => id === context.participantId);
    const turn = state.currentTurn;
    const step = turn?.steps[turn.currentStepIndex];
    const attempt = step?.attempt;
    if (
        state.status !== "running" ||
        participant === undefined ||
        turn?.status !== "running" ||
        turn.id !== context.turnId ||
        turn.agendaItemId !== context.agendaItemId ||
        step?.status !== "running" ||
        step.id !== context.stepId ||
        attempt?.status !== "running" ||
        attempt.attemptId !== context.attemptId ||
        attempt.deliveryId !== context.deliveryId ||
        attempt.participantId !== context.participantId
    ) {
        throw new DomainError("STALE_ATTEMPT", `attempt ${context.attemptId} is not current`, {
            entityType: "attempt",
            entityId: context.attemptId,
            meetingVersion: state.version
        });
    }
    const revokedAttempt = transitionAttempt(attempt, "revoked", state.version, {
        ...context,
        reason: "timeout"
    });
    const revokedStep = transitionStep(
        { ...step, attempt: { ...revokedAttempt.state, completedAt: context.now } },
        "revoked",
        state.version,
        "timeout"
    );
    const cancelled = cancelRequestedMeetingTasksForAttempts(
        state,
        [attempt.attemptId],
        context.now
    );
    const steps = turn.steps.map((candidate, index) =>
        index === turn.currentStepIndex ? revokedStep.state : candidate
    );
    const completed = steps.every(({ status }) =>
        ["submitted", "skipped", "revoked", "failed"].includes(status)
    );
    const events = [
        ...revokedAttempt.effect.events,
        ...revokedStep.effect.events,
        ...cancelled.effect.events,
        ...(completed
            ? [
                  {
                      type: "turn.completed" as const,
                      payload: { turnId: turn.id, meetingVersion: state.version + 1 }
                  },
                  {
                      type: "meeting.waiting" as const,
                      payload: {
                          meetingId: state.id,
                          from: state.status,
                          to: "waiting",
                          meetingVersion: state.version + 1,
                          reason: "speaker attempt failed"
                      }
                  }
              ]
            : [])
    ];
    const revoked: TransitionResult<MeetingState> = {
        state: {
            ...cancelled.state,
            status: completed ? "waiting" : state.status,
            version: state.version + 1,
            updatedAt: context.now,
            eventSeq: state.eventSeq + events.length,
            currentTurn: {
                ...turn,
                steps,
                currentStepIndex: completed ? steps.length : turn.currentStepIndex + 1,
                ...(completed ? { status: "completed" as const, completedAt: context.now } : {})
            },
            participants: state.participants.map((candidate) =>
                candidate.id === participant.id
                    ? {
                          ...candidate,
                          status: "available" as const,
                          consecutiveAttemptFailures: candidate.consecutiveAttemptFailures + 1
                      }
                    : candidate
            ),
            ...(completed
                ? {
                      waitState: {
                          reason: "captain_action",
                          waitingSince: context.now,
                          taskIds: [],
                          participantIds: [],
                          resumeAgendaItemId: turn.agendaItemId
                      }
                  }
                : {})
        },
        effect: { events }
    };
    return advanceAfterSpeakerSubmission(state, participant.id, context, revoked);
}
