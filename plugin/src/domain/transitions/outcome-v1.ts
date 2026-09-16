import type {
    CompletionFactV1,
    EpochMs,
    MeetingState,
    OpaqueId,
    PositionV1,
    ProposalRevisionV1,
    DecisionCandidateV1
} from "../meeting-state-v1.js";
import type { DecisionV1 } from "../meeting-state-v1.js";
import { validateMeetingStateV1 } from "../meeting-state-v1-validation.js";
import type { MeetingTransitionResultV1 } from "./result-v1.js";
import { rejectedTransitionV1 } from "./result-v1.js";

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
export type ChangeDecisionInputV1 = {
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
export type ChangeCompletionFactInputV1 = {
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
    if (
        s.lifecycle.status === "terminal" ||
        s.lifecycle.status === "archiving" ||
        s.lifecycle.status === "archived"
    )
        return bad(s, "MEETING_TERMINAL");
    if (s.lifecycle.status !== "running") return bad(s, "INVALID_STATE");
    return undefined;
};
const identity = (s: MeetingState, actor: OutcomeActorV1) =>
    actor.kind === "identity" ? s.identities.find((i) => i.id === actor.id) : undefined;
const published = (s: MeetingState) => new Set(s.publications.flatMap((p) => p.finalVersionIds));
const evidenceOk = (s: MeetingState, ids: readonly OpaqueId[]) =>
    validArray(ids) && ids.every((id) => published(s).has(id));
const currentRevision = (s: MeetingState, proposalId: string) =>
    s.proposals.filter((p) => p.proposalId === proposalId).sort((a, b) => b.ordinal - a.ordinal)[0];
const actorRole = (s: MeetingState, actor: OutcomeActorV1, role: "contributor" | "captain") =>
    actor.kind === "identity" &&
    s.identities.some((i) => i.id === actor.id && i.roles.includes(role));
const uniqueEntity = (s: MeetingState, id: string, key: keyof MeetingState) =>
    (s[key] as readonly { id: string }[]).some((x) => x.id === id);

export function recalculateMeetingCompletionV1(
    state: MeetingState,
    _actorId: OpaqueId,
    _now: EpochMs
): MeetingState {
    return state;
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
        !evidenceOk(state, input.evidenceIds)
    )
        return bad(state, "INVALID_ARGUMENT");
    const a = identity(state, input.actor);
    if (!a || (!a.roles.includes("contributor") && !a.roles.includes("captain")))
        return bad(state, "UNAUTHORIZED");
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
    if (validateMeetingStateV1(next).kind !== "valid") return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: recalculateMeetingCompletionV1(next, input.actor.id, input.now),
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
        !evidenceOk(state, input.evidenceIds)
    )
        return bad(state, "INVALID_ARGUMENT");
    if (!actorRole(state, input.actor, "contributor") && !actorRole(state, input.actor, "captain"))
        return bad(state, "UNAUTHORIZED");
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
        !evidenceOk(state, input.evidenceIds)
    )
        return bad(state, "INVALID_ARGUMENT");
    if (!actorRole(state, input.actor, "contributor") && !actorRole(state, input.actor, "captain"))
        return bad(state, "UNAUTHORIZED");
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
    if (!actorRole(state, input.actor, "captain")) return bad(state, "UNAUTHORIZED");
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
    const decision: DecisionV1 = { ...candidate, candidateId: candidate.id, status: "accepted" };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        decisions: [...state.decisions, decision]
    };
    if (validateMeetingStateV1(next).kind !== "valid") return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: recalculateMeetingCompletionV1(next, input.actor.id, input.now),
        relatedIds: [decision.id, decision.candidateId],
        effectRequests: []
    };
}
export function changeDecisionV1(
    state: MeetingState,
    input: ChangeDecisionInputV1
): MeetingTransitionResultV1 {
    const e = base(state, input.actor, input.now);
    if (e) return e;
    if (!validId(input.decisionId) || !validId(input.rationale) || !validArray(input.evidenceIds))
        return bad(state, "INVALID_ARGUMENT");
    if (!actorRole(state, input.actor, "captain")) return bad(state, "UNAUTHORIZED");
    const old = state.decisions.find((d) => d.id === input.decisionId);
    if (!old) return bad(state, "NOT_FOUND", "decision not found", input.decisionId);
    if (old.status !== "accepted")
        return bad(state, "PRECONDITION_FAILED", "decision is not accepted", old.id);
    if (!evidenceOk(state, input.evidenceIds))
        return bad(state, "PRECONDITION_FAILED", "evidence is not published");
    const decisions = state.decisions.map((d) =>
        d.id === old.id ? { ...d, status: input.status } : d
    );
    if (input.status === "revoked") {
        const next = { ...state, version: state.version + 1, updatedAt: input.now, decisions };
        if (validateMeetingStateV1(next).kind !== "valid") return bad(state, "PRECONDITION_FAILED");
        return {
            kind: "accepted",
            state: recalculateMeetingCompletionV1(next, input.actor.id, input.now),
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
        state.decisions.some((d) => d.candidateId === candidate.id)
    )
        return bad(state, "PRECONDITION_FAILED", "replacement candidate is invalid", candidate.id);
    const replacement: DecisionV1 = {
        ...candidate,
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
    if (validateMeetingStateV1(next).kind !== "valid") return bad(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: recalculateMeetingCompletionV1(next, input.actor.id, input.now),
        relatedIds: [old.id, replacement.id, replacement.candidateId, ...input.evidenceIds],
        effectRequests: []
    };
}
export function disposeRiskV1(
    state: MeetingState,
    _input: DisposeRiskInputV1
): MeetingTransitionResultV1 {
    return bad(state, "PRECONDITION_FAILED");
}
export function submitCompletionDeclarationV1(
    state: MeetingState,
    _input: SubmitCompletionDeclarationInputV1
): MeetingTransitionResultV1 {
    return bad(state, "PRECONDITION_FAILED");
}
export function recordCompletionFactV1(
    state: MeetingState,
    _input: RecordCompletionFactInputV1
): MeetingTransitionResultV1 {
    return bad(state, "PRECONDITION_FAILED");
}
export function changeCompletionFactV1(
    state: MeetingState,
    _input: ChangeCompletionFactInputV1
): MeetingTransitionResultV1 {
    return bad(state, "PRECONDITION_FAILED");
}
export function isObjectiveSatisfiedV1(_state: MeetingState): boolean {
    return false;
}
