import type {
    EvidenceReviewV1,
    MeetingState,
    OpaqueId,
    ReviewDimensionV1
} from "@/domain/index.js";
type ReviewInput = {
    versionId: OpaqueId;
    reviewerId: OpaqueId;
    reviewId: OpaqueId;
    dimensions: Readonly<{
        source: ReviewDimensionV1;
        credibility: ReviewDimensionV1;
        completeness: ReviewDimensionV1;
        support: ReviewDimensionV1;
    }>;
    scope: string;
    now: number;
};
type DeliveryInput = {
    reviewId: OpaqueId;
    dispatcherId: OpaqueId;
    deliveryId: OpaqueId;
    status: "sent" | "failed";
    failureReason?: string;
    now: number;
};
import { rejectedTransitionV1 as reject, type MeetingTransitionResultV1 } from "./result-v1.js";
function valid(now: number) {
    return Number.isSafeInteger(now) && now >= 0;
}
export function submitReviewV1(state: MeetingState, input: ReviewInput): MeetingTransitionResultV1 {
    if (
        input.versionId.trim() === "" ||
        input.reviewerId.trim() === "" ||
        input.reviewId.trim() === "" ||
        input.scope.trim() === "" ||
        !valid(input.now)
    )
        return reject(state, "INVALID_ARGUMENT", "invalid review input");
    const pkg = state.evidencePackages.find((candidate) =>
        candidate.versions.some((version) => version.id === input.versionId)
    );
    if (!pkg) return reject(state, "NOT_FOUND", "version not found");
    if (pkg.currentVersionId !== input.versionId)
        return reject(state, "INVALID_STATE", "version is not current");
    if (
        !state.registrations.some(
            (candidate) =>
                candidate.versionId === input.versionId && candidate.status === "complete"
        )
    )
        return reject(state, "INVALID_STATE", "version is not complete");
    if (state.reviews.some((review) => review.versionId === input.versionId))
        return reject(state, "REVIEWER_CONFLICT", "version already has a review");
    const round = state.rounds.find((candidate) => candidate.id === pkg.roundId);
    const agenda =
        round === undefined
            ? undefined
            : state.agenda.find((candidate) => candidate.id === round.agendaId);
    if (!round || !agenda) return reject(state, "INVALID_STATE", "package round is missing");
    const reviewer = state.identities.find((candidate) => candidate.id === input.reviewerId);
    const designated = agenda.requiredReviewerIds
        .map((id) => state.identities.find((candidate) => candidate.id === id))
        .find(
            (candidate) =>
                candidate !== undefined &&
                candidate.id !== pkg.authorId &&
                candidate.roles.includes("evidence_reviewer") &&
                candidate.reviewResponsibilityIds.includes(agenda.id)
        );
    if (!reviewer || designated === undefined || reviewer.id !== designated.id)
        return reject(state, "REVIEWER_CONFLICT", "reviewer is not designated");
    for (const dimension of Object.values(input.dimensions))
        if (
            !dimension.scope.trim() ||
            !dimension.reason.trim() ||
            dimension.baselineEvidenceIds.some(
                (id) =>
                    !round.publicBaselinePublicationIds.some((publicationId) =>
                        state.publications
                            .find((publication) => publication.id === publicationId)
                            ?.finalVersionIds.includes(id)
                    )
            )
        )
            return reject(state, "INVALID_ARGUMENT", "invalid review dimension");
    const review: EvidenceReviewV1 = {
        id: input.reviewId,
        versionId: input.versionId,
        reviewerId: input.reviewerId,
        baselinePublicationIds: round.publicBaselinePublicationIds,
        scope: input.scope,
        dimensions: input.dimensions,
        createdAt: input.now
    };
    return {
        kind: "accepted",
        state: {
            ...state,
            version: state.version + 1,
            updatedAt: input.now,
            reviews: [...state.reviews, review]
        },
        relatedIds: [input.reviewId, input.versionId],
        effectRequests: [{ kind: "review_delivery", reviewId: review.id, authorId: pkg.authorId }]
    };
}
export function recordReviewDeliveryV1(
    state: MeetingState,
    input: DeliveryInput
): MeetingTransitionResultV1 {
    if (
        input.reviewId.trim() === "" ||
        input.dispatcherId.trim() === "" ||
        input.deliveryId.trim() === "" ||
        !valid(input.now) ||
        (input.status === "failed" && !input.failureReason?.trim()) ||
        (input.status === "sent" && input.failureReason !== undefined)
    )
        return reject(state, "INVALID_ARGUMENT", "invalid review delivery");
    const review = state.reviews.find((candidate) => candidate.id === input.reviewId);
    if (!review) return reject(state, "NOT_FOUND", "review not found");
    if (state.reviewDeliveries.some((delivery) => delivery.id === input.deliveryId))
        return reject(state, "INVALID_ARGUMENT", "delivery id already exists");
    if (
        input.status === "sent" &&
        state.reviewDeliveries.some(
            (delivery) => delivery.reviewId === input.reviewId && delivery.status === "sent"
        )
    )
        return reject(state, "PRECONDITION_FAILED", "review already sent");
    const packageValue = state.evidencePackages.find((candidate) =>
        candidate.versions.some((version) => version.id === review.versionId)
    );
    if (!packageValue) return reject(state, "INVALID_STATE", "review package is missing");
    const delivery =
        input.status === "sent"
            ? {
                  id: input.deliveryId,
                  reviewId: input.reviewId,
                  authorId: packageValue.authorId,
                  status: "sent" as const,
                  sentAt: input.now
              }
            : {
                  id: input.deliveryId,
                  reviewId: input.reviewId,
                  authorId: packageValue.authorId,
                  status: "failed" as const,
                  failedAt: input.now,
                  failureReason: input.failureReason!
              };
    return {
        kind: "accepted",
        state: {
            ...state,
            version: state.version + 1,
            updatedAt: input.now,
            reviewDeliveries: [...state.reviewDeliveries, delivery]
        },
        relatedIds: [delivery.id, delivery.reviewId],
        effectRequests: []
    };
}
