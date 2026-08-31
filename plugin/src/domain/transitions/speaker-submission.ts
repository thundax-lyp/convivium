import { applyCompletionClaims } from "../completion.js";
import { DomainError } from "../errors.js";
import { queueMeetingTasks } from "../meeting-task.js";
import type { MeetingState, TransitionResult } from "../model.js";
import { addSubmittedQuestions } from "./question.js";
import { addSubmittedIssues } from "./issue.js";
import { addSubmittedAgendaCandidates } from "./agenda-candidate.js";
import { addSubmittedDecisionCandidates } from "./decision-candidate.js";
import { applySubmittedProposalPositionClaims } from "./proposal-position.js";
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
    const issueSubmission =
        (context.issues?.length ?? 0) > 0
            ? addSubmittedIssues(
                  questionSubmission.state,
                  participantId,
                  context.agendaItemId,
                  context.issues!
              )
            : { state: questionSubmission.state, effect: { events: [] } };
    const proposals = context.proposals ?? [];
    const positions = context.positions ?? [];
    const agendaCandidates = context.agendaCandidates ?? [];
    const proposalPositionSubmission =
        proposals.length || positions.length
            ? applySubmittedProposalPositionClaims(
                  issueSubmission.state,
                  participantId,
                  context.agendaItemId,
                  proposals,
                  positions
              )
            : { state: issueSubmission.state, effect: { events: [] } };
    const agendaCandidateSubmission = agendaCandidates.length
        ? addSubmittedAgendaCandidates(
              proposalPositionSubmission.state,
              participantId,
              context.message.id,
              agendaCandidates
          )
        : { state: proposalPositionSubmission.state, effect: { events: [] } };
    const decisionCandidates = context.decisionCandidates ?? [];
    const decisionCandidateSubmission = decisionCandidates.length
        ? addSubmittedDecisionCandidates(
              agendaCandidateSubmission.state,
              participantId,
              context.agendaItemId,
              context.message.id,
              decisionCandidates
          )
        : { state: agendaCandidateSubmission.state, effect: { events: [] } };
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
        ? applyCompletionClaims(decisionCandidateSubmission.state, {
              ...context.completion,
              participantId,
              now: context.now
          })
        : undefined;
    const submissionEvents = [
        ...speakerSubmission.effect.events,
        ...questionSubmission.effect.events,
        ...issueSubmission.effect.events,
        ...proposalPositionSubmission.effect.events,
        ...agendaCandidateSubmission.effect.events,
        ...decisionCandidateSubmission.effect.events
    ];
    const completedSubmission = completion
        ? {
              state: completion.state,
              effect: {
                  events: [...submissionEvents, ...completion.effect.events]
              }
          }
        : { state: decisionCandidateSubmission.state, effect: { events: submissionEvents } };
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
        effect: { events: [...completedSubmission.effect.events, ...queued.effect.events] }
    };

    return advanceAfterSpeakerSubmission(state, participantId, context, submitted);
}
