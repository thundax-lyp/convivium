import type {
    EvidenceReview,
    EvidenceValidationFailureReason,
    MeetingState,
    OpaqueId,
    ReviewDimension
} from "@/domain/index.js";

export const MAX_EVIDENCE_VALIDATION_FAILURES = 5;

export interface SubmitEvidenceReviewInput {
    reviewId: OpaqueId;
    versionId: OpaqueId;
    dimensions: Readonly<{
        source: ReviewDimension;
        credibility: ReviewDimension;
        completeness: ReviewDimension;
        support: ReviewDimension;
    }>;
    scope: string;
    reviewerId: OpaqueId;
    roundId: OpaqueId;
    claimId: OpaqueId;
    now: number;
}
export interface ClaimEvidenceReviewInput {
    claimId: OpaqueId;
    sourceEffectId: OpaqueId;
    reviewerId: OpaqueId;
    roundId: OpaqueId;
    versionId: OpaqueId;
    now: number;
    expiresAt: number;
}
export interface FailEvidenceValidationInput {
    claimId: OpaqueId;
    roundId: OpaqueId;
    reason: EvidenceValidationFailureReason;
    now: number;
}
type ReviewDimensionsInput = SubmitEvidenceReviewInput["dimensions"];
type DeliveryInput = {
    reviewId: OpaqueId;
    dispatcherId: OpaqueId;
    deliveryId: OpaqueId;
    status: "sent" | "failed";
    failureReason?: string;
    now: number;
};
import { rejectedTransition as reject, type MeetingTransitionResult } from "./result.js";
function valid(now: number) {
    return Number.isSafeInteger(now) && now >= 0;
}
function validDimensions(
    state: MeetingState,
    roundId: OpaqueId,
    dimensions: ReviewDimensionsInput
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

function updateVersion(
    state: MeetingState,
    versionId: OpaqueId,
    transform: (
        version: MeetingState["evidencePackages"][number]["versions"][number]
    ) => MeetingState["evidencePackages"][number]["versions"][number]
) {
    return state.evidencePackages.map((pkg) => ({
        ...pkg,
        versions: pkg.versions.map((version) =>
            version.id === versionId ? transform(version) : version
        )
    }));
}

export function claimEvidenceReview(
    state: MeetingState,
    input: ClaimEvidenceReviewInput
): MeetingTransitionResult {
    if (
        !input.claimId.trim() ||
        !input.sourceEffectId.trim() ||
        !input.reviewerId.trim() ||
        !input.roundId.trim() ||
        !input.versionId.trim() ||
        !valid(input.now) ||
        !Number.isSafeInteger(input.expiresAt) ||
        input.expiresAt <= input.now
    )
        return reject(state, "INVALID_ARGUMENT", "invalid evidence review claim input");
    if (state.lifecycle.status !== "running")
        return reject(state, "INVALID_STATE", "meeting is not running");
    const round = state.rounds.find((candidate) => candidate.id === input.roundId);
    if (!round || round.status !== "open")
        return reject(state, "INVALID_STATE", "round is not open");
    const activeClaims = state.reviewClaims.filter((claim) => claim.expiresAt > input.now);
    if (activeClaims.some((claim) => claim.versionId === input.versionId))
        return reject(state, "REVIEWER_CONFLICT", "evidence already has an active review claim");
    if (state.reviewClaims.some((claim) => claim.id === input.claimId))
        return reject(state, "INVALID_ARGUMENT", "review claim id already exists");
    const reviewer = state.identities.find((identity) => identity.id === input.reviewerId);
    if (
        input.reviewerId !== state.evidenceReviewerId ||
        reviewer?.roles.length !== 1 ||
        reviewer.roles[0] !== "evidence_reviewer"
    )
        return reject(state, "REVIEWER_CONFLICT", "reviewer is not the designated reviewer");
    const pkg = state.evidencePackages.find(
        (candidate) => candidate.currentVersionId === input.versionId
    );
    const version = pkg?.versions.find((candidate) => candidate.id === input.versionId);
    if (
        pkg?.roundId !== input.roundId ||
        version === undefined ||
        !["submitted", "validation_failed", "validation_cancelled"].includes(version.status) ||
        version.failureCount >= MAX_EVIDENCE_VALIDATION_FAILURES ||
        !state.registrations.some(
            (registration) =>
                registration.versionId === input.versionId && registration.status === "complete"
        ) ||
        state.reviews.some((review) => review.versionId === input.versionId)
    )
        return reject(state, "REVIEWER_CONFLICT", "evidence version is unavailable");
    return {
        kind: "accepted",
        state: {
            ...state,
            version: state.version + 1,
            updatedAt: input.now,
            evidencePackages: updateVersion(state, input.versionId, (candidate) => {
                const { lastFailureReason: _lastFailureReason, ...withoutFailure } = candidate;
                return { ...withoutFailure, status: "validating" as const };
            }),
            reviewClaims: [
                ...state.reviewClaims,
                {
                    id: input.claimId,
                    sourceEffectId: input.sourceEffectId,
                    roundId: input.roundId,
                    reviewerId: input.reviewerId,
                    versionId: input.versionId,
                    claimedAt: input.now,
                    expiresAt: input.expiresAt
                }
            ]
        },
        relatedIds: [input.claimId, input.versionId],
        effectRequests: []
    };
}

export function submitEvidenceReview(
    state: MeetingState,
    input: SubmitEvidenceReviewInput
): MeetingTransitionResult {
    if (
        !input.reviewerId.trim() ||
        !input.roundId.trim() ||
        !input.claimId.trim() ||
        !valid(input.now) ||
        !input.reviewId.trim() ||
        !input.versionId.trim()
    )
        return reject(state, "INVALID_ARGUMENT", "invalid evidence review input");
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
            candidate.versionId === input.versionId &&
            candidate.expiresAt > input.now
    );
    if (!claim) return reject(state, "REVIEWER_CONFLICT", "evidence review claim is invalid");
    if (state.reviews.some((review) => review.versionId === input.versionId))
        return reject(state, "REVIEWER_CONFLICT", "evidence review is duplicated");
    const pkg = state.evidencePackages.find((candidate) =>
        candidate.versions.some((version) => version.id === input.versionId)
    );
    const version = pkg?.versions.find((candidate) => candidate.id === input.versionId);
    const round =
        pkg === undefined
            ? undefined
            : state.rounds.find((candidate) => candidate.id === pkg.roundId);
    if (
        pkg === undefined ||
        version?.status !== "validating" ||
        pkg.currentVersionId !== input.versionId ||
        round?.id !== input.roundId ||
        !state.registrations.some(
            (registration) =>
                registration.versionId === input.versionId && registration.status === "complete"
        ) ||
        !validDimensions(state, input.roundId, input.dimensions)
    )
        return reject(state, "INVALID_ARGUMENT", "evidence review is invalid");
    const review: EvidenceReview = {
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
            evidencePackages: updateVersion(state, input.versionId, (candidate) => ({
                ...candidate,
                status: "validated" as const
            })),
            reviews: [...state.reviews, review],
            reviewClaims: state.reviewClaims.filter((candidate) => candidate.id !== claim.id)
        },
        relatedIds: [review.id, review.versionId],
        effectRequests: [
            {
                kind: "review_delivery",
                reviewId: review.id,
                authorId: pkg.authorId
            }
        ]
    };
}

export function failEvidenceValidation(
    state: MeetingState,
    input: FailEvidenceValidationInput
): MeetingTransitionResult {
    if (
        !input.claimId.trim() ||
        !input.roundId.trim() ||
        !["review_timeout", "review_interrupted", "dispatch_failed"].includes(input.reason) ||
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
            evidencePackages: updateVersion(state, claim.versionId, (version) => ({
                ...version,
                status: "validation_failed" as const,
                failureCount: version.failureCount + 1,
                lastFailureReason: input.reason
            })),
            reviewClaims: state.reviewClaims.filter((candidate) => candidate.id !== claim.id)
        },
        relatedIds: [claim.id, claim.roundId, claim.versionId],
        effectRequests: []
    };
}

export function recordReviewDelivery(
    state: MeetingState,
    input: DeliveryInput
): MeetingTransitionResult {
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
