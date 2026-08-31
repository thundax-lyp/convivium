import { DomainError } from "../errors.js";
import type { AgendaCandidate, MeetingState, TransitionResult } from "../model.js";
import type { SubmittedAgendaCandidateInput } from "./types.js";

export function addSubmittedAgendaCandidates(
    state: MeetingState,
    participantId: string,
    sourceMessageId: string,
    candidates: readonly SubmittedAgendaCandidateInput[]
): TransitionResult<MeetingState> {
    if (!state.participants.some((participant) => participant.id === participantId)) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            "agenda candidate caller is not a meeting participant"
        );
    }
    if (!state.transcript.some((message) => message.id === sourceMessageId)) {
        throw new DomainError("INVALID_ENTITY_STATE", "agenda candidate source message is missing");
    }
    const participantIds = new Set(state.participants.map((participant) => participant.id));
    const existingIds = new Set(state.agendaCandidates.map((candidate) => candidate.id));
    const submittedIds = new Set<string>();
    const added: AgendaCandidate[] = [];

    for (const candidate of candidates) {
        const title = candidate.title.trim();
        const reason = candidate.reason.trim();
        if (!title || !reason || existingIds.has(candidate.id) || submittedIds.has(candidate.id)) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                "agenda candidate fields or id are invalid"
            );
        }
        const suggested = new Set(candidate.suggestedParticipants);
        if (
            suggested.size !== candidate.suggestedParticipants.length ||
            candidate.suggestedParticipants.some((id) => !participantIds.has(id))
        ) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                "agenda candidate suggested participants are invalid"
            );
        }
        submittedIds.add(candidate.id);
        added.push({
            id: candidate.id,
            proposedBy: participantId,
            sourceMessageId,
            title,
            reason,
            relationToActiveAgenda: candidate.relationToActiveAgenda,
            urgency: candidate.urgency,
            suggestedParticipants: [...candidate.suggestedParticipants],
            status: "pending",
            createdAt: candidate.now
        });
    }
    const events = added.map((candidate) => ({
        type: "agenda_candidate.added" as const,
        payload: {
            meetingId: state.id,
            candidateId: candidate.id,
            proposedBy: participantId,
            sourceMessageId,
            meetingVersion: state.version
        }
    }));
    return {
        state: {
            ...state,
            agendaCandidates: [...state.agendaCandidates, ...added],
            eventSeq: state.eventSeq + events.length
        },
        effect: { events }
    };
}
