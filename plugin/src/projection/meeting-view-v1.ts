import {
    pendingDecisionCandidatesV1,
    type ArchivePackageV1,
    type MeetingRole,
    type MeetingState,
    type OpaqueId
} from "@/domain/index.js";
import type { MeetingAgentCatalogV1 } from "@/dsh/index.js";
import {
    ArchiveViewV1Schema,
    MeetingSummaryV1Schema,
    MeetingViewV1Schema,
    type ArchiveView,
    type MeetingSummaryV1,
    type MeetingViewV1
} from "@/protocol/index.js";
import type { MeetingSnapshot } from "@/repository/types.js";

export type MeetingProjectionCallerV1 =
    | { readonly kind: "local" }
    | { readonly kind: "captain" }
    | {
          readonly kind: "identity";
          readonly identityId: OpaqueId;
          readonly roles: readonly MeetingRole[];
      };

const copy = <T>(value: T): T => structuredClone(value);
const hasRole = (caller: MeetingProjectionCallerV1, role: MeetingRole): boolean =>
    caller.kind === "identity" && caller.roles.includes(role);

function visibleVersions(state: MeetingState, caller: MeetingProjectionCallerV1): Set<string> {
    const visible = new Set(state.publications.flatMap(({ finalVersionIds }) => finalVersionIds));
    if (caller.kind === "local") {
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
}

function catalogView(catalog: MeetingAgentCatalogV1) {
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
}

function allowedControls(state: MeetingState, caller: MeetingProjectionCallerV1) {
    if (!["running", "paused", "converging"].includes(state.lifecycle.status)) return [];
    if (caller.kind === "local") {
        if (state.lifecycle.status === "running") return ["pause_meeting", "end_meeting"] as const;
        if (
            state.lifecycle.status === "paused" &&
            state.lifecycle.reason !== "message budget exhausted"
        )
            return ["resume_meeting", "end_meeting"] as const;
        return ["end_meeting"] as const;
    }
    if (hasRole(caller, "manager"))
        return ["open_round", "dispose_hand_raise", "publish_round", "recommend_identity"] as const;
    if (hasRole(caller, "evidence_reviewer")) return ["submit_review_batch"] as const;
    if (hasRole(caller, "contributor")) return ["raise_hand", "submit_evidence"] as const;
    return [];
}

export function projectMeetingSummaryV1(snapshot: MeetingSnapshot<MeetingState>): MeetingSummaryV1 {
    const active = snapshot.state.agenda.find(({ status }) => status === "active");
    return MeetingSummaryV1Schema.parse({
        meetingId: snapshot.meetingId,
        version: snapshot.version,
        objective: snapshot.state.objective.statement,
        lifecycle: snapshot.state.lifecycle.status,
        ...(active ? { activeAgenda: { id: active.id, title: active.title } } : {}),
        updatedAt: snapshot.updatedAt
    });
}

export function projectArchiveViewV1(
    archive: ArchivePackageV1,
    caller: MeetingProjectionCallerV1
): ArchiveView {
    const used = new Set(archive.decisions.map(({ candidateId }) => candidateId));
    return ArchiveViewV1Schema.parse({
        ...copy(archive),
        decisionCandidates:
            caller.kind === "local"
                ? copy(archive.decisionCandidates)
                : archive.decisionCandidates.filter(({ id }) => used.has(id)).map(copy)
    });
}

export function projectMeetingViewV1(
    snapshot: MeetingSnapshot<MeetingState>,
    caller: MeetingProjectionCallerV1,
    managerCatalog?: MeetingAgentCatalogV1
): MeetingViewV1 {
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
            versions.has(versionId) && (caller.kind === "local" || reviewer || sent.has(id))
    );
    const deliveries = state.reviewDeliveries.filter((delivery) => {
        if (caller.kind === "local" || manager) return true;
        if (caller.kind === "captain") return false;
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
        ...(caller.kind === "local" || caller.kind === "captain" || manager
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
        opportunityRequests: state.opportunityRequests.filter(
            ({ contributorId }) =>
                caller.kind === "local" ||
                manager ||
                (caller.kind === "identity" && contributorId === caller.identityId)
        ),
        rounds: state.rounds.map((round) => ({
            id: round.id,
            agendaId: round.agendaId,
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
                    (caller.kind === "local" ||
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
        evidenceReviews: reviews.map(copy),
        reviewDeliveries: deliveries.map(copy),
        messages: copy(state.messages),
        questions: copy(state.questions),
        issues: copy(state.issues),
        outcomes: {
            decisions: copy(state.decisions),
            completionFacts: copy(state.completionFacts),
            riskDispositions: caller.kind === "local" ? copy(state.riskDispositions) : [],
            ...(caller.kind === "local" || caller.kind === "captain"
                ? { pendingDecisionCandidates: copy(pendingDecisionCandidatesV1(state)) }
                : {}),
            ...(state.termination ? { termination: copy(state.termination) } : {})
        },
        ...(state.archive ? { archive: projectArchiveViewV1(state.archive, caller) } : {}),
        managerPlans: copy(state.managerPlans),
        tasks: copy(state.tasks),
        privateMail: state.privateMails
            .filter(
                ({ senderId, recipientId }) =>
                    caller.kind === "local" ||
                    (caller.kind === "identity" &&
                        (senderId === caller.identityId || recipientId === caller.identityId))
            )
            .map(copy),
        controls: [...allowedControls(state, caller)]
    };
    return MeetingViewV1Schema.parse(result);
}
