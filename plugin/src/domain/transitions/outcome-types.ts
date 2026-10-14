import type { EpochMs, OpaqueId } from "@/domain/index.ts";

export type OutcomeActor =
    { kind: "captain_user"; id: OpaqueId } | { kind: "identity"; id: OpaqueId };
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
export interface RecordCompletionFactInput {
    factId: OpaqueId;
    outputId: OpaqueId;
    criterionId?: OpaqueId;
    statement: string;
    rationale: string;
    evidenceIds: readonly OpaqueId[];
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
