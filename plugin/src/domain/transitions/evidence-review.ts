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
    roundId: OpaqueId;
    claimId: OpaqueId;
    reviews: readonly SubmitReviewBatchItemV1[];
    now: number;
}
export interface ClaimReviewBatchInput {
    claimId: OpaqueId;
    sourceEffectId: OpaqueId;
    reviewerId: OpaqueId;
    roundId: OpaqueId;
    versionIds: readonly OpaqueId[];
    now: number;
    expiresAt: number;
}
export interface ReleaseReviewBatchClaimInputV1 {
    claimId: OpaqueId;
    roundId: OpaqueId;
    reason: "turn_timed_out" | "turn_interrupted" | "dispatch_failed";
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
import { rejectedTransitionV1 as reject, type MeetingTransitionResultV1 } from "./result.js";
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

export function claimReviewBatchV1(
    state: MeetingState,
    input: ClaimReviewBatchInput
): MeetingTransitionResultV1 {
    if (
        !input.claimId.trim() ||
        !input.sourceEffectId.trim() ||
        !input.reviewerId.trim() ||
        !input.roundId.trim() ||
        input.versionIds.length === 0 ||
        new Set(input.versionIds).size !== input.versionIds.length ||
        !valid(input.now) ||
        !Number.isSafeInteger(input.expiresAt) ||
        input.expiresAt <= input.now
    )
        return reject(state, "INVALID_ARGUMENT", "invalid review claim input");
    if (state.lifecycle.status !== "running")
        return reject(state, "INVALID_STATE", "meeting is not running");
    const round = state.rounds.find((candidate) => candidate.id === input.roundId);
    if (!round || round.status !== "open")
        return reject(state, "INVALID_STATE", "round is not open");
    const activeClaims = state.reviewClaims.filter((claim) => claim.expiresAt > input.now);
    if (activeClaims.some((claim) => claim.roundId === input.roundId))
        return reject(state, "REVIEWER_CONFLICT", "round already has an active review claim");
    if (activeClaims.some((claim) => claim.id === input.claimId))
        return reject(state, "INVALID_ARGUMENT", "review claim id already exists");
    const reviewer = state.identities.find((identity) => identity.id === input.reviewerId);
    if (
        input.reviewerId !== state.evidenceReviewerId ||
        reviewer?.roles.length !== 1 ||
        reviewer.roles[0] !== "evidence_reviewer"
    )
        return reject(state, "REVIEWER_CONFLICT", "reviewer is not the designated reviewer");
    const pending = input.versionIds.every((versionId) => {
        const pkg = state.evidencePackages.find(
            (candidate) => candidate.currentVersionId === versionId
        );
        return (
            pkg?.roundId === input.roundId &&
            state.registrations.some(
                (registration) =>
                    registration.versionId === versionId && registration.status === "complete"
            ) &&
            !state.reviews.some((review) => review.versionId === versionId)
        );
    });
    if (!pending)
        return reject(state, "REVIEWER_CONFLICT", "review claim versions are unavailable");
    return {
        kind: "accepted",
        state: {
            ...state,
            version: state.version + 1,
            updatedAt: input.now,
            reviewClaims: [
                ...activeClaims,
                {
                    id: input.claimId,
                    sourceEffectId: input.sourceEffectId,
                    roundId: input.roundId,
                    reviewerId: input.reviewerId,
                    versionIds: input.versionIds,
                    claimedAt: input.now,
                    expiresAt: input.expiresAt
                }
            ]
        },
        relatedIds: [input.claimId, ...input.versionIds],
        effectRequests: []
    };
}

export function submitReviewBatchV1(
    state: MeetingState,
    input: SubmitReviewBatchInputV1
): MeetingTransitionResultV1 {
    if (
        !input.reviewerId.trim() ||
        !input.roundId.trim() ||
        !input.claimId.trim() ||
        !valid(input.now) ||
        input.reviews.length === 0
    )
        return reject(state, "INVALID_ARGUMENT", "invalid review batch input");
    const reviewer = state.identities.find((candidate) => candidate.id === input.reviewerId);
    if (
        input.reviewerId !== state.evidenceReviewerId ||
        reviewer === undefined ||
        reviewer.roles.length !== 1 ||
        reviewer.roles[0] !== "evidence_reviewer"
    )
        return reject(state, "REVIEWER_CONFLICT", "reviewer is not the designated reviewer");
    const claim = state.reviewClaims.find(
        (candidate) =>
            candidate.id === input.claimId &&
            candidate.roundId === input.roundId &&
            candidate.reviewerId === input.reviewerId &&
            candidate.expiresAt > input.now
    );
    if (
        !claim ||
        new Set(claim.versionIds).size !== input.reviews.length ||
        input.reviews.some((review) => !claim.versionIds.includes(review.versionId))
    )
        return reject(state, "REVIEWER_CONFLICT", "review batch claim is invalid");
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
            round.id !== input.roundId ||
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
            reviews: [...state.reviews, ...pending],
            reviewClaims: state.reviewClaims.filter((candidate) => candidate.id !== claim.id)
        },
        relatedIds: pending.flatMap((review) => [review.id, review.versionId]),
        effectRequests: pending.map((review, index) => ({
            kind: "review_delivery" as const,
            reviewId: review.id,
            authorId: authors[index]
        }))
    };
}

export function releaseReviewBatchClaimV1(
    state: MeetingState,
    input: ReleaseReviewBatchClaimInputV1
): MeetingTransitionResultV1 {
    if (
        !input.claimId.trim() ||
        !input.roundId.trim() ||
        !["turn_timed_out", "turn_interrupted", "dispatch_failed"].includes(input.reason) ||
        !valid(input.now)
    )
        return reject(state, "INVALID_ARGUMENT", "invalid review claim release");
    const claim = state.reviewClaims.find(
        (candidate) => candidate.id === input.claimId && candidate.roundId === input.roundId
    );
    if (!claim) return reject(state, "NOT_FOUND", "review claim not found", input.claimId);
    return {
        kind: "accepted",
        state: {
            ...state,
            version: state.version + 1,
            updatedAt: input.now,
            reviewClaims: state.reviewClaims.filter((candidate) => candidate.id !== claim.id)
        },
        relatedIds: [claim.id, claim.roundId, ...claim.versionIds],
        effectRequests: []
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
            contributions:
                input.status === "sent"
                    ? state.contributions.map((contribution) =>
                          contribution.packageId === packageValue.id &&
                          contribution.status === "under_review"
                              ? { ...contribution, status: "awaiting_response" as const }
                              : contribution
                      )
                    : state.contributions,
            reviewDeliveries: [...state.reviewDeliveries, delivery]
        },
        relatedIds: [delivery.id, delivery.reviewId],
        effectRequests: []
    };
}
