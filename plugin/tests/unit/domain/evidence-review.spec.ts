import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { abortRoundV1, openRoundV1 } from "@/domain/transitions/round.js";
import { disposeHandRaiseV1, raiseHandV1 } from "@/domain/transitions/hand-raise.js";
import { submitEvidenceV1 } from "@/domain/transitions/format-evidence.js";
import {
    claimReviewBatchV1,
    recordReviewDeliveryV1,
    releaseReviewBatchClaimV1,
    submitReviewBatchV1
} from "@/domain/transitions/evidence-review.js";
import { isRoundClosableV1 } from "@/domain/transitions/round.js";
import { publishRoundV1 } from "@/domain/transitions/round-publication.js";
import { closeContributionV1 } from "@/domain/transitions/contribution-exit.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-validation.js";
import {
    decodeMeetingStateV1,
    encodeMeetingStateV1
} from "@/repository/domain/meeting-state-codec.js";

function evidenceState() {
    let state = makeRunningMeetingStateV1();
    state = {
        ...state,
        managerPlans: [
            {
                id: "plan-v1",
                agendaId: "agenda-v1",
                managerId: "manager-v1",
                kind: "open_round",
                roundGoal: {
                    question: "核验证据",
                    evidenceGap: "缺少审核",
                    expectedOutput: "审核结果"
                },
                rationale: "测试开轮",
                createdAt: 0,
                status: "active"
            }
        ]
    };
    const open = openRoundV1(state, {
        roundId: "round-v1",
        agendaId: "agenda-v1",
        planId: "plan-v1",
        managerId: "manager-v1",
        now: 1
    });
    if (open.kind !== "accepted") throw new Error("round");
    state = open.state;
    const hand = raiseHandV1(state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        purpose: "提交",
        now: 2
    });
    if (hand.kind !== "accepted") throw new Error("hand");
    state = hand.state;
    const accept = disposeHandRaiseV1(state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        managerId: "manager-v1",
        disposition: "accepted",
        reason: "接纳",
        contributionId: "contribution-v1",
        now: 3
    });
    if (accept.kind !== "accepted") throw new Error("accept");
    state = accept.state;
    const submit = submitEvidenceV1(state, {
        contributionId: "contribution-v1",
        authorId: "contributor-v1",
        packageId: "package-v1",
        versionId: "version-v1",
        now: 5,
        evidence: {
            observation: "观察",
            interpretation: "解释",
            method: "方法",
            falsifiers: [{ value: "反证", reason: "理由" }],
            uncertainties: [{ value: "不确定", reason: "理由" }],
            limitations: [{ value: "限制", reason: "理由" }],
            claims: [
                {
                    id: "claim-v1",
                    statement: "主张",
                    materialIds: ["material-v1"],
                    qualification: "限定"
                }
            ],
            materials: [
                {
                    id: "material-v1",
                    kind: "document",
                    originator: "来源",
                    originalSource: "出处",
                    sourcePublishedAt: "2026",
                    acquiredAt: "2026",
                    version: "1",
                    locator: "loc",
                    location: "url",
                    verificationConditions: "条件",
                    limitations: "限制",
                    sharedDependencies: []
                }
            ]
        }
    });
    if (submit.kind !== "accepted") throw new Error("submit");
    return submit.state;
}
const dimensions = {
    source: { score: 3 as const, reason: "ok", scope: "scope", baselineEvidenceIds: [] },
    credibility: { score: 2 as const, reason: "ok", scope: "scope", baselineEvidenceIds: [] },
    completeness: { score: 1 as const, reason: "ok", scope: "scope", baselineEvidenceIds: [] },
    support: {
        score: "unable_to_assess" as const,
        reason: "unknown",
        scope: "scope",
        baselineEvidenceIds: []
    }
};

function twoEvidenceState() {
    const state = evidenceState();
    const version = {
        ...state.evidencePackages[0].versions[0],
        id: "version-v2"
    };
    return {
        ...state,
        evidencePackages: [
            ...state.evidencePackages,
            {
                ...state.evidencePackages[0],
                id: "package-v2",
                currentVersionId: "version-v2",
                versions: [version]
            }
        ],
        registrations: [
            ...state.registrations,
            {
                id: "registration-version-v2",
                versionId: "version-v2",
                status: "complete" as const,
                createdAt: 5
            }
        ]
    };
}

function submitClaimedReview(
    state: ReturnType<typeof evidenceState>,
    reviews: Parameters<typeof submitReviewBatchV1>[1]["reviews"],
    reviewerId = "reviewer-v1",
    now = 6
) {
    const claim = claimReviewBatchV1(state, {
        claimId: "review-claim-v1",
        sourceEffectId: "review-effect-v1",
        reviewerId: "reviewer-v1",
        roundId: "round-v1",
        versionIds: reviews.map((review) => review.versionId),
        now: 5,
        expiresAt: 100
    });
    if (claim.kind !== "accepted") throw new Error("claim");
    return submitReviewBatchV1(claim.state, {
        claimId: "review-claim-v1",
        reviewerId,
        roundId: "round-v1",
        reviews,
        now
    });
}

