import type { EpochMs, MeetingState, OpaqueId, CompletionFact } from "@/domain/meeting-state.ts";

const validId = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
const validArray = (xs: readonly unknown[]) =>
    xs.length > 0 && xs.every(validId) && new Set(xs).size === xs.length;
const published = (s: MeetingState) => new Set(s.publications.flatMap((p) => p.finalVersionIds));
export const evidenceOk = (s: MeetingState, ids: readonly OpaqueId[]) =>
    validArray(ids) && ids.every((id) => published(s).has(id));
export const requiredReviewOk = (s: MeetingState, ids: readonly OpaqueId[]) =>
    ids.every((id) => {
        const owner = s.evidencePackages.find((p) => p.versions.some((v) => v.id === id));
        if (!owner) {
            return false;
        }
        const reviewer = s.identities.find((identity) => identity.id === s.evidenceReviewerId);
        if (
            reviewer === undefined ||
            reviewer.id === owner.authorId ||
            reviewer.roles.length !== 1 ||
            reviewer.roles[0] !== "evidence_reviewer"
        ) {
            return false;
        }
        const reviews = s.reviews.filter((r) => r.versionId === id && r.reviewerId === reviewer.id);
        if (
            reviews.length !== 1 ||
            !s.publications.some(
                (p) => p.finalVersionIds.includes(id) && p.finalReviewIds.includes(reviews[0].id)
            )
        ) {
            return false;
        }
        return s.reviewDeliveries.some((d) => d.reviewId === reviews[0].id && d.status === "sent");
    });
const factEvidenceOk = (s: MeetingState, ids: readonly OpaqueId[]) =>
    evidenceOk(s, ids) && requiredReviewOk(s, ids);
export const currentRevision = (s: MeetingState, proposalId: string) =>
    s.proposals.filter((p) => p.proposalId === proposalId).sort((a, b) => b.ordinal - a.ordinal)[0];

export const recalculateMeetingCompletion = (
    state: MeetingState,
    actorId: OpaqueId,
    now: EpochMs
): MeetingState => {
    const current = new Set(state.proposals.map((p) => currentRevision(state, p.proposalId)?.id));
    const validDecision = (id: string) => {
        const d = state.decisions.find((x) => x.id === id);
        if (!d || d.status !== "accepted" || d.outcome !== "adopt") {
            return false;
        }
        return current.has(d.proposalRevisionId);
    };
    const validFact = (f: CompletionFact) =>
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
};

export const isObjectiveSatisfied = (state: MeetingState): boolean => {
    const recalculated = recalculateMeetingCompletion(
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
};
