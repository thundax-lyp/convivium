import { applyCompletionClaims } from "@/domain/completion.js";
import { DomainError } from "@/domain/errors.js";
import { isMeetingMinutesDraft } from "@/domain/meeting-state-validation.js";
import type { MeetingState, SpeakerSubmissionContext, TransitionResult } from "@/domain/model.js";
import { addSubmittedAgendaCandidates } from "./agenda-candidate.js";
import { addSubmittedDecisionCandidates } from "./decision-candidate.js";
import { addSubmittedIssues } from "./issue.js";
import { applySubmittedProposalPositionClaims } from "./proposal-position.js";
import { addSubmittedQuestions } from "./question.js";
import type { ContributionClaims } from "@/domain/contribution.js";

export interface PublicSubmissionContext {
    agendaItemId: string;
    message: SpeakerSubmissionContext["message"];
    claims: ContributionClaims;
    now: number;
    authorizedTaskIds: readonly string[];
    completionFactId: (kind: string, index: number) => string;
}

export function assertPublicMinutes(
    state: MeetingState,
    message: SpeakerSubmissionContext["message"],
    contextFromSeq: number,
    contextThroughSeq: number
): void {
    const draft = message.minutesDraft;
    if (draft === undefined) return;
    if (
        !isMeetingMinutesDraft(draft) ||
        message.kind !== "summary" ||
        !/\S/.test(message.content) ||
        message.content.length > 8000 ||
        message.agendaRelation !== "on_topic" ||
        message.taskIds.length !== 0 ||
        Object.hasOwn(message, "replyTo")
    )
        throw new DomainError("INVALID_ENTITY_STATE", "Invalid minutes draft.");
    const messages = state.transcript
        .filter(({ seq }) => seq >= draft.coverage.fromSeq && seq <= draft.coverage.throughSeq)
        .sort((a, b) => a.seq - b.seq);
    if (
        draft.coverage.fromSeq < Math.max(1, contextFromSeq) ||
        draft.coverage.throughSeq > contextThroughSeq ||
        messages.length !== draft.coverage.throughSeq - draft.coverage.fromSeq + 1 ||
        messages.some((item, index) => item.seq !== draft.coverage.fromSeq + index) ||
        draft.referencedMessageIds.some(
            (id) => id === message.id || messages.filter((item) => item.id === id).length !== 1
        )
    )
        throw new DomainError("INVALID_ENTITY_STATE", "Invalid minutes draft.");
}

export function applyPublicSubmission(
    state: MeetingState,
    participantId: string,
    context: PublicSubmissionContext
): TransitionResult<MeetingState> {
    if (
        context.message.minutesDraft !== undefined &&
        (context.claims.completion !== undefined ||
            [
                context.claims.questions,
                context.claims.issues,
                context.claims.proposals,
                context.claims.positions,
                context.claims.agendaCandidates,
                context.claims.decisionCandidates
            ].some((claims) => (claims?.length ?? 0) > 0))
    ) {
        throw new DomainError("INVALID_ENTITY_STATE", "Invalid minutes draft.");
    }
    const question = context.claims.questions.length
        ? addSubmittedQuestions(
              state,
              participantId,
              context.agendaItemId,
              context.claims.questions
          )
        : { state, effect: { events: [] } };
    const issue =
        (context.claims.issues?.length ?? 0)
            ? addSubmittedIssues(
                  question.state,
                  participantId,
                  context.agendaItemId,
                  context.claims.issues!
              )
            : { state: question.state, effect: { events: [] } };
    const proposal =
        (context.claims.proposals?.length ?? 0) || (context.claims.positions?.length ?? 0)
            ? applySubmittedProposalPositionClaims(
                  issue.state,
                  participantId,
                  context.agendaItemId,
                  context.claims.proposals ?? [],
                  context.claims.positions ?? []
              )
            : { state: issue.state, effect: { events: [] } };
    const agenda =
        (context.claims.agendaCandidates?.length ?? 0)
            ? addSubmittedAgendaCandidates(
                  proposal.state,
                  participantId,
                  context.message.id,
                  context.claims.agendaCandidates!
              )
            : { state: proposal.state, effect: { events: [] } };
    const decision =
        (context.claims.decisionCandidates?.length ?? 0)
            ? addSubmittedDecisionCandidates(
                  agenda.state,
                  participantId,
                  context.agendaItemId,
                  context.message.id,
                  context.claims.decisionCandidates!
              )
            : { state: agenda.state, effect: { events: [] } };
    const completion = context.claims.completion
        ? applyCompletionClaims(decision.state, {
              claims: context.claims.completion,
              authorizedTaskIds: context.authorizedTaskIds,
              factId: context.completionFactId,
              participantId,
              now: context.now
          })
        : undefined;
    return {
        state: completion?.state ?? decision.state,
        effect: {
            events: [
                ...question.effect.events,
                ...issue.effect.events,
                ...proposal.effect.events,
                ...agenda.effect.events,
                ...decision.effect.events,
                ...(completion?.effect.events ?? [])
            ]
        }
    };
}
