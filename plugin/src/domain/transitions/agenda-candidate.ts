import { DomainError } from "../errors.js";
import type {
    AgendaCandidate,
    MeetingAgendaItem,
    MeetingState,
    TransitionResult
} from "../model.js";
import type { SubmittedAgendaCandidateInput } from "./types.js";

export type DisposeAgendaCandidateInput =
    | Readonly<{
          meetingId: string;
          candidateId: string;
          actorBinding: string;
          action: "promote";
          agendaItem: Readonly<{
              objective: string;
              inScope: readonly string[];
              outOfScope: readonly string[];
              completionCriteria: readonly string[];
              owner?: string;
              requiredParticipants: readonly string[];
          }>;
      }>
    | Readonly<{
          meetingId: string;
          candidateId: string;
          actorBinding: string;
          action: "park" | "reject";
      }>;

function invalid(message: string): never {
    throw new DomainError("INVALID_ENTITY_STATE", message);
}

function nonEmpty(values: readonly string[]): boolean {
    return values.every((value) => value.trim().length > 0);
}

function disposeEvent(
    state: MeetingState,
    input: DisposeAgendaCandidateInput,
    agendaItemId?: string
) {
    return {
        type: "agenda_candidate.disposed" as const,
        payload: {
            meetingId: state.id,
            candidateId: input.candidateId,
            action: input.action,
            actorBinding: input.actorBinding,
            ...(agendaItemId === undefined ? {} : { agendaItemId })
        }
    };
}

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

export function disposeAgendaCandidate(
    state: MeetingState,
    input: DisposeAgendaCandidateInput
): TransitionResult<MeetingState> {
    if (input.meetingId !== state.id) invalid("dispose command targets another meeting");
    const candidate = state.agendaCandidates.find(({ id }) => id === input.candidateId);
    if (candidate === undefined) invalid("agenda candidate is missing");
    if (candidate.status !== "pending") invalid("agenda candidate is not pending");

    const candidateStatus = input.action === "park" ? "parked" : "rejected";
    if (input.action !== "promote") {
        return {
            state: {
                ...state,
                agendaCandidates: state.agendaCandidates.map((item) =>
                    item.id === input.candidateId ? { ...item, status: candidateStatus } : item
                ),
                eventSeq: state.eventSeq + 1
            },
            effect: { events: [disposeEvent(state, input)] }
        };
    }

    const agendaItemId = `${input.candidateId}-agenda-item`;
    if (state.agenda.some(({ id }) => id === agendaItemId)) {
        invalid("agenda item already exists");
    }
    const { agendaItem: requested } = input;
    const participantIds = new Set(state.participants.map(({ id }) => id));
    const objectiveIds = new Set([
        ...state.objectiveContract.requiredOutputs.map(({ id }) => id),
        ...state.objectiveContract.acceptanceCriteria.map(({ id }) => id)
    ]);
    const requiredParticipants = requested.requiredParticipants.map((id) => id.trim());
    const completionCriteria = requested.completionCriteria.map((id) => id.trim());
    if (
        !requested.objective.trim() ||
        !nonEmpty(requested.inScope) ||
        !nonEmpty(requested.outOfScope) ||
        !nonEmpty(requested.completionCriteria) ||
        !nonEmpty(requested.requiredParticipants) ||
        new Set(requiredParticipants).size !== requiredParticipants.length ||
        requiredParticipants.some((id) => !participantIds.has(id)) ||
        completionCriteria.some((id) => !objectiveIds.has(id)) ||
        (requested.owner !== undefined && !participantIds.has(requested.owner.trim()))
    ) {
        invalid("agenda item references are invalid");
    }
    const item: MeetingAgendaItem = {
        id: agendaItemId,
        title: candidate.title,
        objective: requested.objective.trim(),
        inScope: requested.inScope.map((value) => value.trim()),
        outOfScope: requested.outOfScope.map((value) => value.trim()),
        completionCriteria,
        ...(requested.owner === undefined ? {} : { owner: requested.owner.trim() }),
        requiredParticipants,
        relatedTaskIds: [],
        status: "pending"
    };
    return {
        state: {
            ...state,
            agenda: [...state.agenda, item],
            agendaCandidates: state.agendaCandidates.map((candidate) =>
                candidate.id === input.candidateId
                    ? { ...candidate, status: "promoted" as const }
                    : candidate
            ),
            eventSeq: state.eventSeq + 1
        },
        effect: { events: [disposeEvent(state, input, agendaItemId)] }
    };
}
