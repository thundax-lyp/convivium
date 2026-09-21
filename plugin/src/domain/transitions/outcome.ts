import type {
    EpochMs,
    MeetingState,
    OpaqueId,
    PositionV1,
    ProposalRevisionV1,
    DecisionCandidateV1
} from "@/domain/meeting-state.js";
import type { DecisionV1 } from "@/domain/meeting-state.js";
import type { IssueV1 } from "@/domain/meeting-state.js";
import type { CompletionDeclarationV1, CompletionFactV1 } from "@/domain/meeting-state.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-validation.js";
import type { MeetingTransitionResultV1 } from "./result.js";
import { rejectedTransitionV1 } from "./result.js";

export type OutcomeActorV1 =
    { kind: "local_controller"; id: OpaqueId } | { kind: "identity"; id: OpaqueId };
export interface RecordProposalRevisionInputV1 {
    revisionId: OpaqueId;
    proposalId: OpaqueId;
    agendaId: OpaqueId;
    summary: string;
    body: string;
    evidenceIds: readonly OpaqueId[];
    supersedesRevisionId?: OpaqueId;
    actor: OutcomeActorV1;
    now: EpochMs;
}
export interface RecordPositionInputV1 {
    positionId: OpaqueId;
    proposalRevisionId: OpaqueId;
    stance: PositionV1["stance"];
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    actor: OutcomeActorV1;
    now: EpochMs;
}
export interface RecordDecisionCandidateInputV1 {
    candidateId: OpaqueId;
    proposalRevisionId: OpaqueId;
    outcome: DecisionCandidateV1["outcome"];
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    positionIds: readonly OpaqueId[];
    actor: OutcomeActorV1;
    now: EpochMs;
}
export interface DecideInputV1 {
    decisionId: OpaqueId;
    candidateId: OpaqueId;
    actor: OutcomeActorV1;
    now: EpochMs;
}
export type ChangeDecisionInput = {
    decisionId: OpaqueId;
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    actor: OutcomeActorV1;
    now: EpochMs;
} & (
    | { status: "superseded"; replacementCandidateId: OpaqueId; replacementDecisionId: OpaqueId }
    | { status: "revoked"; replacementCandidateId?: never; replacementDecisionId?: never }
);
export interface DisposeRiskInputV1 {
    dispositionId: OpaqueId;
    issueId: OpaqueId;
    action: "accept" | "reject";
    scope: string;
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    actor: OutcomeActorV1;
    now: EpochMs;
}
export interface SubmitCompletionDeclarationInputV1 {
    declarationId: OpaqueId;
    outputId: OpaqueId;
    criterionId?: OpaqueId;
    statement: string;
    evidenceIds: readonly OpaqueId[];
    taskId?: OpaqueId;
    actor: OutcomeActorV1;
    now: EpochMs;
}
export interface RecordCompletionFactInputV1 {
    factId: OpaqueId;
    outputId: OpaqueId;
    criterionId?: OpaqueId;
    statement: string;
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    decisionIds: readonly OpaqueId[];
    actor: OutcomeActorV1;
    now: EpochMs;
}
export type ChangeCompletionFactInput = {
    factId: OpaqueId;
    rationale: string;
    actor: OutcomeActorV1;
    now: EpochMs;
} & (
    | { status: "superseded"; replacement: Omit<RecordCompletionFactInputV1, "actor" | "now"> }
    | { status: "revoked"; replacement?: never }
);

const bad = (
    s: MeetingState,
    code: Parameters<typeof rejectedTransitionV1>[1],
    message = "invalid outcome transition",
    id?: string
) => rejectedTransitionV1(s, code, message, id);
const validId = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
const validTime = (x: unknown): x is number =>
    typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const validArray = (xs: readonly unknown[]) =>
    xs.length > 0 && xs.every(validId) && new Set(xs).size === xs.length;
const base = (
    s: MeetingState,
    actor: OutcomeActorV1,
    now: number
): MeetingTransitionResultV1 | undefined => {
    if (validateMeetingStateV1(s).kind !== "valid") return bad(s, "INVALID_ARGUMENT");
    if (!validId(actor.id) || !validTime(now)) return bad(s, "INVALID_ARGUMENT");
    return undefined;
};
const lifecycle = (s: MeetingState) =>
    s.lifecycle.status === "terminal" ||
    s.lifecycle.status === "archiving" ||
    s.lifecycle.status === "archived"
        ? "MEETING_TERMINAL"
        : s.lifecycle.status !== "running"
          ? "INVALID_STATE"
          : undefined;
const identity = (s: MeetingState, actor: OutcomeActorV1) =>
    actor.kind === "identity" ? s.identities.find((i) => i.id === actor.id) : undefined;
