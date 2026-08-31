import { DomainError } from "../errors.js";
import type { MeetingProposal, MeetingState, TransitionResult } from "../model.js";
import type { SubmittedPositionInput, SubmittedProposalInput } from "./types.js";

export function applySubmittedProposalPositionClaims(
    state: MeetingState,
    participantId: string,
    agendaItemId: string,
    proposals: readonly SubmittedProposalInput[],
    positions: readonly SubmittedPositionInput[]
): TransitionResult<MeetingState> {
    if (!state.participants.some((participant) => participant.id === participantId)) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            "proposal caller is not a meeting participant"
        );
    }
    if (state.activeAgendaItemId !== agendaItemId) {
        throw new DomainError("INVALID_ENTITY_STATE", "proposal agenda is not active");
    }

    const nextProposals = state.proposals.map((proposal) => ({
        ...proposal,
        positions: [...proposal.positions]
    }));
    const knownIds = new Set(nextProposals.map((proposal) => proposal.id));
    const submittedIds = new Set<string>();
    const events: TransitionResult<MeetingState>["effect"]["events"] = [];

    for (const proposal of proposals) {
        const title = proposal.title.trim();
        const description = proposal.description.trim();
        if (!title || !description) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                "proposal title and description must not be empty"
            );
        }
        if (proposal.proposalId === undefined || proposal.expectedRevision === undefined) {
            if (proposal.proposalId !== undefined || proposal.expectedRevision !== undefined) {
                throw new DomainError(
                    "INVALID_ENTITY_STATE",
                    "proposal creation must omit both proposalId and expectedRevision"
                );
            }
            if (knownIds.has(proposal.id) || submittedIds.has(proposal.id)) {
                throw new DomainError(
                    "INVALID_ENTITY_STATE",
                    "proposal id is invalid or already exists"
                );
            }
            submittedIds.add(proposal.id);
            knownIds.add(proposal.id);
            nextProposals.push({
                id: proposal.id,
                title,
                description,
                proposedBy: participantId,
                revision: 1,
                status: "under_review",
                agendaItemId,
                positions: [],
                createdAt: proposal.now,
                updatedAt: proposal.now
            });
            events.push({
                type: "proposal.added",
                payload: {
                    meetingId: state.id,
                    proposalId: proposal.id,
                    proposalRevision: 1,
                    proposedBy: participantId,
                    meetingVersion: state.version
                }
            });
            continue;
        }

        if (submittedIds.has(proposal.proposalId)) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                "proposal may only be revised once per submission"
            );
        }
        submittedIds.add(proposal.proposalId);
        const index = nextProposals.findIndex(
            ({ id, revision, status }) =>
                id === proposal.proposalId &&
                revision === proposal.expectedRevision &&
                status !== "superseded"
        );
        const existing = nextProposals[index];
        if (existing === undefined || existing.agendaItemId !== agendaItemId) {
            throw new DomainError("INVALID_ENTITY_STATE", "proposal is not in the active agenda");
        }
        nextProposals[index] = { ...existing, status: "superseded" };
        nextProposals.push({
            ...existing,
            title,
            description,
            revision: existing.revision + 1,
            status: "under_review",
            positions: [],
            updatedAt: proposal.now
        });
        events.push({
            type: "proposal.revised",
            payload: {
                meetingId: state.id,
                proposalId: existing.id,
                proposalRevision: existing.revision + 1,
                revisedBy: participantId,
                meetingVersion: state.version
            }
        });
    }

    const positionIds = new Set<string>();
    const participantRevisions = new Set<string>();
    for (const position of positions) {
        const proposal = nextProposals.find(
            ({ id, revision, status }) =>
                id === position.proposalId &&
                revision === position.proposalRevision &&
                status !== "superseded"
        );
        if (
            proposal === undefined ||
            proposal.agendaItemId !== agendaItemId ||
            proposal.revision !== position.proposalRevision ||
            positionIds.has(position.id)
        ) {
            throw new DomainError("INVALID_ENTITY_STATE", "position proposal revision is invalid");
        }
        positionIds.add(position.id);
        const key = `${proposal.id}\0${proposal.revision}\0${participantId}`;
        if (
            participantRevisions.has(key) ||
            proposal.positions.some((value) => value.participantId === participantId)
        ) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                "participant already has a position on proposal revision"
            );
        }
        participantRevisions.add(key);
        const reason = position.reason?.trim();
        proposal.positions = [
            ...proposal.positions,
            {
                id: position.id,
                participantId,
                position: position.position,
                ...(reason === undefined || reason === "" ? {} : { reason }),
                blocking: position.blocking,
                proposalRevision: proposal.revision
            }
        ];
        proposal.updatedAt = position.now;
        events.push({
            type: "position.added",
            payload: {
                meetingId: state.id,
                positionId: position.id,
                proposalId: proposal.id,
                proposalRevision: proposal.revision,
                participantId,
                meetingVersion: state.version
            }
        });
    }

    return {
        state: {
            ...state,
            proposals: nextProposals as MeetingProposal[],
            eventSeq: state.eventSeq + events.length
        },
        effect: { events }
    };
}
