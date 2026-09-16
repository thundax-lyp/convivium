import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { openRoundV1 } from "@/domain/transitions/round-v1.js";
import { disposeHandRaiseV1, raiseHandV1 } from "@/domain/transitions/hand-raise-v1.js";
import {
    reviewEvidenceDraftV1,
    submitEvidenceV1
} from "@/domain/transitions/format-evidence-v1.js";
import { recordReviewDeliveryV1, submitReviewV1 } from "@/domain/transitions/evidence-review-v1.js";

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
    const format = reviewEvidenceDraftV1(state, {
        contributionId: "contribution-v1",
        managerId: "manager-v1",
        evidenceHash: "a".repeat(64),
        disposition: "accepted",
        missingFields: [],
        rationale: "完整",
        approvalId: "approval-v1",
        now: 4
    });
    if (format.kind !== "accepted") throw new Error("format");
    state = format.state;
    const submit = submitEvidenceV1(state, {
        contributionId: "contribution-v1",
        authorId: "contributor-v1",
        verifiedEvidenceHash: "a".repeat(64),
        packageId: "package-v1",
        versionId: "version-v1",
        registrationId: "registration-v1",
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

describe("evidence review and delivery", () => {
    it("submits one review for the current version and requests delivery", () => {
        const result = submitReviewV1(evidenceState(), {
            versionId: "version-v1",
            reviewerId: "reviewer-v1",
            reviewId: "review-v1",
            dimensions,
            scope: "本轮",
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
        const reviewed = submitReviewV1(evidenceState(), {
            versionId: "version-v1",
            reviewerId: "reviewer-v1",
            reviewId: "review-v1",
            dimensions,
            scope: "本轮",
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
    });
});
