import { DomainError } from "@/domain/errors.js";
import { queueMeetingTasks } from "@/domain/meeting-task.js";
import type { MeetingState, TransitionResult } from "@/domain/model.js";
import { applyPublicSubmission } from "./public-submission.js";
import { submitSpeakerAttempt } from "./speaker-attempt.js";
import { advanceAfterSpeakerSubmission } from "./turn-advancement.js";
import type { SubmitSpeakerAdvanceContext } from "./types.js";

export function submitSpeakerAndAdvanceMeeting(
    state: MeetingState,
    participantId: string,
    context: SubmitSpeakerAdvanceContext
): TransitionResult<MeetingState> {
    const speakerSubmission = submitSpeakerAttempt(state, participantId, state.version, context);
    const completedSubmission = applyPublicSubmission(
        speakerSubmission.state,
        participantId,
        context
    );
    const omittedTask = (speakerSubmission.state.meetingTasks ?? []).find(
        (task) =>
            task.status === "requested" &&
            task.participantId === participantId &&
            task.originatingSpeakerAttemptId === context.attemptId &&
            !context.message.taskIds.includes(task.meetingTaskId)
    );
    if (omittedTask !== undefined) {
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            `requested MeetingTask ${omittedTask.meetingTaskId} must be included in the originating turn submission`
        );
    }
    const requestedTaskIds = context.message.taskIds.filter((meetingTaskId) =>
        completedSubmission.state.meetingTasks.some(
            (task) =>
                task.meetingTaskId === meetingTaskId &&
                task.status === "requested" &&
                task.participantId === participantId &&
                task.originatingSpeakerAttemptId === context.attemptId
        )
    );
    const queued = requestedTaskIds.length
        ? queueMeetingTasks(
              completedSubmission.state,
              requestedTaskIds,
              participantId,
              context.attemptId,
              context.now
          )
        : { state: completedSubmission.state, effect: { events: [] } };
    const submitted: TransitionResult<MeetingState> = {
        state: queued.state,
        effect: {
            events: [
                ...speakerSubmission.effect.events,
                ...completedSubmission.effect.events,
                ...queued.effect.events
            ]
        }
    };

    return advanceAfterSpeakerSubmission(state, participantId, context, submitted);
}
