import { DomainError } from "@/domain/errors.js";
import { queueMeetingTasks } from "@/domain/meeting-task.js";
import type { LegacyMeetingState, TransitionResult } from "@/domain/model.js";
import { applyPublicSubmission } from "./public-submission.js";
import { submitSpeakerAttempt } from "./speaker-attempt.js";
import { advanceAfterSpeakerSubmission } from "./turn-advancement.js";
import type { SubmitSpeakerAdvanceContext } from "./types.js";

export function submitSpeakerAndAdvanceMeeting(
    state: LegacyMeetingState,
    participantId: string,
    context: SubmitSpeakerAdvanceContext
): TransitionResult<LegacyMeetingState> {
    if (context.message.minutesDraft !== undefined && context.completion !== undefined)
        throw new DomainError("INVALID_ENTITY_STATE", "Invalid minutes draft.");
    const speakerSubmission = submitSpeakerAttempt(state, participantId, state.version, context);
    const completedSubmission = applyPublicSubmission(speakerSubmission.state, participantId, {
        agendaItemId: context.agendaItemId,
        message: context.message,
        now: context.now,
        claims: {
            questions: context.questions,
            issues: context.issues ?? [],
            proposals: context.proposals ?? [],
            positions: context.positions ?? [],
            agendaCandidates: context.agendaCandidates ?? [],
            decisionCandidates: context.decisionCandidates ?? [],
            ...(context.completion === undefined ? {} : { completion: context.completion.claims })
        },
        authorizedTaskIds: context.completion?.authorizedTaskIds ?? [],
        completionFactId: (kind, index) => {
            if (
                context.completion === undefined ||
                (kind !== "output_evidence" &&
                    kind !== "criterion_evidence" &&
                    kind !== "review" &&
                    kind !== "question_resolution" &&
                    kind !== "agenda_resolution" &&
                    kind !== "risk_acceptance")
            )
                throw new Error("Unexpected public completion fact kind.");
            return context.completion.factId(kind, index);
        }
    });
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
    const submitted: TransitionResult<LegacyMeetingState> = {
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
