import { applyCompletionClaims } from "../completion.js";
import { DomainError } from "../errors.js";
import { queueMeetingTasks } from "../meeting-task.js";
import type { MeetingState, TransitionResult } from "../model.js";
import { addSubmittedQuestions } from "./question.js";
import { submitSpeakerAttempt } from "./speaker-attempt.js";
import { advanceAfterSpeakerSubmission } from "./turn-advancement.js";
import type { SubmitSpeakerAdvanceContext } from "./types.js";

export function submitSpeakerAndAdvanceMeeting(
    state: MeetingState,
    participantId: string,
    context: SubmitSpeakerAdvanceContext
): TransitionResult<MeetingState> {
    const speakerSubmission = submitSpeakerAttempt(state, participantId, state.version, context);
    const questionSubmission = context.questions.length
        ? addSubmittedQuestions(
              speakerSubmission.state,
              participantId,
              context.agendaItemId,
              context.questions
          )
        : { state: speakerSubmission.state, effect: { events: [] } };
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
    const completion = context.completion
        ? applyCompletionClaims(questionSubmission.state, {
              ...context.completion,
              participantId,
              now: context.now
          })
        : undefined;
    const submissionEvents = [
        ...speakerSubmission.effect.events,
        ...questionSubmission.effect.events
    ];
    const completedSubmission = completion
        ? {
              state: completion.state,
              effect: {
                  events: [...submissionEvents, ...completion.effect.events]
              }
          }
        : { state: questionSubmission.state, effect: { events: submissionEvents } };
    const queued = context.message.taskIds.length
        ? queueMeetingTasks(
              completedSubmission.state,
              context.message.taskIds,
              participantId,
              context.attemptId,
              context.now
          )
        : { state: completedSubmission.state, effect: { events: [] } };
    const submitted: TransitionResult<MeetingState> = {
        state: queued.state,
        effect: { events: [...completedSubmission.effect.events, ...queued.effect.events] }
    };

    return advanceAfterSpeakerSubmission(state, participantId, context, submitted);
}
