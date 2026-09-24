import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { openRound } from "@/domain/transitions/round.js";
import { disposeHandRaise, raiseHand } from "@/domain/transitions/hand-raise.js";
import { closeContribution } from "@/domain/transitions/contribution-exit.js";
import { isRoundClosable } from "@/domain/transitions/round.js";

function stateWithContribution() {
    const state = makeRunningMeetingStateV1();
    state.managerPlans = [
        {
            id: "plan-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            kind: "open_round",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            rationale: "plan",
            createdAt: 0,
            status: "active"
        }
    ];
    const open = openRound(state, {
        roundId: "round-v1",
        agendaId: "agenda-v1",
        planId: "plan-v1",
        managerId: "manager-v1",
        now: 1
    });
    if (open.kind !== "accepted") throw new Error("round");
    const hand = raiseHand(open.state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        purpose: "提交",
        now: 2
    });
    if (hand.kind !== "accepted") throw new Error("hand");
    const accepted = disposeHandRaise(hand.state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        managerId: "manager-v1",
        disposition: "accepted",
        reason: "接纳",
        contributionId: "contribution-v1",
        now: 3
    });
    if (accepted.kind !== "accepted") throw new Error("accept");
    return accepted.state;
}

describe("contribution exit", () => {
    it("lets the author explicitly withdraw with a durable reason", () => {
        const state = stateWithContribution();
        const result = closeContribution(state, {
            contributionId: "contribution-v1",
            actorId: "contributor-v1",
            actorKind: "author",
            exit: "withdrawn",
            reason: "无法在本轮完成",
            now: 4
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.contributions[0]).toMatchObject({
            status: "withdrawn",
            exitReason: "无法在本轮完成"
        });
    });
    it("lets the deadline handler close a delivered contribution for publication", () => {
        const base = stateWithContribution();
        const responseDeadline = 10 + base.limits.responseDeadlineMs;
        const state = {
            ...base,
            contributions: base.contributions.map((contribution) => ({
                ...contribution,
                status: "awaiting_response" as const,
                packageId: "package-v1"
            })),
            evidencePackages: [
                {
                    id: "package-v1",
                    roundId: "round-v1",
                    contributionId: "contribution-v1",
                    authorId: "contributor-v1",
                    agendaId: "agenda-v1",
                    currentVersionId: "version-v1",
                    versions: [
                        {
                            id: "version-v1",
                            ordinal: 1,
                            submittedAt: 4,
                            status: "validated" as const,
                            failureCount: 0,
                            observation: "观察",
                            interpretation: "解释",
                            method: "方法",
                            falsifiers: [{ value: "反证" }],
                            uncertainties: [{ value: "不确定" }],
                            limitations: [{ value: "限制" }],
                            claims: [],
                            materials: []
                        }
                    ]
                }
            ],
            registrations: [
                {
                    id: "registration-v1",
                    versionId: "version-v1",
                    status: "complete" as const,
                    createdAt: 4
                }
            ],
            reviews: [
                {
                    id: "review-v1",
                    versionId: "version-v1",
                    reviewerId: "reviewer-v1",
                    baselinePublicationIds: [],
                    scope: "完整证据",
                    dimensions: {
                        source: {
                            score: 3 as const,
                            scope: "来源",
                            reason: "可信",
                            baselineEvidenceIds: []
                        },
                        credibility: {
                            score: 3 as const,
                            scope: "可信度",
                            reason: "可信",
                            baselineEvidenceIds: []
                        },
                        completeness: {
                            score: 3 as const,
                            scope: "完整性",
                            reason: "完整",
                            baselineEvidenceIds: []
                        },
                        support: {
                            score: 3 as const,
                            scope: "支持度",
                            reason: "充分",
                            baselineEvidenceIds: []
                        }
                    },
                    createdAt: 5
                }
            ],
            reviewClaims: [],
            reviewDeliveries: [
                {
                    id: "delivery-v1",
                    reviewId: "review-v1",
                    authorId: "contributor-v1",
                    status: "sent" as const,
                    sentAt: 10
                }
            ]
        };
        const result = closeContribution(state, {
            contributionId: "contribution-v1",
            actorId: "deadline-handler",
            actorKind: "deadline_handler",
            exit: "timed_out",
            reason: "响应期限已到",
            now: responseDeadline
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.contributions[0]).toMatchObject({
            status: "timed_out",
            exitReason: "响应期限已到"
        });
        expect(isRoundClosable(result.state, "round-v1")).toBe(true);
    });
});
