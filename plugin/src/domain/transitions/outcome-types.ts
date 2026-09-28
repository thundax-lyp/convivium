import type { EpochMs, OpaqueId, Position, DecisionCandidate } from "@/domain/meeting-state.js";

export type OutcomeActor =
    { kind: "captain_user"; id: OpaqueId } | { kind: "identity"; id: OpaqueId };
export interface RecordProposalRevisionInput {
    revisionId: OpaqueId;
    proposalId: OpaqueId;
    agendaId: OpaqueId;
    summary: string;
    body: string;
    evidenceIds: readonly OpaqueId[];
    supersedesRevisionId?: OpaqueId;
    actor: OutcomeActor;
    now: EpochMs;
}
export interface RecordPositionInput {
    positionId: OpaqueId;
    proposalRevisionId: OpaqueId;
    stance: Position["stance"];
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    actor: OutcomeActor;
    now: EpochMs;
}
export interface RecordDecisionCandidateInput {
    candidateId: OpaqueId;
    proposalRevisionId: OpaqueId;
    outcome: DecisionCandidate["outcome"];
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    positionIds: readonly OpaqueId[];
    actor: OutcomeActor;
    now: EpochMs;
}
export interface DecideInput {
    decisionId: OpaqueId;
    candidateId: OpaqueId;
    actor: OutcomeActor;
    now: EpochMs;
}
export type ChangeDecisionInput = {
    decisionId: OpaqueId;
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    actor: OutcomeActor;
    now: EpochMs;
} & (
    | { status: "superseded"; replacementCandidateId: OpaqueId; replacementDecisionId: OpaqueId }
    | { status: "revoked"; replacementCandidateId?: never; replacementDecisionId?: never }
);
export interface DisposeRiskInput {
    dispositionId: OpaqueId;
    issueId: OpaqueId;
    action: "accept" | "reject";
    scope: string;
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    actor: OutcomeActor;
    now: EpochMs;
}
export interface SubmitCompletionDeclarationInput {
    declarationId: OpaqueId;
    outputId: OpaqueId;
    criterionId?: OpaqueId;
    statement: string;
    evidenceIds: readonly OpaqueId[];
    taskId?: OpaqueId;
    actor: OutcomeActor;
    now: EpochMs;
}
export interface RecordCompletionFactInput {
    factId: OpaqueId;
    outputId: OpaqueId;
    criterionId?: OpaqueId;
    statement: string;
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    decisionIds: readonly OpaqueId[];
    actor: OutcomeActor;
    now: EpochMs;
}
export type ChangeCompletionFactInput = {
    factId: OpaqueId;
    rationale: string;
    actor: OutcomeActor;
    now: EpochMs;
} & (
    | { status: "superseded"; replacement: Omit<RecordCompletionFactInput, "actor" | "now"> }
    | { status: "revoked"; replacement?: never }
);