const published = (s: MeetingState) => new Set(s.publications.flatMap((p) => p.finalVersionIds));
const evidenceOk = (s: MeetingState, ids: readonly OpaqueId[]) =>
    validArray(ids) && ids.every((id) => published(s).has(id));
const requiredReviewOk = (s: MeetingState, ids: readonly OpaqueId[]) =>
    ids.every((id) => {
        const owner = s.evidencePackages.find((p) => p.versions.some((v) => v.id === id));
        if (!owner) return false;
        const reviewer = s.identities.find((identity) => identity.id === s.evidenceReviewerId);
        if (
            reviewer === undefined ||
            reviewer.id === owner.authorId ||
            reviewer.roles.length !== 1 ||
            reviewer.roles[0] !== "evidence_reviewer"
        )
            return false;
        const reviews = s.reviews.filter((r) => r.versionId === id && r.reviewerId === reviewer.id);
        if (
            reviews.length !== 1 ||
            !s.publications.some(
                (p) => p.finalVersionIds.includes(id) && p.finalReviewIds.includes(reviews[0].id)
            )
        )
            return false;
        return s.reviewDeliveries.some((d) => d.reviewId === reviews[0].id && d.status === "sent");
    });
const factEvidenceOk = (s: MeetingState, ids: readonly OpaqueId[]) =>
    evidenceOk(s, ids) && requiredReviewOk(s, ids);
const currentRevision = (s: MeetingState, proposalId: string) =>
    s.proposals.filter((p) => p.proposalId === proposalId).sort((a, b) => b.ordinal - a.ordinal)[0];
const actorRole = (s: MeetingState, actor: OutcomeActorV1, role: "contributor" | "captain") =>
    actor.kind === "identity" &&
    s.identities.some((i) => i.id === actor.id && i.roles.includes(role));
const captainActor = (s: MeetingState, actor: OutcomeActorV1) =>
    actor.kind === "local_controller" || actorRole(s, actor, "captain");
const uniqueEntity = (s: MeetingState, id: string, key: keyof MeetingState) =>
    (s[key] as readonly { id: string }[]).some((x) => x.id === id);

export function recalculateMeetingCompletionV1(
    state: MeetingState,
    actorId: OpaqueId,
    now: EpochMs
): MeetingState {
    const current = new Set(state.proposals.map((p) => currentRevision(state, p.proposalId)?.id));
    const validDecision = (id: string) => {
        const d = state.decisions.find((x) => x.id === id);
        if (!d || d.status !== "accepted" || d.outcome !== "adopt") return false;
        return current.has(d.proposalRevisionId);
    };
    const validFact = (f: CompletionFactV1) =>
        f.status === "active" &&
        f.decisionIds.every(validDecision) &&
        factEvidenceOk(state, f.evidenceIds);
    const facts = state.completionFacts.filter(validFact);
    const outputs = state.objective.requiredOutputs.map(
        (t) =>
            ({
                ...t,
                status: facts.some((f) => f.outputId === t.id)
                    ? "satisfied"
                    : t.status === "satisfied"
                      ? "pending"
                      : t.status
            }) as typeof t
    );
    const criteria = state.objective.acceptanceCriteria.map(
        (t) =>
            ({
                ...t,
                status: facts.some((f) => f.criterionId === t.id)
                    ? "satisfied"
                    : t.status === "satisfied"
                      ? "pending"
                      : t.status
            }) as typeof t
    );
    const objective = {
        ...state.objective,
        requiredOutputs: outputs,
        acceptanceCriteria: criteria
    };
    const satisfied =
        outputs.every((t) => t.status === "satisfied") &&
        criteria.every((t) => t.status === "satisfied") &&
        state.objective.hardConstraints.every((t) => t.status === "satisfied") &&
        !state.issues.some((i) => i.blocking);
    const enteringConverging = satisfied && state.lifecycle.status === "running";
    const lifecycle = enteringConverging
        ? {
              ...state.lifecycle,
              status: "converging" as const,
              changedAt: now,
              changedBy: actorId,
              reason: "objective_satisfied"
          }
        : state.lifecycle;
    return {
        ...state,
        objective,
        lifecycle,
        ...(enteringConverging ? { pendingHandRaises: [], opportunityRequests: [] } : {})
    };
}

