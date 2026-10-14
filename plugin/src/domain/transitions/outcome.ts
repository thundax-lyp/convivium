import type { MeetingState, Issue, CompletionFact } from "@/domain/index.ts";
import type {
    OutcomeActor,
    DisposeRiskInput,
    RecordCompletionFactInput,
    ChangeCompletionFactInput
} from "./outcome-types.ts";
import {
    evidenceOk,
    requiredReviewOk,
    recalculateMeetingCompletion
} from "./outcome-completion.ts";
export type {
    OutcomeActor,
    DisposeRiskInput,
    RecordCompletionFactInput,
    ChangeCompletionFactInput
} from "./outcome-types.ts";
export { recalculateMeetingCompletion, isObjectiveSatisfied } from "./outcome-completion.ts";
import { validateMeetingState } from "@/domain/index.ts";
import type { MeetingTransitionResult } from "./result.ts";
import { rejectedTransition } from "./result.ts";

const bad = (
    s: MeetingState,
    code: Parameters<typeof rejectedTransition>[1],
    message = "invalid outcome transition",
    id?: string
) => rejectedTransition(s, code, message, id);
const validId = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
const validTime = (x: unknown): x is number =>
    typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const validArray = (xs: readonly unknown[]) =>
    xs.length > 0 && xs.every(validId) && new Set(xs).size === xs.length;
