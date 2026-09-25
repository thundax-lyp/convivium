import {
    pendingDecisionCandidates,
    type ArchivePackage,
    type MeetingRole,
    type MeetingState,
    type OpaqueId
} from "@/domain/index.js";
import type { MeetingAgentCatalog } from "@/dsh/index.js";
import {
    ArchiveViewSchema,
    MeetingSummarySchema,
    MeetingViewSchema,
    type AllowedControl,
    type ArchiveView,
    type MeetingSummary,
    type MeetingView
} from "@/protocol/index.js";
import type { MeetingSnapshot } from "@/repository/types.js";

export type MeetingProjectionCaller =
    | { readonly kind: "captain" }
    | {
          readonly kind: "identity";
          readonly identityId: OpaqueId;
          readonly roles: readonly MeetingRole[];
      };

const copy = <T>(value: T): T => structuredClone(value);
const hasRole = (caller: MeetingProjectionCaller, role: MeetingRole): boolean =>
    caller.kind === "identity" && caller.roles.includes(role);

const visibleVersions = (state: MeetingState, caller: MeetingProjectionCaller): Set<string> => {
    const visible = new Set(state.publications.flatMap(({ finalVersionIds }) => finalVersionIds));
    if (caller.kind === "captain") {
        state.evidencePackages.forEach(({ currentVersionId }) => visible.add(currentVersionId));
    } else if (hasRole(caller, "evidence_reviewer")) {
        for (const item of state.evidencePackages) {
            const registered = state.registrations.some(
                ({ versionId }) => versionId === item.currentVersionId
            );
            const reviewed = state.reviews.some(
                ({ versionId }) => versionId === item.currentVersionId
            );
            if (registered && !reviewed) visible.add(item.currentVersionId);
        }
    } else if (caller.kind === "identity" && !hasRole(caller, "manager")) {
        state.evidencePackages
            .filter(({ authorId }) => authorId === caller.identityId)
            .forEach(({ currentVersionId }) => visible.add(currentVersionId));
    }
    return visible;
};

const catalogView = (catalog: MeetingAgentCatalog) => {
    return {
        catalogId: catalog.catalogId,
        catalogVersion: catalog.catalogVersion,
        candidates: catalog.candidates.map((item) => ({
            candidateId: item.candidateId,
            definitionId: item.definition.id,
            definitionVersion: item.definition.version,
            displayName: item.displayName,
            availability: item.availability,
            meetingRoles: [...item.meetingRoles],
            responsibilitySummary: item.responsibilitySummary,
            capabilitySummary: item.capabilitySummary
                .filter(({ kind }) => ["preset", "skill", "tool", "mcp"].includes(kind))
                .map(({ kind, label }) => ({
                    kind: kind as "preset" | "skill" | "tool" | "mcp",
                    label
                })),
            suitability: copy(item.suitability)
        }))
    };
};

const allowedControls = (state: MeetingState, caller: MeetingProjectionCaller) => {
    if (!["running", "paused", "converging"].includes(state.lifecycle.status)) return [];
    if (caller.kind === "captain") {
        const controls: AllowedControl[] = [];
        if (state.lifecycle.status === "running") controls.push("pause_meeting");
        if (
            state.lifecycle.status === "paused" &&
            state.lifecycle.reason !== "message budget exhausted"
        )
            controls.push("resume_meeting");
        controls.push("end_meeting");
        if (state.agendaCandidates.some((item) => item.status === "pending"))
            controls.push("dispose_agenda_candidate");
        if (state.questions.some((item) => ["open", "deferred"].includes(item.status)))
            controls.push("resolve_question");
        if (state.lifecycle.status !== "running") return controls;
        const active = state.agenda.find((item) => item.status === "active");
        if (
            active &&
            state.agenda.some((item) => item.status === "pending") &&
            !state.rounds.some((item) => item.agendaId === active.id && item.status === "open")
        )
            controls.push("activate_agenda");
        if (state.rounds.some((item) => item.status === "open")) controls.push("abort_round");
        if (state.issues.some((item) => ["open", "deferred"].includes(item.status)))
            controls.push("dispose_issue");
        if (pendingDecisionCandidates(state).length > 0) controls.push("decide");
        const published = state.publications.flatMap((item) => item.finalVersionIds);
        if (published.length > 0) {
            if (state.decisions.some((item) => item.status === "accepted"))
                controls.push("change_decision");
            if (state.issues.some((item) => item.status === "open")) controls.push("dispose_risk");
            if (
                state.objective.requiredOutputs.length > 0 &&
                state.decisions.some(
                    (item) => item.status === "accepted" && item.outcome === "adopt"
                )
            )
                controls.push("record_completion_fact");
        }
        if (state.completionFacts.some((item) => item.status === "active"))
            controls.push("change_completion_fact");
        return controls;
    }
    if (hasRole(caller, "manager"))
        return [
            "submit_manager_plan",
            "open_round",
            "dispose_hand_raise",
            "publish_round",
            "recommend_identity"
        ] as const;
    if (hasRole(caller, "evidence_reviewer")) return ["submit_evidence_review"] as const;
    if (hasRole(caller, "contributor")) return ["raise_hand", "submit_evidence"] as const;
    return [];
};