export function recordProposalRevisionV1(
    state: MeetingState,
    input: RecordProposalRevisionInputV1
): MeetingTransitionResultV1 {
    const e = base(state, input.actor, input.now);
    if (e) return e;
    if (
        !validId(input.revisionId) ||
        !validId(input.proposalId) ||
        !validId(input.agendaId) ||
        !validId(input.summary) ||
        !validId(input.body) ||
        !validArray(input.evidenceIds)
    )
        return bad(state, "INVALID_ARGUMENT");
    const a = identity(state, input.actor);
    if (!a || (!a.roles.includes("contributor") && !a.roles.includes("captain")))
        return bad(state, "UNAUTHORIZED");
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) return bad(state, lifecycleCode);
    if (
        !input.evidenceIds.every((id) =>
            state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
        )
    )
        return bad(
            state,
            "NOT_FOUND",
            "evidence not found",
            input.evidenceIds.find(
                (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
            )
        );
    if (!evidenceOk(state, input.evidenceIds)) return bad(state, "PRECONDITION_FAILED");
    if (!state.agenda.some((x) => x.id === input.agendaId))
        return bad(state, "NOT_FOUND", "agenda not found", input.agendaId);
    if (state.proposals.some((x) => x.id === input.revisionId))
        return bad(state, "INVALID_ARGUMENT");
    const prev = currentRevision(state, input.proposalId);
    if (prev ? input.supersedesRevisionId !== prev.id : input.supersedesRevisionId !== undefined)
        return bad(state, "PRECONDITION_FAILED");
    const revision: ProposalRevisionV1 = {
        id: input.revisionId,
        proposalId: input.proposalId,
        ordinal: prev ? prev.ordinal + 1 : 1,
        actorId: input.actor.id,
        agendaId: input.agendaId,
        summary: input.summary.trim(),
        body: input.body.trim(),
        evidenceIds: [...input.evidenceIds],
        ...(input.supersedesRevisionId !== undefined
            ? { supersedesRevisionId: input.supersedesRevisionId }
            : {}),
        createdAt: input.now
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        proposals: [...state.proposals, revision]
    };
    const recalculated = recalculateMeetingCompletionV1(next, input.actor.id, input.now);
    if (validateMeetingStateV1(recalculated).kind !== "valid") {
        return bad(state, "PRECONDITION_FAILED");
    }
    return {
        kind: "accepted",
        state: recalculated,
        relatedIds: [
            revision.id,
            revision.proposalId,
            revision.agendaId,
            ...(revision.supersedesRevisionId ? [revision.supersedesRevisionId] : []),
            ...revision.evidenceIds
        ],
        effectRequests: []
    };
}