const base = (
    s: MeetingState,
    actor: OutcomeActor,
    now: number
): MeetingTransitionResult | undefined => {
    if (validateMeetingState(s).kind !== "valid") {
        return bad(s, "INVALID_ARGUMENT");
    }
    if (!validId(actor.id) || !validTime(now)) {
        return bad(s, "INVALID_ARGUMENT");
    }
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
const captainActor = (_s: MeetingState, actor: OutcomeActor) => actor.kind === "captain_user";
const uniqueEntity = (s: MeetingState, id: string, key: keyof MeetingState) =>
    (s[key] as readonly { id: string }[]).some((x) => x.id === id);
export const disposeRisk = (
    state: MeetingState,
    input: DisposeRiskInput
): MeetingTransitionResult => {
    const e = base(state, input.actor, input.now);
    if (e) {
        return e;
    }
    if (
        !validId(input.dispositionId) ||
        !validId(input.issueId) ||
        !validId(input.scope) ||
        !validId(input.rationale) ||
        !validArray(input.evidenceIds) ||
        input.evidenceIds.length === 0 ||
        new Set(input.evidenceIds).size !== input.evidenceIds.length ||
        !(["accept", "reject"] as string[]).includes(input.action)
    ) {
        return bad(state, "INVALID_ARGUMENT");
    }
    if (uniqueEntity(state, input.dispositionId, "riskDispositions")) {
        return bad(state, "INVALID_ARGUMENT");
    }
    if (!captainActor(state, input.actor)) {
        return bad(state, "UNAUTHORIZED");
    }
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) {
        return bad(state, lifecycleCode);
    }
    const issue = state.issues.find((i) => i.id === input.issueId);
    if (!issue) {
        return bad(state, "NOT_FOUND", "issue not found", input.issueId);
    }
    const missingEvidence = input.evidenceIds.find(
        (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
    );
    if (missingEvidence) {
        return bad(state, "NOT_FOUND", "evidence not found", missingEvidence);
    }
    if (!evidenceOk(state, input.evidenceIds)) {
        return bad(state, "PRECONDITION_FAILED", "evidence is not published");
    }
    if (issue.status !== "open") {
        return bad(state, "PRECONDITION_FAILED", "issue is not open", issue.id);
    }
    if (input.action === "accept") {
        const levels = ["low", "medium", "high"];
        if (levels.indexOf(issue.riskLevel) > levels.indexOf(state.objective.acceptableRiskLevel)) {
            return bad(state, "PRECONDITION_FAILED", "risk exceeds acceptable level", issue.id);
        }
        if (
            issue.affectedConstraintIds.some(
                (id) =>
                    state.objective.hardConstraints.find((c) => c.id === id)?.status !== "satisfied"
            )
        ) {
            return bad(state, "PRECONDITION_FAILED", "hard constraint is not satisfied", issue.id);
        }
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
    const issues: readonly Issue[] = state.issues.map((i) =>
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
    const recalculated = recalculateMeetingCompletion(next, input.actor.id, input.now);
    if (validateMeetingState(recalculated).kind !== "valid") {
        return bad(state, "PRECONDITION_FAILED");
    }
    return {
        kind: "accepted",
        state: recalculated,
        relatedIds: [disposition.id, disposition.issueId, ...disposition.evidenceIds],
        effectRequests: []
    };
};
export const recordCompletionFact = (
    state: MeetingState,
    input: RecordCompletionFactInput
): MeetingTransitionResult => {
    const e = base(state, input.actor, input.now);
    if (e) {
        return e;
    }
    if (
        !validId(input.factId) ||
        !validId(input.outputId) ||
        !validId(input.statement) ||
        !validId(input.rationale) ||
        !validArray(input.evidenceIds) ||
        (input.criterionId !== undefined && !validId(input.criterionId))
    ) {
        return bad(state, "INVALID_ARGUMENT");
    }
    if (!captainActor(state, input.actor)) {
        return bad(state, "UNAUTHORIZED");
    }
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) {
        return bad(state, lifecycleCode);
    }
    if (uniqueEntity(state, input.factId, "completionFacts")) {
        return bad(state, "INVALID_ARGUMENT");
    }
    if (!state.objective.requiredOutputs.some((t) => t.id === input.outputId)) {
        return bad(state, "NOT_FOUND", "output not found", input.outputId);
    }
    if (
        input.criterionId !== undefined &&
        !state.objective.acceptanceCriteria.some((t) => t.id === input.criterionId)
    ) {
        return bad(state, "NOT_FOUND", "criterion not found", input.criterionId);
    }
    const missingEvidence = input.evidenceIds.find(
        (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
    );
    if (missingEvidence) {
        return bad(state, "NOT_FOUND", "evidence not found", missingEvidence);
    }
    if (!evidenceOk(state, input.evidenceIds)) {
        return bad(state, "PRECONDITION_FAILED", "evidence is not published");
    }
    if (!requiredReviewOk(state, input.evidenceIds)) {
        return bad(state, "PRECONDITION_FAILED", "required evidence review is incomplete");
    }
    const f: CompletionFact = {
        id: input.factId,
        outputId: input.outputId,
        ...(input.criterionId !== undefined ? { criterionId: input.criterionId } : {}),
        actorId: input.actor.id,
        status: "active",
        statement: input.statement.trim(),
        rationale: input.rationale.trim(),
        evidenceIds: [...input.evidenceIds],
        createdAt: input.now
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        completionFacts: [...state.completionFacts, f]
    };
    const recalculated = recalculateMeetingCompletion(next, input.actor.id, input.now);
    if (validateMeetingState(recalculated).kind !== "valid") {
        return bad(state, "PRECONDITION_FAILED");
    }
    return {
        kind: "accepted",
        state: recalculated,
        relatedIds: [f.id, f.outputId, ...(f.criterionId ? [f.criterionId] : []), ...f.evidenceIds],
        effectRequests: []
    };
};
export const changeCompletionFact = (
    state: MeetingState,
    input: ChangeCompletionFactInput
): MeetingTransitionResult => {
    const e = base(state, input.actor, input.now);
    if (e) {
        return e;
    }
    if (!validId(input.factId) || !validId(input.rationale)) {
        return bad(state, "INVALID_ARGUMENT");
    }
    if (input.status !== "revoked" && input.status !== "superseded") {
        return bad(state, "INVALID_ARGUMENT");
    }
    if (input.status === "revoked" && input.replacement !== undefined) {
        return bad(state, "INVALID_ARGUMENT");
    }
    if (input.status === "superseded" && input.replacement === undefined) {
        return bad(state, "INVALID_ARGUMENT");
    }
    if (!captainActor(state, input.actor)) {
        return bad(state, "UNAUTHORIZED");
    }
    const lifecycleCode = lifecycle(state);
    if (lifecycleCode) {
        return bad(state, lifecycleCode);
    }
    const old = state.completionFacts.find((f) => f.id === input.factId);
    if (!old) {
        return bad(state, "NOT_FOUND", "completion fact not found", input.factId);
    }
    if (old.status !== "active") {
        return bad(state, "PRECONDITION_FAILED", "completion fact is not active", old.id);
    }
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
        const recalculated = recalculateMeetingCompletion(next, input.actor.id, input.now);
        if (validateMeetingState(recalculated).kind !== "valid") {
            return bad(state, "PRECONDITION_FAILED");
        }
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
        !validArray(r.evidenceIds) ||
        (r.criterionId !== undefined && !validId(r.criterionId)) ||
        uniqueEntity(state, r.factId, "completionFacts")
    ) {
        return bad(state, "INVALID_ARGUMENT");
    }
    if (!state.objective.requiredOutputs.some((output) => output.id === r.outputId)) {
        return bad(state, "NOT_FOUND", "output not found", r.outputId);
    }
    if (
        r.criterionId !== undefined &&
        !state.objective.acceptanceCriteria.some((criterion) => criterion.id === r.criterionId)
    ) {
        return bad(state, "NOT_FOUND", "criterion not found", r.criterionId);
    }
    const missingEvidence = r.evidenceIds.find(
        (id) => !state.evidencePackages.some((p) => p.versions.some((v) => v.id === id))
    );
    if (missingEvidence) {
        return bad(state, "NOT_FOUND", "evidence not found", missingEvidence);
    }
    const replacement: CompletionFact = {
        id: r.factId,
        outputId: r.outputId,
        ...(r.criterionId !== undefined ? { criterionId: r.criterionId } : {}),
        statement: r.statement,
        rationale: r.rationale,
        evidenceIds: [...r.evidenceIds],
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
    const recalculated = recalculateMeetingCompletion(next, input.actor.id, input.now);
    if (validateMeetingState(recalculated).kind !== "valid") {
        return bad(state, "PRECONDITION_FAILED");
    }
    return {
        kind: "accepted",
        state: recalculated,
        relatedIds: [
            old.id,
            replacement.id,
            replacement.outputId,
            ...(replacement.criterionId ? [replacement.criterionId] : []),
            ...replacement.evidenceIds
        ],
        effectRequests: []
    };
};