export const projectMeetingSummary = (snapshot: MeetingSnapshot<MeetingState>): MeetingSummary => {
    const active = snapshot.state.agenda.find(({ status }) => status === "active");
    return MeetingSummarySchema.parse({
        meetingId: snapshot.meetingId,
        version: snapshot.version,
        objective: snapshot.state.objective.statement,
        lifecycle: snapshot.state.lifecycle.status,
        ...(active ? { activeAgenda: { id: active.id, title: active.title } } : {}),
        updatedAt: snapshot.updatedAt
    });
};

export const projectArchiveView = (
    archive: ArchivePackage,
    caller: MeetingProjectionCaller
): ArchiveView => {
    const used = new Set(archive.decisions.map(({ candidateId }) => candidateId));
    return ArchiveViewSchema.parse({
        ...copy(archive),
        decisionCandidates:
            caller.kind === "captain"
                ? copy(archive.decisionCandidates)
                : archive.decisionCandidates.filter(({ id }) => used.has(id)).map(copy)
    });
};

export const projectMeetingView = (
    snapshot: MeetingSnapshot<MeetingState>,
    caller: MeetingProjectionCaller,
    managerCatalog?: MeetingAgentCatalog
): MeetingView => {
    const state = snapshot.state;
    const manager = hasRole(caller, "manager");
    const reviewer = hasRole(caller, "evidence_reviewer");
    const versions = visibleVersions(state, caller);
    const sent = new Set(
        state.reviewDeliveries
            .filter(({ status, authorId }) =>
                caller.kind === "identity"
                    ? status === "sent" && authorId === caller.identityId
                    : status === "sent"
            )
            .map(({ reviewId }) => reviewId)
    );
    const reviews = state.reviews.filter(
        ({ id, versionId }) =>
            versions.has(versionId) && (caller.kind === "captain" || reviewer || sent.has(id))
    );
    const deliveries = state.reviewDeliveries.filter((delivery) => {
        if (caller.kind === "captain" || manager) return true;
        if (reviewer)
            return state.reviews.some(
                ({ id, reviewerId }) => id === delivery.reviewId && reviewerId === caller.identityId
            );
        return delivery.authorId === caller.identityId;
    });
    const result = {
        meetingId: snapshot.meetingId,
        version: snapshot.version,
        objective: copy(state.objective),
        lifecycle: {
            status: state.lifecycle.status,
            changedAt: state.lifecycle.changedAt,
            ...(state.lifecycle.reason ? { reason: state.lifecycle.reason } : {})
        },
        identities: state.identities.map(({ id, displayName, roles }) => ({
            id,
            displayName,
            roles: [...roles]
        })),
        ...(caller.kind === "captain" || manager
            ? {
                  identityRecommendations: state.identityRecommendations.map((item) => ({
                      id: item.id,
                      candidateId: item.candidateId,
                      agendaId: item.agendaId,
                      decision: item.decision,
                      status: item.status,
                      rationale: item.rationale,
                      createdAt: item.createdAt,
                      ...(item.identityId ? { identityId: item.identityId } : {}),
                      ...(item.failureCode ? { failureCode: item.failureCode } : {})
                  })),
                  ...(manager && managerCatalog
                      ? { managerCatalog: catalogView(managerCatalog) }
                      : {})
              }
            : {}),
        agenda: copy(state.agenda),
        agendaCandidates: copy(state.agendaCandidates),
        opportunityRequests: state.opportunityRequests.filter(
            ({ contributorId }) =>
                caller.kind === "captain" ||
                manager ||
                (caller.kind === "identity" && contributorId === caller.identityId)
        ),
        rounds: state.rounds.map((round) => ({
            id: round.id,
            agendaId: round.agendaId,
            planId: round.planId,
            roundGoal: copy(round.roundGoal),
            status: round.status,
            baselinePublicationIds: [...round.publicBaselinePublicationIds],
            openedAt: round.openedAt,
            ...(round.deadlineAt === undefined ? {} : { deadlineAt: round.deadlineAt }),
            ...(round.publicationId === undefined ? {} : { publicationId: round.publicationId }),
            ...(round.abortReason === undefined ? {} : { abortReason: round.abortReason }),
            ...(round.abortedAt === undefined ? {} : { abortedAt: round.abortedAt }),
            pendingHandRaises: state.pendingHandRaises.filter(
                (hand) =>
                    hand.roundId === round.id &&
                    (caller.kind === "captain" ||
                        manager ||
                        (caller.kind === "identity" && hand.contributorId === caller.identityId))
            ),
            contributions: state.contributions
                .filter(({ roundId }) => roundId === round.id)
                .map(
                    ({
                        id,
                        contributorId,
                        status,
                        packageId,
                        substantiveSupplementCount,
                        exitReason
                    }) => ({
                        id,
                        contributorId,
                        status,
                        ...(packageId ? { packageId } : {}),
                        substantiveSupplementCount,
                        ...(exitReason ? { exitReason } : {})
                    })
                )
        })),
        publications: copy(state.publications),
        evidencePackages: state.evidencePackages.flatMap((item) => {
            if (!versions.has(item.currentVersionId)) return [];
            const currentVersion = item.versions.find(({ id }) => id === item.currentVersionId);
            return currentVersion
                ? [
                      {
                          id: item.id,
                          roundId: item.roundId,
                          contributionId: item.contributionId,
                          authorId: item.authorId,
                          agendaId: item.agendaId,
                          currentVersion: copy(currentVersion)
                      }
                  ]
                : [];
        }),
        evidenceValidationStatuses: manager
            ? state.evidencePackages.flatMap((item) => {
                  const currentVersion = item.versions.find(
                      ({ id }) => id === item.currentVersionId
                  );
                  return currentVersion
                      ? [
                            {
                                packageId: item.id,
                                contributionId: item.contributionId,
                                versionId: currentVersion.id,
                                status: currentVersion.status,
                                failureCount: currentVersion.failureCount,
                                ...(currentVersion.lastFailureReason
                                    ? { lastFailureReason: currentVersion.lastFailureReason }
                                    : {})
                            }
                        ]
                      : [];
              })
            : [],
        evidenceReviews: reviews.map(copy),
        reviewDeliveries: deliveries.map(copy),
        messages: copy(state.messages),
        questions: copy(state.questions),
        issues: copy(state.issues),
        outcomes: {
            decisions: copy(state.decisions),
            completionFacts: copy(state.completionFacts),
            riskDispositions: caller.kind === "captain" ? copy(state.riskDispositions) : [],
            ...(caller.kind === "captain"
                ? { pendingDecisionCandidates: copy(pendingDecisionCandidates(state)) }
                : {}),
            ...(state.termination ? { termination: copy(state.termination) } : {})
        },
        ...(state.archive ? { archive: projectArchiveView(state.archive, caller) } : {}),
        managerPlans: copy(state.managerPlans),
        tasks: copy(state.tasks),
        privateMail: state.privateMails
            .filter(
                ({ senderId, recipientId }) =>
                    caller.kind === "captain" ||
                    (caller.kind === "identity" &&
                        (senderId === caller.identityId || recipientId === caller.identityId))
            )
            .map(copy),
        controls: [...allowedControls(state, caller)]
    };
    return MeetingViewSchema.parse(result);
};