export function recordPositionV1(
    state: MeetingState,
    input: RecordPositionInputV1
): MeetingTransitionResultV1 {
    const e = base(state, input.actor, input.now);
    if (e) return e;
    if (
        !validId(input.positionId) ||
        !validId(input.proposalRevisionId) ||
        !validId(input.rationale) ||
        !["support", "oppose", "abstain", "conditional"].includes(input.stance) ||
        !validArray(input.evidenceIds)
    )
        return bad(state, "INVALID_ARGUMENT");
    if (!actorRole(state, input.actor, "contributor") && !actorRole(state, input.actor, "captain"))
        return bad(state, "UNAUTHORIZED");
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) return bad(state, lifecycleCode);
    const missingEvidence = input.evidenceIds.find(
        (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
    );
    if (missingEvidence) return bad(state, "NOT_FOUND", "evidence not found", missingEvidence);
    if (!evidenceOk(state, input.evidenceIds)) return bad(state, "PRECONDITION_FAILED");
    const revision = state.proposals.find((p) => p.id === input.proposalRevisionId);
    if (!revision)
        return bad(state, "NOT_FOUND", "proposal revision not found", input.proposalRevisionId);
    if (currentRevision(state, revision.proposalId)?.id !== revision.id)
        return bad(state, "PRECONDITION_FAILED", "proposal revision is not current", revision.id);
    if (uniqueEntity(state, input.positionId, "positions")) return bad(state, "INVALID_ARGUMENT");
    const position: PositionV1 = {
        id: input.positionId,
        proposalRevisionId: input.proposalRevisionId,
        actorId: input.actor.id,
        stance: input.stance,
        rationale: input.rationale.trim(),
        evidenceIds: [...input.evidenceIds],
        createdAt: input.now
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        positions: [...state.positions, position]
    };
    if (validateMeetingStateV1(next).kind !== "valid") return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: next,
        relatedIds: [position.id, position.proposalRevisionId, ...position.evidenceIds],
        effectRequests: []
    };
}
export function recordDecisionCandidateV1(
    state: MeetingState,
    input: RecordDecisionCandidateInputV1
): MeetingTransitionResultV1 {
    const e = base(state, input.actor, input.now);
    if (e) return e;
    if (
        !validId(input.candidateId) ||
        !validId(input.proposalRevisionId) ||
        !validId(input.rationale) ||
        !["adopt", "reject", "defer"].includes(input.outcome) ||
        !validArray(input.positionIds) ||
        !validArray(input.evidenceIds)
    )
        return bad(state, "INVALID_ARGUMENT");
    if (!actorRole(state, input.actor, "contributor") && !actorRole(state, input.actor, "captain"))
        return bad(state, "UNAUTHORIZED");
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) return bad(state, lifecycleCode);
    const missingEvidence = input.evidenceIds.find(
        (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
    );
    if (missingEvidence) return bad(state, "NOT_FOUND", "evidence not found", missingEvidence);
    if (!evidenceOk(state, input.evidenceIds)) return bad(state, "PRECONDITION_FAILED");
    const revision = state.proposals.find((p) => p.id === input.proposalRevisionId);
    if (!revision)
        return bad(state, "NOT_FOUND", "proposal revision not found", input.proposalRevisionId);
    if (currentRevision(state, revision.proposalId)?.id !== revision.id)
        return bad(state, "PRECONDITION_FAILED", "proposal revision is not current", revision.id);
    if (uniqueEntity(state, input.candidateId, "decisionCandidates"))
        return bad(state, "INVALID_ARGUMENT");
    const positions = input.positionIds.map((id) => state.positions.find((p) => p.id === id));
    if (positions.some((p) => !p)) return bad(state, "NOT_FOUND", "position not found");
    if (positions.some((p) => p!.proposalRevisionId !== revision.id))
        return bad(
            state,
            "PRECONDITION_FAILED",
            "position belongs to another revision",
            revision.id
        );
    const candidate: DecisionCandidateV1 = {
        id: input.candidateId,
        proposalRevisionId: input.proposalRevisionId,
        actorId: input.actor.id,
        outcome: input.outcome,
        rationale: input.rationale.trim(),
        evidenceIds: [...input.evidenceIds],
        positionIds: [...input.positionIds],
        createdAt: input.now
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        decisionCandidates: [...state.decisionCandidates, candidate]
    };
    if (validateMeetingStateV1(next).kind !== "valid") return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: next,
        relatedIds: [
            candidate.id,
            candidate.proposalRevisionId,
            ...candidate.positionIds,
            ...candidate.evidenceIds
        ],
        effectRequests: []
    };
}
export function pendingDecisionCandidatesV1(state: MeetingState): readonly DecisionCandidateV1[] {
    if (state.lifecycle.status !== "running" && state.lifecycle.status !== "paused") return [];
    const current = new Set(state.proposals.map((p) => currentRevision(state, p.proposalId)?.id));
    const used = new Set(state.decisions.map((d) => d.candidateId));
    return state.decisionCandidates.filter(
        (c) => current.has(c.proposalRevisionId) && !used.has(c.id)
    );
}
export function decideV1(state: MeetingState, _input: DecideInputV1): MeetingTransitionResultV1 {
    const input = _input;
    const e = base(state, input.actor, input.now);
    if (e) return e;
    if (!validId(input.decisionId) || !validId(input.candidateId))
        return bad(state, "INVALID_ARGUMENT");
    if (!captainActor(state, input.actor)) return bad(state, "UNAUTHORIZED");
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) return bad(state, lifecycleCode);
    if (uniqueEntity(state, input.decisionId, "decisions")) return bad(state, "INVALID_ARGUMENT");
    const candidate = state.decisionCandidates.find((c) => c.id === input.candidateId);
    if (!candidate) return bad(state, "NOT_FOUND", "candidate not found", input.candidateId);
    const revision = state.proposals.find((p) => p.id === candidate.proposalRevisionId);
    if (!revision || currentRevision(state, revision.proposalId)?.id !== revision.id)
        return bad(
            state,
            "PRECONDITION_FAILED",
            "candidate revision is not current",
            candidate.proposalRevisionId
        );
    if (
        state.decisions.some((d) => d.candidateId === candidate.id) ||
        state.decisions.some((d) => d.proposalRevisionId === revision.id && d.status === "accepted")
    )
        return bad(state, "PRECONDITION_FAILED", "candidate already decided", candidate.id);
    const decision: DecisionV1 = {
        ...candidate,
        id: input.decisionId,
        candidateId: candidate.id,
        status: "accepted"
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        decisions: [...state.decisions, decision]
    };
    const recalculated = recalculateMeetingCompletionV1(next, input.actor.id, input.now);
    if (validateMeetingStateV1(recalculated).kind !== "valid")
        return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: recalculated,
        relatedIds: [decision.id, decision.candidateId],
        effectRequests: []
    };
}
export function changeDecisionV1(
    state: MeetingState,
    input: ChangeDecisionInput
): MeetingTransitionResultV1 {
    const e = base(state, input.actor, input.now);
    if (e) return e;
    if (!validId(input.decisionId) || !validId(input.rationale) || !validArray(input.evidenceIds))
        return bad(state, "INVALID_ARGUMENT");
    if (!(input.status === "revoked" || input.status === "superseded"))
        return bad(state, "INVALID_ARGUMENT");
    if (
        (input.status === "revoked" &&
            (input.replacementCandidateId !== undefined ||
                input.replacementDecisionId !== undefined)) ||
        (input.status === "superseded" &&
            (!validId(input.replacementCandidateId) || !validId(input.replacementDecisionId)))
    )
        return bad(state, "INVALID_ARGUMENT");
    if (!captainActor(state, input.actor)) return bad(state, "UNAUTHORIZED");
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) return bad(state, lifecycleCode);
    const old = state.decisions.find((d) => d.id === input.decisionId);
    if (!old) return bad(state, "NOT_FOUND", "decision not found", input.decisionId);
    if (old.status !== "accepted")
        return bad(state, "PRECONDITION_FAILED", "decision is not accepted", old.id);
    const missingEvidence = input.evidenceIds.find(
        (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
    );
    if (missingEvidence) return bad(state, "NOT_FOUND", "evidence not found", missingEvidence);
    if (!evidenceOk(state, input.evidenceIds))
        return bad(state, "PRECONDITION_FAILED", "evidence is not published");
    const decisions = state.decisions.map((d) =>
        d.id === old.id ? { ...d, status: input.status } : d
    );
    if (input.status === "revoked") {
        const next = { ...state, version: state.version + 1, updatedAt: input.now, decisions };
        const recalculated = recalculateMeetingCompletionV1(next, input.actor.id, input.now);
        if (validateMeetingStateV1(recalculated).kind !== "valid")
            return bad(state, "PRECONDITION_FAILED");
        return {
            kind: "accepted",
            state: recalculated,
            relatedIds: [old.id, ...input.evidenceIds],
            effectRequests: []
        };
    }
    if (
        !validId(input.replacementCandidateId) ||
        !validId(input.replacementDecisionId) ||
        uniqueEntity(state, input.replacementDecisionId, "decisions")
    )
        return bad(state, "INVALID_ARGUMENT");
    const candidate = state.decisionCandidates.find((c) => c.id === input.replacementCandidateId);
    if (!candidate)
        return bad(
            state,
            "NOT_FOUND",
            "replacement candidate not found",
            input.replacementCandidateId
        );
    const oldRevision = state.proposals.find((p) => p.id === old.proposalRevisionId);
    const newRevision = state.proposals.find((p) => p.id === candidate.proposalRevisionId);
    if (
        !oldRevision ||
        !newRevision ||
        oldRevision.proposalId !== newRevision.proposalId ||
        currentRevision(state, newRevision.proposalId)?.id !== newRevision.id ||
        state.decisions.some((d) => d.candidateId === candidate.id) ||
        state.decisions.some(
            (d) =>
                d.id !== old.id &&
                d.proposalRevisionId === newRevision.id &&
                d.status === "accepted"
        )
    )
        return bad(state, "PRECONDITION_FAILED", "replacement candidate is invalid", candidate.id);
    const replacement: DecisionV1 = {
        ...candidate,
        id: input.replacementDecisionId,
        candidateId: candidate.id,
        status: "accepted",
        replacesDecisionId: old.id
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        decisions: [...decisions, replacement]
    };
    const recalculated = recalculateMeetingCompletionV1(next, input.actor.id, input.now);
    if (validateMeetingStateV1(recalculated).kind !== "valid")
        return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: recalculated,
        relatedIds: [old.id, replacement.id, replacement.candidateId, ...input.evidenceIds],
        effectRequests: []
    };
}
export function disposeRiskV1(
    state: MeetingState,
    input: DisposeRiskInputV1
): MeetingTransitionResultV1 {
    const e = base(state, input.actor, input.now);
    if (e) return e;
    if (
        !validId(input.dispositionId) ||
        !validId(input.issueId) ||
        !validId(input.scope) ||
        !validId(input.rationale) ||
        !validArray(input.evidenceIds) ||
        input.evidenceIds.length === 0 ||
        new Set(input.evidenceIds).size !== input.evidenceIds.length ||
        !(["accept", "reject"] as string[]).includes(input.action)
    )
        return bad(state, "INVALID_ARGUMENT");
    if (uniqueEntity(state, input.dispositionId, "riskDispositions"))
        return bad(state, "INVALID_ARGUMENT");
    if (
        input.actor.kind === "identity"
            ? !state.identities.some((i) => i.id === input.actor.id && i.roles.includes("captain"))
            : input.actor.kind !== "local_controller"
    )
        return bad(state, "UNAUTHORIZED");
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) return bad(state, lifecycleCode);
    const issue = state.issues.find((i) => i.id === input.issueId);
    if (!issue) return bad(state, "NOT_FOUND", "issue not found", input.issueId);
    const missingEvidence = input.evidenceIds.find(
        (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
    );
    if (missingEvidence) return bad(state, "NOT_FOUND", "evidence not found", missingEvidence);
    if (!evidenceOk(state, input.evidenceIds))
        return bad(state, "PRECONDITION_FAILED", "evidence is not published");
    if (issue.status !== "open")
        return bad(state, "PRECONDITION_FAILED", "issue is not open", issue.id);
    if (input.action === "accept") {
        const levels = ["low", "medium", "high"];
        if (levels.indexOf(issue.riskLevel) > levels.indexOf(state.objective.acceptableRiskLevel))
            return bad(state, "PRECONDITION_FAILED", "risk exceeds acceptable level", issue.id);
        if (
            issue.affectedConstraintIds.some(
                (id) =>
                    state.objective.hardConstraints.find((c) => c.id === id)?.status !== "satisfied"
            )
        )
            return bad(state, "PRECONDITION_FAILED", "hard constraint is not satisfied", issue.id);
    }
    const disposition = {
        id: input.dispositionId,
        issueId: input.issueId,
        actorId: input.actor.id,
        action: input.action,
        scope: input.scope.trim(),
        rationale: input.rationale.trim(),
        evidenceIds: [...input.evidenceIds],
        createdAt: input.now
    };
    const issues: readonly IssueV1[] = state.issues.map((i) =>
        i.id === issue.id
            ? {
                  ...i,
                  classification: input.action === "accept" ? "accepted_risk" : "blocking",
                  blocking: input.action !== "accept"
              }
            : i
    );
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        issues,
        riskDispositions: [...state.riskDispositions, disposition]
    };
    const recalculated = recalculateMeetingCompletionV1(next, input.actor.id, input.now);
    if (validateMeetingStateV1(recalculated).kind !== "valid")
        return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: recalculated,
        relatedIds: [disposition.id, disposition.issueId, ...disposition.evidenceIds],
        effectRequests: []
    };
}
export function submitCompletionDeclarationV1(
    state: MeetingState,
    input: SubmitCompletionDeclarationInputV1
): MeetingTransitionResultV1 {
    const e = base(state, input.actor, input.now);
    if (e) return e;
    if (
        !validId(input.declarationId) ||
        !validId(input.outputId) ||
        !validId(input.statement) ||
        !validArray(input.evidenceIds) ||
        (input.criterionId !== undefined && !validId(input.criterionId)) ||
        (input.taskId !== undefined && !validId(input.taskId))
    )
        return bad(state, "INVALID_ARGUMENT");
    const a = identity(state, input.actor);
    if (!a || !a.roles.includes("contributor")) return bad(state, "UNAUTHORIZED");
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) return bad(state, lifecycleCode);
    if (uniqueEntity(state, input.declarationId, "completionDeclarations"))
        return bad(state, "INVALID_ARGUMENT");
    if (!state.objective.requiredOutputs.some((t) => t.id === input.outputId))
        return bad(state, "NOT_FOUND", "output not found", input.outputId);
    if (
        input.criterionId !== undefined &&
        !state.objective.acceptanceCriteria.some((t) => t.id === input.criterionId)
    )
        return bad(state, "NOT_FOUND", "criterion not found", input.criterionId);
    const missingEvidence = input.evidenceIds.find(
        (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
    );
    if (missingEvidence) return bad(state, "NOT_FOUND", "evidence not found", missingEvidence);
    if (!evidenceOk(state, input.evidenceIds))
        return bad(state, "PRECONDITION_FAILED", "evidence is not published");
    if (input.taskId !== undefined) {
        const task = state.tasks.find((t) => t.id === input.taskId);
        if (!task) return bad(state, "NOT_FOUND", "task not found", input.taskId);
        if (
            task.assigneeId !== input.actor.id ||
            task.status !== "completed" ||
            task.authorizationStatus !== "active" ||
            !task.result?.trim()
        )
            return bad(state, "PRECONDITION_FAILED", "task is not completed", input.taskId);
    }
    const d: CompletionDeclarationV1 = {
        id: input.declarationId,
        actorId: input.actor.id,
        outputId: input.outputId,
        ...(input.criterionId !== undefined ? { criterionId: input.criterionId } : {}),
        statement: input.statement.trim(),
        evidenceIds: [...input.evidenceIds],
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
        createdAt: input.now
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        completionDeclarations: [...state.completionDeclarations, d]
    };
    if (validateMeetingStateV1(next).kind !== "valid") return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: next,
        relatedIds: [
            d.id,
            d.outputId,
            ...(d.criterionId ? [d.criterionId] : []),
            ...(d.taskId ? [d.taskId] : []),
            ...d.evidenceIds
        ],
        effectRequests: []
    };
}
export function recordCompletionFactV1(
    state: MeetingState,
    input: RecordCompletionFactInputV1
): MeetingTransitionResultV1 {
    const e = base(state, input.actor, input.now);
    if (e) return e;
    if (
        !validId(input.factId) ||
        !validId(input.outputId) ||
        !validId(input.statement) ||
        !validId(input.rationale) ||
        !validArray(input.decisionIds) ||
        !validArray(input.evidenceIds) ||
        (input.criterionId !== undefined && !validId(input.criterionId))
    )
        return bad(state, "INVALID_ARGUMENT");
    if (!actorRole(state, input.actor, "captain")) return bad(state, "UNAUTHORIZED");
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) return bad(state, lifecycleCode);
    if (uniqueEntity(state, input.factId, "completionFacts")) return bad(state, "INVALID_ARGUMENT");
    if (!state.objective.requiredOutputs.some((t) => t.id === input.outputId))
        return bad(state, "NOT_FOUND", "output not found", input.outputId);
    if (
        input.criterionId !== undefined &&
        !state.objective.acceptanceCriteria.some((t) => t.id === input.criterionId)
    )
        return bad(state, "NOT_FOUND", "criterion not found", input.criterionId);
    const missingEvidence = input.evidenceIds.find(
        (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
    );
    if (missingEvidence) return bad(state, "NOT_FOUND", "evidence not found", missingEvidence);
    if (!evidenceOk(state, input.evidenceIds))
        return bad(state, "PRECONDITION_FAILED", "evidence is not published");
    if (!requiredReviewOk(state, input.evidenceIds))
        return bad(state, "PRECONDITION_FAILED", "required evidence review is incomplete");
    const missingDecision = input.decisionIds.find(
        (id) => !state.decisions.some((decision) => decision.id === id)
    );
    if (missingDecision) return bad(state, "NOT_FOUND", "decision not found", missingDecision);
    if (
        input.decisionIds.some((id) => {
            const d = state.decisions.find((x) => x.id === id);
            return (
                !d ||
                d.status !== "accepted" ||
                d.outcome !== "adopt" ||
                !state.proposals.some(
                    (p) =>
                        p.id === d.proposalRevisionId &&
                        currentRevision(state, p.proposalId)?.id === p.id
                )
            );
        })
    )
        return bad(state, "PRECONDITION_FAILED", "decision basis is invalid");
    const f: CompletionFactV1 = {
        id: input.factId,
        outputId: input.outputId,
        ...(input.criterionId !== undefined ? { criterionId: input.criterionId } : {}),
        actorId: input.actor.id,
        status: "active",
        statement: input.statement.trim(),
        rationale: input.rationale.trim(),
        evidenceIds: [...input.evidenceIds],
        decisionIds: [...input.decisionIds],
        createdAt: input.now
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        completionFacts: [...state.completionFacts, f]
    };
    const recalculated = recalculateMeetingCompletionV1(next, input.actor.id, input.now);
    if (validateMeetingStateV1(recalculated).kind !== "valid")
        return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: recalculated,
        relatedIds: [
            f.id,
            f.outputId,
            ...(f.criterionId ? [f.criterionId] : []),
            ...f.decisionIds,
            ...f.evidenceIds
        ],
        effectRequests: []
    };
}
export function changeCompletionFactV1(
    state: MeetingState,
    input: ChangeCompletionFactInput
): MeetingTransitionResultV1 {
    const e = base(state, input.actor, input.now);
    if (e) return e;
    if (!validId(input.factId) || !validId(input.rationale)) return bad(state, "INVALID_ARGUMENT");
    if (input.status !== "revoked" && input.status !== "superseded")
        return bad(state, "INVALID_ARGUMENT");
    if (input.status === "revoked" && input.replacement !== undefined)
        return bad(state, "INVALID_ARGUMENT");
    if (input.status === "superseded" && input.replacement === undefined)
        return bad(state, "INVALID_ARGUMENT");
    if (!actorRole(state, input.actor, "captain")) return bad(state, "UNAUTHORIZED");
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) return bad(state, lifecycleCode);
    const old = state.completionFacts.find((f) => f.id === input.factId);
    if (!old) return bad(state, "NOT_FOUND", "completion fact not found", input.factId);
    if (old.status !== "active")
        return bad(state, "PRECONDITION_FAILED", "completion fact is not active", old.id);
    const facts = state.completionFacts.map((f) =>
        f.id === old.id ? { ...f, status: input.status } : f
    );
    if (input.status === "revoked") {
        const next = {
            ...state,
            version: state.version + 1,
            updatedAt: input.now,
            completionFacts: facts
        };
        const recalculated = recalculateMeetingCompletionV1(next, input.actor.id, input.now);
        if (validateMeetingStateV1(recalculated).kind !== "valid")
            return bad(state, "PRECONDITION_FAILED");
        return {
            kind: "accepted",
            state: recalculated,
            relatedIds: [old.id],
            effectRequests: []
        };
    }
    const r = input.replacement;
    if (
        !r ||
        !validId(r.factId) ||
        !validId(r.outputId) ||
        !validId(r.statement) ||
        !validId(r.rationale) ||
        !validArray(r.decisionIds) ||
        !validArray(r.evidenceIds) ||
        (r.criterionId !== undefined && !validId(r.criterionId)) ||
        uniqueEntity(state, r.factId, "completionFacts")
    ) {
        return bad(state, "INVALID_ARGUMENT");
    }
    if (!state.objective.requiredOutputs.some((output) => output.id === r.outputId))
        return bad(state, "NOT_FOUND", "output not found", r.outputId);
    if (
        r.criterionId !== undefined &&
        !state.objective.acceptanceCriteria.some((criterion) => criterion.id === r.criterionId)
    )
        return bad(state, "NOT_FOUND", "criterion not found", r.criterionId);
    const missingEvidence = r.evidenceIds.find(
        (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
    );
    if (missingEvidence) return bad(state, "NOT_FOUND", "evidence not found", missingEvidence);
    const missingDecision = r.decisionIds.find(
        (id) => !state.decisions.some((decision) => decision.id === id)
    );
    if (missingDecision) return bad(state, "NOT_FOUND", "decision not found", missingDecision);
    if (!evidenceOk(state, r.evidenceIds))
        return bad(state, "PRECONDITION_FAILED", "evidence is not published");
    if (!requiredReviewOk(state, r.evidenceIds))
        return bad(state, "PRECONDITION_FAILED", "required evidence review is incomplete");
    if (
        r.decisionIds.some((id) => {
            const decision = state.decisions.find((candidate) => candidate.id === id);
            return (
                !decision ||
                decision.status !== "accepted" ||
                decision.outcome !== "adopt" ||
                !state.proposals.some(
                    (proposal) =>
                        proposal.id === decision.proposalRevisionId &&
                        currentRevision(state, proposal.proposalId)?.id === proposal.id
                )
            );
        })
    )
        return bad(state, "PRECONDITION_FAILED", "decision basis is invalid");
    const replacement: CompletionFactV1 = {
        id: r.factId,
        outputId: r.outputId,
        ...(r.criterionId !== undefined ? { criterionId: r.criterionId } : {}),
        statement: r.statement,
        rationale: r.rationale,
        evidenceIds: [...r.evidenceIds],
        decisionIds: [...r.decisionIds],
        status: "active",
        actorId: input.actor.id,
        supersedesFactId: old.id,
        createdAt: input.now
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        completionFacts: [...facts, replacement]
    };
    const recalculated = recalculateMeetingCompletionV1(next, input.actor.id, input.now);
    if (validateMeetingStateV1(recalculated).kind !== "valid")
        return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: recalculated,
        relatedIds: [
            old.id,
            replacement.id,
            replacement.outputId,
            ...(replacement.criterionId ? [replacement.criterionId] : []),
            ...replacement.decisionIds,
            ...replacement.evidenceIds
        ],
        effectRequests: []
    };
}
export function isObjectiveSatisfiedV1(state: MeetingState): boolean {
    const recalculated = recalculateMeetingCompletionV1(
        { ...state, lifecycle: { ...state.lifecycle, status: "paused" } },
        state.lifecycle.changedBy,
        state.lifecycle.changedAt
    );
    return (
        recalculated.objective.requiredOutputs.every((t) => t.status === "satisfied") &&
        recalculated.objective.acceptanceCriteria.every((t) => t.status === "satisfied") &&
        recalculated.objective.hardConstraints.every((t) => t.status === "satisfied") &&
        !state.issues.some((i) => i.blocking)
    );
}
