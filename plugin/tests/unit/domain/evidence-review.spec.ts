import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { abortRound, openRound } from "@/domain/transitions/round.js";
import { disposeHandRaise, raiseHand } from "@/domain/transitions/hand-raise.js";
import { submitEvidence } from "@/domain/transitions/format-evidence.js";
import {
    claimEvidenceReview,
    failEvidenceValidation,
    MAX_EVIDENCE_VALIDATION_FAILURES,
    recordReviewDelivery,
    submitEvidenceReview
} from "@/domain/transitions/evidence-review.js";
import { isRoundClosable } from "@/domain/transitions/round.js";
import { publishRound } from "@/domain/transitions/round-publication.js";
import { closeContribution } from "@/domain/transitions/contribution-exit.js";
import { validateMeetingState } from "@/domain/meeting-state-validation.js";
import { decodeMeetingState, encodeMeetingState } from "@/repository/domain/meeting-state-codec.js";
import { transitionMeetingState } from "@/domain/meeting-state-transitions.js";

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
    const open = openRound(state, {
        roundId: "round-v1",
        agendaId: "agenda-v1",
        planId: "plan-v1",
        managerId: "manager-v1",
        now: 1
    });
    if (open.kind !== "accepted") throw new Error("round");
    state = open.state;
    const hand = raiseHand(state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        purpose: "提交",
        now: 2
    });
    if (hand.kind !== "accepted") throw new Error("hand");
    state = hand.state;
    const accept = disposeHandRaise(state, {
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
    const submit = submitEvidence(state, {
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
    review: Omit<
        Parameters<typeof submitEvidenceReview>[1],
        "reviewerId" | "roundId" | "claimId" | "now"
    >,
    reviewerId = "reviewer-v1",
    now = 6
) {
    const claim = claimEvidenceReview(state, {
        claimId: "review-claim-v1",
        sourceEffectId: "review-effect-v1",
        reviewerId: "reviewer-v1",
        roundId: "round-v1",
        versionId: review.versionId,
        now: 5,
        expiresAt: 100
    });
    if (claim.kind !== "accepted") throw new Error("claim");
    return submitEvidenceReview(claim.state, {
        claimId: "review-claim-v1",
        reviewerId,
        roundId: "round-v1",
        ...review,
        now
    });
}

describe("evidence review and delivery", () => {
    it("tracks submitted, validating, failed, and retry exhaustion per version", () => {
        let state = evidenceState();
        expect(state.evidencePackages[0].versions[0]).toMatchObject({
            status: "submitted",
            failureCount: 0
        });

        for (let attempt = 1; attempt <= MAX_EVIDENCE_VALIDATION_FAILURES; attempt += 1) {
            const claim = claimEvidenceReview(state, {
                claimId: `claim-${attempt}`,
                sourceEffectId: `effect-${attempt}`,
                reviewerId: "reviewer-v1",
                roundId: "round-v1",
                versionId: "version-v1",
                now: attempt * 10,
                expiresAt: attempt * 10 + 5
            });
            expect(claim.kind).toBe("accepted");
            if (claim.kind !== "accepted") return;
            expect(claim.state.evidencePackages[0].versions[0].status).toBe("validating");
            const failed = failEvidenceValidation(claim.state, {
                claimId: `claim-${attempt}`,
                roundId: "round-v1",
                reason: "review_timeout",
                now: attempt * 10 + 5
            });
            expect(failed.kind).toBe("accepted");
            if (failed.kind !== "accepted") return;
            state = failed.state;
            expect(state.evidencePackages[0].versions[0]).toMatchObject({
                status: "validation_failed",
                failureCount: attempt,
                lastFailureReason: "review_timeout"
            });
        }

        expect(
            claimEvidenceReview(state, {
                claimId: "claim-exhausted",
                sourceEffectId: "effect-exhausted",
                reviewerId: "reviewer-v1",
                roundId: "round-v1",
                versionId: "version-v1",
                now: 100,
                expiresAt: 110
            })
        ).toMatchObject({ kind: "rejected", error: { code: "REVIEWER_CONFLICT" } });
    });

    it("cancels in-flight validation on pause without spending failure budget and can reclaim after resume", () => {
        const claim = claimEvidenceReview(evidenceState(), {
            claimId: "claim-before-pause",
            sourceEffectId: "effect-before-pause",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionId: "version-v1",
            now: 6,
            expiresAt: 100
        });
        if (claim.kind !== "accepted") throw new Error("claim");
        const paused = transitionMeetingState(
            claim.state,
            { kind: "pause_meeting", reason: "人工暂停" },
            { kind: "local_controller", id: "local-v1" },
            7,
            "pause-fact"
        );
        expect(paused.kind).toBe("accepted");
        if (paused.kind !== "accepted") return;
        expect(paused.state.reviewClaims).toEqual([]);
        expect(paused.state.evidencePackages[0].versions[0]).toMatchObject({
            status: "validation_cancelled",
            failureCount: 0
        });
        const resumed = transitionMeetingState(
            paused.state,
            { kind: "resume_meeting", reason: "继续" },
            { kind: "local_controller", id: "local-v1" },
            8,
            "resume-fact"
        );
        if (resumed.kind !== "accepted") throw new Error("resume");
        expect(
            claimEvidenceReview(resumed.state, {
                claimId: "claim-after-resume",
                sourceEffectId: "effect-after-resume",
                reviewerId: "reviewer-v1",
                roundId: "round-v1",
                versionId: "version-v1",
                now: 9,
                expiresAt: 100
            })
        ).toMatchObject({ kind: "accepted" });
    });

    it("cancels submitted validation work on pause so resume can enqueue it again", () => {
        const paused = transitionMeetingState(
            evidenceState(),
            { kind: "pause_meeting", reason: "人工暂停" },
            { kind: "local_controller", id: "local-v1" },
            7,
            "pause-fact"
        );

        expect(paused.kind).toBe("accepted");
        if (paused.kind !== "accepted") return;
        expect(paused.state.evidencePackages[0].versions[0]).toMatchObject({
            status: "validation_cancelled",
            failureCount: 0
        });
        expect(paused.state.reviewClaims).toEqual([]);
    });

    it("validates evidence versions independently", () => {
        const state = twoEvidenceState();
        const result = submitClaimedReview(state, {
            reviewId: "review-v1",
            versionId: "version-v1",
            dimensions,
            scope: "本轮"
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.evidencePackages[0].versions[0].status).toBe("validated");
        expect(result.state.evidencePackages[1].versions[0].status).toBe("submitted");
        expect(result.effectRequests).toHaveLength(1);
    });

    it("allows distinct versions in the same round to hold independent claims", () => {
        const first = claimEvidenceReview(twoEvidenceState(), {
            claimId: "claim-v1",
            sourceEffectId: "effect-v1",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionId: "version-v1",
            now: 6,
            expiresAt: 100
        });
        if (first.kind !== "accepted") throw new Error("first claim");
        const second = claimEvidenceReview(first.state, {
            claimId: "claim-v2",
            sourceEffectId: "effect-v2",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionId: "version-v2",
            now: 7,
            expiresAt: 100
        });
        expect(second.kind).toBe("accepted");
        if (second.kind !== "accepted") return;
        expect(second.state.reviewClaims.map(({ versionId }) => versionId)).toEqual([
            "version-v1",
            "version-v2"
        ]);
        expect(second.state.evidencePackages.map((pkg) => pkg.versions[0].status)).toEqual([
            "validating",
            "validating"
        ]);
    });

    it("blocks a second claim until the first expires, then replaces it", () => {
        const state = evidenceState();
        const first = claimEvidenceReview(state, {
            claimId: "claim-first",
            sourceEffectId: "review-effect-first",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionId: "version-v1",
            now: 5,
            expiresAt: 10
        });
        if (first.kind !== "accepted") throw new Error("first claim");
        const conflict = claimEvidenceReview(first.state, {
            claimId: "claim-conflict",
            sourceEffectId: "review-effect-conflict",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionId: "version-v1",
            now: 9,
            expiresAt: 20
        });
        expect(conflict).toMatchObject({ kind: "rejected", error: { code: "REVIEWER_CONFLICT" } });
        const timedOut = failEvidenceValidation(first.state, {
            claimId: "claim-first",
            roundId: "round-v1",
            reason: "review_timeout",
            now: 10
        });
        if (timedOut.kind !== "accepted") throw new Error("timeout");
        const replaced = claimEvidenceReview(timedOut.state, {
            claimId: "claim-replacement",
            sourceEffectId: "review-effect-replacement",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionId: "version-v1",
            now: 10,
            expiresAt: 20
        });
        expect(replaced.kind === "accepted" && replaced.state.reviewClaims).toEqual([
            expect.objectContaining({ id: "claim-replacement" })
        ]);
    });

    it("preserves an active claim across state encoding and cold recovery", () => {
        const claim = claimEvidenceReview(evidenceState(), {
            claimId: "review-claim-v1",
            sourceEffectId: "review-effect-v1",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionId: "version-v1",
            now: 5,
            expiresAt: 100
        });
        if (claim.kind !== "accepted") throw new Error("claim");

        const recovered = decodeMeetingState(encodeMeetingState(claim.state));

        expect(recovered.reviewClaims).toEqual(claim.state.reviewClaims);
        expect(validateMeetingState(recovered)).toMatchObject({ kind: "valid" });
    });

    it("rejects a late review after the timed-out turn releases its exact claim", () => {
        const state = evidenceState();
        const claim = claimEvidenceReview(state, {
            claimId: "review-claim-v1",
            sourceEffectId: "review-effect-v1",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionId: "version-v1",
            now: 5,
            expiresAt: 100
        });
        if (claim.kind !== "accepted") throw new Error("claim");
        const released = failEvidenceValidation(claim.state, {
            claimId: "review-claim-v1",
            roundId: "round-v1",
            reason: "review_timeout",
            now: 6
        });
        if (released.kind !== "accepted") throw new Error("release");

        expect(released.state.reviewClaims).toEqual([]);
        expect(
            submitEvidenceReview(released.state, {
                claimId: "review-claim-v1",
                reviewerId: "reviewer-v1",
                roundId: "round-v1",
                reviewId: "late-review",
                versionId: "version-v1",
                dimensions,
                scope: "本轮",
                now: 7
            })
        ).toMatchObject({ kind: "rejected", error: { code: "REVIEWER_CONFLICT" } });
        expect(
            failEvidenceValidation(claim.state, {
                claimId: "different-claim",
                roundId: "round-v1",
                reason: "review_timeout",
                now: 6
            })
        ).toMatchObject({ kind: "rejected", error: { code: "NOT_FOUND" } });
    });

    it("removes the round claim when an exceptional abort closes the round", () => {
        const claim = claimEvidenceReview(evidenceState(), {
            claimId: "review-claim-v1",
            sourceEffectId: "review-effect-v1",
            reviewerId: "reviewer-v1",
            roundId: "round-v1",
            versionId: "version-v1",
            now: 5,
            expiresAt: 100
        });
        if (claim.kind !== "accepted") throw new Error("claim");

        const aborted = abortRound(claim.state, {
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
            {
                reviewId: "review-v1",
                versionId: "version-v1",
                dimensions,
                scope: "本轮"
            },
            "manager-v1"
        );
        expect(result).toMatchObject({ kind: "rejected", error: { code: "REVIEWER_CONFLICT" } });
    });

    it("submits one review for the current version and requests delivery", () => {
        const result = submitClaimedReview(evidenceState(), {
            versionId: "version-v1",
            reviewId: "review-v1",
            dimensions,
            scope: "本轮"
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.reviews[0].baselinePublicationIds).toEqual([]);
        expect(result.effectRequests).toEqual([
            { kind: "review_delivery", reviewId: "review-v1", authorId: "contributor-v1" }
        ]);
    });
});

describe("review delivery and publication", () => {
    it("requires a reason for failed delivery and permits one sent delivery", () => {
        const reviewed = submitClaimedReview(evidenceState(), {
            versionId: "version-v1",
            reviewId: "review-v1",
            dimensions,
            scope: "本轮"
        });
        if (reviewed.kind !== "accepted") throw new Error("review");
        const failed = recordReviewDelivery(reviewed.state, {
            reviewId: "review-v1",
            dispatcherId: "dispatcher-v1",
            deliveryId: "delivery-failed",
            status: "failed",
            now: 7
        });
        expect(failed.kind).toBe("rejected");
        const sent = recordReviewDelivery(reviewed.state, {
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
        const reviewed = submitClaimedReview(evidenceState(), {
            versionId: "version-v1",
            reviewId: "review-v1",
            dimensions,
            scope: "本轮"
        });
        if (reviewed.kind !== "accepted") throw new Error("review");
        const withdrawn = closeContribution(reviewed.state, {
            contributionId: "contribution-v1",
            actorId: "contributor-v1",
            actorKind: "author",
            exit: "withdrawn",
            reason: "withdraw",
            now: 7
        });
        if (withdrawn.kind !== "accepted") throw new Error("withdraw");

        const delivered = recordReviewDelivery(withdrawn.state, {
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
        const reviewed = submitClaimedReview(evidenceState(), {
            versionId: "version-v1",
            reviewId: "review-v1",
            dimensions,
            scope: "本轮"
        });
        if (reviewed.kind !== "accepted") throw new Error("review");
        const delivered = recordReviewDelivery(reviewed.state, {
            reviewId: "review-v1",
            dispatcherId: "dispatcher-v1",
            deliveryId: "delivery-v1",
            status: "sent",
            now: 7
        });
        if (delivered.kind !== "accepted") throw new Error("delivery");

        expect(isRoundClosable(delivered.state, "round-v1")).toBe(true);
        const published = publishRound(delivered.state, {
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
        expect(published.kind === "accepted" && published.effectRequests).toEqual(
            ["manager-v1", "contributor-v1", "reviewer-v1"].map((recipientId) => ({
                kind: "agent_notice",
                noticeKind: "transcript_update",
                recipientId,
                agendaId: "agenda-v1",
                publicMessageId: "message-v1"
            }))
        );
        expect(
            published.kind === "accepted" && validateMeetingState(published.state)
        ).toMatchObject({ kind: "valid" });
    });
});
