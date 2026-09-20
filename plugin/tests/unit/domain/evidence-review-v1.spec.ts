import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { openRoundV1 } from "@/domain/transitions/round.js";
import { disposeHandRaiseV1, raiseHandV1 } from "@/domain/transitions/hand-raise.js";
import { submitEvidenceV1 } from "@/domain/transitions/format-evidence.js";
import {
    recordReviewDeliveryV1,
    submitReviewBatchV1
} from "@/domain/transitions/evidence-review-v1.js";
import { isRoundClosableV1 } from "@/domain/transitions/round.js";
import { publishRoundV1 } from "@/domain/transitions/round-publication-v1.js";
import { closeContributionV1 } from "@/domain/transitions/contribution-exit-v1.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-validation.js";

function evidenceState() {
    let state = makeRunningMeetingStateV1();
    const open = openRoundV1(state, {
        roundId: "round-v1",
        agendaId: "agenda-v1",
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

describe("evidence review and delivery", () => {
    it("submits multiple reviews atomically with one state version increment", () => {
        const state = twoEvidenceState();
        const result = submitReviewBatchV1(state, {
            reviewerId: "reviewer-v1",
            reviews: [
                { reviewId: "review-v1", versionId: "version-v1", dimensions, scope: "本轮" },
                { reviewId: "review-v2", versionId: "version-v2", dimensions, scope: "本轮" }
            ],
            now: 6
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.version).toBe(state.version + 1);
        expect(result.state.reviews.map((review) => review.id)).toEqual(["review-v1", "review-v2"]);
        expect(result.effectRequests).toHaveLength(2);
    });

    it("rejects a partially invalid batch without writing any review", () => {
        const state = twoEvidenceState();
        const result = submitReviewBatchV1(state, {
            reviewerId: "reviewer-v1",
            reviews: [
                { reviewId: "review-v1", versionId: "version-v1", dimensions, scope: "本轮" },
                { reviewId: "review-v2", versionId: "missing", dimensions, scope: "本轮" }
            ],
            now: 6
        });
        expect(result).toMatchObject({ kind: "rejected", error: { code: "INVALID_ARGUMENT" } });
        expect(result.state).toBe(state);
    });

    it("rejects a non-unique reviewer identity", () => {
        const result = submitReviewBatchV1(evidenceState(), {
            reviewerId: "manager-v1",
            reviews: [
                { reviewId: "review-v1", versionId: "version-v1", dimensions, scope: "本轮" }
            ],
            now: 6
        });
        expect(result).toMatchObject({ kind: "rejected", error: { code: "REVIEWER_CONFLICT" } });
    });

    it("submits one review for the current version and requests delivery", () => {
        const result = submitReviewBatchV1(evidenceState(), {
            reviewerId: "reviewer-v1",
            reviews: [
                {
                    versionId: "version-v1",
                    reviewId: "review-v1",
                    dimensions,
                    scope: "本轮"
                }
            ],
            now: 6
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.reviews[0].baselinePublicationIds).toEqual([]);
        expect(result.effectRequests).toEqual([
            { kind: "review_delivery", reviewId: "review-v1", authorId: "contributor-v1" }
        ]);
    });
    it("requires a reason for failed delivery and permits one sent delivery", () => {
        const reviewed = submitReviewBatchV1(evidenceState(), {
            reviewerId: "reviewer-v1",
            reviews: [
                {
                    versionId: "version-v1",
                    reviewId: "review-v1",
                    dimensions,
                    scope: "本轮"
                }
            ],
            now: 6
        });
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
        const reviewed = submitReviewBatchV1(evidenceState(), {
            reviewerId: "reviewer-v1",
            reviews: [
                {
                    versionId: "version-v1",
                    reviewId: "review-v1",
                    dimensions,
                    scope: "本轮"
                }
            ],
            now: 6
        });
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
        const reviewed = submitReviewBatchV1(evidenceState(), {
            reviewerId: "reviewer-v1",
            reviews: [
                {
                    versionId: "version-v1",
                    reviewId: "review-v1",
                    dimensions,
                    scope: "本轮"
                }
            ],
            now: 6
        });
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