describe("evidence review and delivery", () => {
    it("submits multiple reviews atomically with one state version increment", () => {
        const state = twoEvidenceState();
        const result = submitClaimedReview(state, [
            { reviewId: "review-v1", versionId: "version-v1", dimensions, scope: "本轮" },
            { reviewId: "review-v2", versionId: "version-v2", dimensions, scope: "本轮" }
        ]);
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.version).toBe(state.version + 2);
        expect(result.state.reviewClaims).toEqual([]);
        expect(result.state.reviews.map((review) => review.id)).toEqual(["review-v1", "review-v2"]);
        expect(result.effectRequests).toHaveLength(2);
    });

    it("rejects a batch that does not exactly match its claim", () => {
        const state = twoEvidenceState();
        const claim = claimReviewBatchV1(state, {
            claimId: "review-claim-v1",
            sourceEffectId: "review-effect-v1",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionIds: ["version-v1", "version-v2"],
            now: 5,
            expiresAt: 100
        });
        if (claim.kind !== "accepted") throw new Error("claim");
        const result = submitReviewBatchV1(claim.state, {
            claimId: "review-claim-v1",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            reviews: [
                { reviewId: "review-v1", versionId: "version-v1", dimensions, scope: "本轮" },
                { reviewId: "review-v2", versionId: "missing", dimensions, scope: "本轮" }
            ],
            now: 6
        });
        expect(result).toMatchObject({ kind: "rejected", error: { code: "REVIEWER_CONFLICT" } });
        expect(result.state).toBe(claim.state);
    });

    it("blocks a second claim until the first expires, then replaces it", () => {
        const state = evidenceState();
        const first = claimReviewBatchV1(state, {
            claimId: "claim-first",
            sourceEffectId: "review-effect-first",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionIds: ["version-v1"],
            now: 5,
            expiresAt: 10
        });
        if (first.kind !== "accepted") throw new Error("first claim");
        const conflict = claimReviewBatchV1(first.state, {
            claimId: "claim-conflict",
            sourceEffectId: "review-effect-conflict",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionIds: ["version-v1"],
            now: 9,
            expiresAt: 20
        });
        expect(conflict).toMatchObject({ kind: "rejected", error: { code: "REVIEWER_CONFLICT" } });
        const replaced = claimReviewBatchV1(first.state, {
            claimId: "claim-replacement",
            sourceEffectId: "review-effect-replacement",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionIds: ["version-v1"],
            now: 10,
            expiresAt: 20
        });
        expect(replaced.kind === "accepted" && replaced.state.reviewClaims).toEqual([
            expect.objectContaining({ id: "claim-replacement" })
        ]);
    });

    it("preserves an active claim across state encoding and cold recovery", () => {
        const claim = claimReviewBatchV1(evidenceState(), {
            claimId: "review-claim-v1",
            sourceEffectId: "review-effect-v1",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionIds: ["version-v1"],
            now: 5,
            expiresAt: 100
        });
        if (claim.kind !== "accepted") throw new Error("claim");

        const recovered = decodeMeetingStateV1(encodeMeetingStateV1(claim.state));

        expect(recovered.reviewClaims).toEqual(claim.state.reviewClaims);
        expect(validateMeetingStateV1(recovered)).toMatchObject({ kind: "valid" });
    });

    it("rejects a late review after the timed-out turn releases its exact claim", () => {
        const state = evidenceState();
        const claim = claimReviewBatchV1(state, {
            claimId: "review-claim-v1",
            sourceEffectId: "review-effect-v1",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionIds: ["version-v1"],
            now: 5,
            expiresAt: 100
        });
        if (claim.kind !== "accepted") throw new Error("claim");
        const released = releaseReviewBatchClaimV1(claim.state, {
            claimId: "review-claim-v1",
            roundId: "round-v1",
            reason: "turn_timed_out",
            now: 6
        });
        if (released.kind !== "accepted") throw new Error("release");

        expect(released.state.reviewClaims).toEqual([]);
        expect(
            submitReviewBatchV1(released.state, {
                claimId: "review-claim-v1",
                reviewerId: "reviewer-v1",
                roundId: "round-v1",
                reviews: [
                    {
                        reviewId: "late-review",
                        versionId: "version-v1",
                        dimensions,
                        scope: "本轮"
                    }
                ],
                now: 7
            })
        ).toMatchObject({ kind: "rejected", error: { code: "REVIEWER_CONFLICT" } });
        expect(
            releaseReviewBatchClaimV1(claim.state, {
                claimId: "different-claim",
                roundId: "round-v1",
                reason: "turn_timed_out",
                now: 6
            })
        ).toMatchObject({ kind: "rejected", error: { code: "NOT_FOUND" } });
    });

    it("removes the round claim when an exceptional abort closes the round", () => {
        const claim = claimReviewBatchV1(evidenceState(), {
            claimId: "review-claim-v1",
            sourceEffectId: "review-effect-v1",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionIds: ["version-v1"],
            now: 5,
            expiresAt: 100
        });
        if (claim.kind !== "accepted") throw new Error("claim");

        const aborted = abortRoundV1(claim.state, {
            roundId: "round-v1",
            actor: { kind: "local_controller", id: "runtime-v1" },
            reason: "审核无法恢复",
            now: 6
        });

        expect(aborted.kind).toBe("accepted");
        expect(aborted.kind === "accepted" && aborted.state.reviewClaims).toEqual([]);
    });

    it("rejects a non-unique reviewer identity", () => {
        const result = submitClaimedReview(
            evidenceState(),
            [{ reviewId: "review-v1", versionId: "version-v1", dimensions, scope: "本轮" }],
            "manager-v1"
        );
        expect(result).toMatchObject({ kind: "rejected", error: { code: "REVIEWER_CONFLICT" } });
    });

    it("submits one review for the current version and requests delivery", () => {
        const result = submitClaimedReview(evidenceState(), [
            {
                versionId: "version-v1",
                reviewId: "review-v1",
                dimensions,
                scope: "本轮"
            }
        ]);
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.reviews[0].baselinePublicationIds).toEqual([]);
        expect(result.effectRequests).toEqual([
            { kind: "review_delivery", reviewId: "review-v1", authorId: "contributor-v1" }
        ]);
    });
    it("requires a reason for failed delivery and permits one sent delivery", () => {
        const reviewed = submitClaimedReview(evidenceState(), [
            {
                versionId: "version-v1",
                reviewId: "review-v1",
                dimensions,
                scope: "本轮"
            }
        ]);
        if (reviewed.kind !== "accepted") throw new Error("review");
        const failed = recordReviewDeliveryV1(reviewed.state, {
            reviewId: "review-v1",
            dispatcherId: "dispatcher-v1",
            deliveryId: "delivery-failed",
            status: "failed",
            now: 7
        });
        expect(failed.kind).toBe("rejected");
        const sent = recordReviewDeliveryV1(reviewed.state, {
            reviewId: "review-v1",
            dispatcherId: "dispatcher-v1",
            deliveryId: "delivery-v1",
            status: "sent",
            now: 8
        });
        expect(sent.kind).toBe("accepted");
        expect(sent.kind === "accepted" && sent.state.contributions[0]?.status).toBe(
            "awaiting_response"
        );
    });

    it("preserves a withdrawn Contribution when a pending review delivery is sent", () => {
        const reviewed = submitClaimedReview(evidenceState(), [
            {
                versionId: "version-v1",
                reviewId: "review-v1",
                dimensions,
                scope: "本轮"
            }
        ]);
        if (reviewed.kind !== "accepted") throw new Error("review");
        const withdrawn = closeContributionV1(reviewed.state, {
            contributionId: "contribution-v1",
            actorId: "contributor-v1",
            actorKind: "author",
            exit: "withdrawn",
            reason: "withdraw",
            now: 7
        });
        if (withdrawn.kind !== "accepted") throw new Error("withdraw");

        const delivered = recordReviewDeliveryV1(withdrawn.state, {
            reviewId: "review-v1",
            dispatcherId: "dispatcher-v1",
            deliveryId: "delivery-v1",
            status: "sent",
            now: 8
        });

        expect(delivered.kind).toBe("accepted");
        expect(delivered.kind === "accepted" && delivered.state.contributions[0]?.status).toBe(
            "withdrawn"
        );
    });

    it("publishes reviewed evidence after its review is delivered", () => {
        const reviewed = submitClaimedReview(evidenceState(), [
            {
                versionId: "version-v1",
                reviewId: "review-v1",
                dimensions,
                scope: "本轮"
            }
        ]);
        if (reviewed.kind !== "accepted") throw new Error("review");
        const delivered = recordReviewDeliveryV1(reviewed.state, {
            reviewId: "review-v1",
            dispatcherId: "dispatcher-v1",
            deliveryId: "delivery-v1",
            status: "sent",
            now: 7
        });
        if (delivered.kind !== "accepted") throw new Error("delivery");

        expect(isRoundClosableV1(delivered.state, "round-v1")).toBe(true);
        const published = publishRoundV1(delivered.state, {
            roundId: "round-v1",
            managerId: "manager-v1",
            publicationId: "publication-v1",
            messageIds: ["message-v1"],
            now: 8
        });

        expect(published.kind).toBe("accepted");
        expect(published.kind === "accepted" && published.state.contributions[0]?.status).toBe(
            "closed"
        );
        expect(published.kind === "accepted" && published.state.contributions[0]?.exitReason).toBe(
            "published"
        );
        expect(
            published.kind === "accepted" && published.state.publications[0]?.exitReasons
        ).toEqual(["published"]);
        expect(
            published.kind === "accepted" && validateMeetingStateV1(published.state)
        ).toMatchObject({ kind: "valid" });
    });
});
