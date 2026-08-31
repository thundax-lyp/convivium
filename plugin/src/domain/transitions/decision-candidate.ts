import { DomainError } from "../errors.js";
import type { MeetingState, TransitionResult } from "../model.js";
import type { SubmittedDecisionCandidateInput } from "./types.js";

export function addSubmittedDecisionCandidates(
    state: MeetingState,
    participantId: string,
    agendaItemId: string,
    sourceMessageId: string,
    candidates: readonly SubmittedDecisionCandidateInput[]
): TransitionResult<MeetingState> {
    if (
        [
            "completed",
            "partial",
            "no_consensus",
            "cancelled",
            "failed",
            "archiving",
            "archived"
        ].includes(state.status)
    )
        throw new DomainError("IMMUTABLE_MEETING", "meeting is immutable");
    if (!state.participants.some(({ id }) => id === participantId))
        throw new DomainError("INVALID_ENTITY_STATE", "candidate caller is not a participant");
    if (state.activeAgendaItemId !== agendaItemId)
        throw new DomainError("INVALID_ENTITY_STATE", "candidate agenda is not active");
    const source = state.transcript.find(({ id }) => id === sourceMessageId);
    if (source === undefined || source.speaker !== participantId)
        throw new DomainError("INVALID_ENTITY_STATE", "candidate source message is invalid");
    const ids = new Set(state.decisionCandidates.map(({ id }) => id));
    const added = candidates.map((candidate) => {
        if (!candidate.statement.trim() || !candidate.rationale.trim())
            throw new DomainError("INVALID_ENTITY_STATE", "candidate text must not be empty");
        if (ids.has(candidate.id))
            throw new DomainError("INVALID_ENTITY_STATE", "candidate id already exists");
        ids.add(candidate.id);
        const proposal = state.proposals.find(
            ({ id, revision, agendaItemId: proposalAgenda }) =>
                id === candidate.proposalId &&
                revision === candidate.proposalRevision &&
                proposalAgenda === agendaItemId
        );
        if (proposal === undefined || proposal.status === "superseded")
            throw new DomainError("INVALID_ENTITY_STATE", "candidate proposal is invalid");
        return { ...candidate, proposedBy: participantId };
    });
    return {
        state: { ...state, decisionCandidates: [...state.decisionCandidates, ...added] },
        effect: { events: [] }
    };
}
