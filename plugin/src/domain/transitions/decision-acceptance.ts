import { DomainError } from "../errors.js";
import type { CompletionFact, MeetingDecision, MeetingState, TransitionResult } from "../model.js";

export interface AcceptDecisionCandidateContext {
    meetingId: string;
    decisionCandidateId: string;
    actorBinding: string;
    reason: string;
    evidenceMessageIds: readonly string[];
    now: number;
}

const terminal = new Set([
    "completed",
    "partial",
    "no_consensus",
    "cancelled",
    "failed",
    "archiving",
    "archived"
]);
const invalid = (message: string) => new DomainError("INVALID_ENTITY_STATE", message);

export function acceptDecisionCandidate(
    state: MeetingState,
    context: AcceptDecisionCandidateContext
): TransitionResult<MeetingState> {
    if (context.meetingId !== state.id) throw invalid("accept command targets another meeting");
    if (terminal.has(state.status))
        throw new DomainError("IMMUTABLE_MEETING", "meeting is immutable");
    if (!context.reason.trim()) throw invalid("accept reason must not be empty");
    const evidence = context.evidenceMessageIds.map((id) => id.trim());
    if (
        !evidence.length ||
        evidence.some((id) => !id) ||
        new Set(evidence).size !== evidence.length
    )
        throw invalid("evidence is invalid");
    const candidate = state.decisionCandidates.find(({ id }) => id === context.decisionCandidateId);
    if (!candidate) throw invalid("decision candidate is missing");
    const source = state.transcript.find(({ id }) => id === candidate.sourceMessageId);
    if (!source || source.speaker !== candidate.proposedBy)
        throw invalid("candidate source is invalid");
    const proposal = state.proposals.find(
        ({ id, revision }) => id === candidate.proposalId && revision === candidate.proposalRevision
    );
    if (
        !proposal ||
        proposal.status === "superseded" ||
        proposal.agendaItemId !== candidate.agendaItemId
    )
        throw invalid("candidate proposal is stale");
    if (!state.agenda.some(({ id }) => id === candidate.agendaItemId))
        throw invalid("candidate agenda is missing");
    const positions = proposal.positions;
    if (!positions.some(({ position }) => position === "support" || position === "accept"))
        throw invalid("proposal has no support");
    if (
        positions.some(
            ({ position, blocking }) =>
                blocking && (position === "object" || position === "needs_revision")
        )
    )
        throw invalid("proposal has a blocking position");
    if (evidence.some((id) => !state.transcript.some(({ id: messageId }) => messageId === id)))
        throw invalid("evidence message is invalid");
    const decisionId = `decision-${candidate.id}`;
    const factId = `completion-${candidate.id}-acceptance`;
    if (
        state.decisions.some(({ id }) => id === decisionId) ||
        state.completionFacts.some(({ id }) => id === factId)
    )
        throw invalid("decision acceptance already exists");
    const decision: MeetingDecision = {
        id: decisionId,
        proposalId: candidate.proposalId,
        proposalRevision: candidate.proposalRevision,
        status: "accepted",
        agendaItemId: candidate.agendaItemId,
        statement: candidate.statement,
        rationale: candidate.rationale,
        acceptedBy: [
            ...new Set(
                positions
                    .filter(({ position }) => position === "support" || position === "accept")
                    .map(({ participantId }) => participantId)
            )
        ],
        dissentingPositionIds: positions
            .filter(
                ({ position, blocking }) =>
                    !blocking &&
                    (position === "object" ||
                        position === "needs_revision" ||
                        position === "abstain")
            )
            .map(({ id }) => id),
        acceptanceMode: "captain_acceptance",
        acceptanceFactIds: [factId],
        createdAt: context.now
    };
    const fact: CompletionFact = {
        id: factId,
        kind: "decision_acceptance",
        subjectId: decisionId,
        assertedBy: context.actorBinding,
        authority: "captain",
        result: "accepted",
        status: "active",
        evidenceMessageIds: evidence,
        taskIds: [],
        reason: context.reason.trim(),
        createdAt: context.now
    };
    return {
        state: {
            ...state,
            proposals: state.proposals.map((item) =>
                item === proposal ? { ...item, status: "accepted" as const } : item
            ),
            decisions: [...state.decisions, decision],
            completionFacts: [...state.completionFacts, fact],
            eventSeq: state.eventSeq + 1
        },
        effect: {
            events: [
                {
                    type: "decision.accepted",
                    payload: {
                        candidateId: candidate.id,
                        decisionId,
                        proposalId: candidate.proposalId,
                        proposalRevision: candidate.proposalRevision,
                        actorBinding: context.actorBinding
                    }
                }
            ]
        }
    };
}
