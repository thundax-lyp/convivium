import type {
    EvidenceReviewV1,
    MeetingState,
    OpaqueId,
    ReviewDimensionV1
} from "@/domain/index.js";
export interface SubmitReviewBatchItemV1 {
    reviewId: OpaqueId;
    versionId: OpaqueId;
    dimensions: Readonly<{
        source: ReviewDimensionV1;
        credibility: ReviewDimensionV1;
        completeness: ReviewDimensionV1;
        support: ReviewDimensionV1;
    }>;
    scope: string;
}
export interface SubmitReviewBatchInputV1 {
    reviewerId: OpaqueId;
    reviews: readonly SubmitReviewBatchItemV1[];
    now: number;
}
type ReviewDimensionsInputV1 = SubmitReviewBatchItemV1["dimensions"];
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
function validDimensions(
    state: MeetingState,
    roundId: OpaqueId,
    dimensions: ReviewDimensionsInputV1
) {
    const round = state.rounds.find((candidate) => candidate.id === roundId);
    return (
        round !== undefined &&
        Object.values(dimensions).every(
            (dimension) =>
                dimension.scope.trim() !== "" &&
                dimension.reason.trim() !== "" &&
                dimension.baselineEvidenceIds.every((id) =>
                    round.publicBaselinePublicationIds.some((publicationId) =>
                        state.publications
                            .find((publication) => publication.id === publicationId)
                            ?.finalVersionIds.includes(id)
                    )
                )
        )
    );
}

export function submitReviewBatchV1(
    state: MeetingState,
    input: SubmitReviewBatchInputV1
): MeetingTransitionResultV1 {
    if (!input.reviewerId.trim() || !valid(input.now) || input.reviews.length === 0)
        return reject(state, "INVALID_ARGUMENT", "invalid review batch input");
    const reviewer = state.identities.find((candidate) => candidate.id === input.reviewerId);
    if (
        input.reviewerId !== state.evidenceReviewerId ||
        reviewer === undefined ||
        reviewer.roles.length !== 1 ||
        reviewer.roles[0] !== "evidence_reviewer"
    )
        return reject(state, "REVIEWER_CONFLICT", "reviewer is not the designated reviewer");
    const reviewIds = new Set<string>();
    const versionIds = new Set<string>();
    const pending: EvidenceReviewV1[] = [];
    for (const item of input.reviews) {
        if (
            !item.reviewId.trim() ||
            !item.versionId.trim() ||
            reviewIds.has(item.reviewId) ||
            versionIds.has(item.versionId) ||
            state.reviews.some((review) => review.versionId === item.versionId)
        )
            return reject(state, "REVIEWER_CONFLICT", "review or version is duplicated");
        reviewIds.add(item.reviewId);
        versionIds.add(item.versionId);
        const pkg = state.evidencePackages.find((candidate) =>
            candidate.versions.some((version) => version.id === item.versionId)
        );
        const version = pkg?.versions.find((candidate) => candidate.id === item.versionId);
        const round =
            pkg === undefined
                ? undefined
                : state.rounds.find((candidate) => candidate.id === pkg.roundId);
        if (
            pkg === undefined ||
            version === undefined ||
            pkg.currentVersionId !== item.versionId ||
            round === undefined ||
            !state.registrations.some(
                (registration) =>
                    registration.versionId === item.versionId && registration.status === "complete"
            ) ||
            !validDimensions(state, round.id, item.dimensions)
        )
            return reject(state, "INVALID_ARGUMENT", "review batch item is invalid");
        pending.push({
            id: item.reviewId,
            versionId: item.versionId,
            reviewerId: input.reviewerId,
            baselinePublicationIds: round.publicBaselinePublicationIds,
            scope: item.scope,
            dimensions: item.dimensions,
            createdAt: input.now
        });
    }
    const authors = pending.map(
        (review) =>
            state.evidencePackages.find((pkg) =>
                pkg.versions.some((version) => version.id === review.versionId)
            )!.authorId
    );
    return {
        kind: "accepted",
        state: {
            ...state,
            version: state.version + 1,
            updatedAt: input.now,
            reviews: [...state.reviews, ...pending]
        },
        relatedIds: pending.flatMap((review) => [review.id, review.versionId]),
        effectRequests: pending.map((review, index) => ({
            kind: "review_delivery" as const,
            reviewId: review.id,
            authorId: authors[index]
        }))
    };
}

/*
 * The former single-item entry point is intentionally removed. Delivery
 * recording remains separate because it is an external lifecycle result.
 */
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
