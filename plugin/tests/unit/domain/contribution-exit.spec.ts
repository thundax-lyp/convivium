import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { openRound } from "@/domain/transitions/round.ts";
import { disposeHandRaise, raiseHand } from "@/domain/transitions/hand-raise.ts";
import { closeContribution } from "@/domain/transitions/contribution-exit.ts";
import { isRoundClosable } from "@/domain/transitions/round.ts";
import { publishRound } from "@/domain/transitions/round-publication.ts";
import { validateMeetingState } from "@/domain/meeting-state-validation.ts";

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
    if (open.kind !== "accepted") {
        throw new Error("round");
    }
    const hand = raiseHand(open.state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        purpose: "提交",
        now: 2
    });
    if (hand.kind !== "accepted") {
        throw new Error("hand");
    }
    const accepted = disposeHandRaise(hand.state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        managerId: "manager-v1",
        disposition: "accepted",
        reason: "接纳",
        contributionId: "contribution-v1",
        now: 3
    });
    if (accepted.kind !== "accepted") {
        throw new Error("accept");
    }
    return accepted.state;
}

describe("contribution exit", () => {
    it("records a runtime-observed execution failure and makes an evidence-free round ready", () => {
        const state = stateWithContribution();
        const failure = {
            sourceEffectId: "effect-contribution-1",
            stage: "contribution_turn",
            failureCode: "MALFORMED_RESPONSE",
            failureSummary: "模型工具参数不是有效 JSON",
            attemptCount: 2,
            retryable: false,
            occurredAt: 4
        };
        const result = closeContribution(state, {
            contributionId: "contribution-v1",
            actorId: "runtime-recovery",
            actorKind: "runtime",
            exit: "execution_failed",
            reason: failure.failureSummary,
            failure,
            now: 4
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") {
            return;
        }
        expect(result.state.contributions[0]).toMatchObject({
            status: "execution_failed",
            failure
        });
        expect(isRoundClosable(result.state, "round-v1")).toBe(true);
        expect(result.effectRequests).toContainEqual({
            kind: "agent_notice",
            noticeKind: "round_ready",
            recipientId: "manager-v1",
            agendaId: "agenda-v1",
            roundId: "round-v1"
        });
        const published = publishRound(result.state, {
            roundId: "round-v1",
            managerId: "manager-v1",
            publicationId: "publication-v1",
            messageIds: [],
            now: 5
        });
        expect(published.kind).toBe("accepted");
        if (published.kind === "accepted") {
            expect(published.state.publications[0]).toMatchObject({
                finalVersionIds: [],
                finalReviewIds: [],
                exitReasons: [failure.failureSummary],
                contributionFailures: [{ contributionId: "contribution-v1", failure }]
            });
            expect(validateMeetingState(published.state)).toMatchObject({ kind: "valid" });
            expect(
                validateMeetingState({
                    ...published.state,
                    publications: [
                        { ...published.state.publications[0]!, contributionFailures: [] }
                    ]
                })
            ).toMatchObject({
                kind: "invalid",
                path: "$.publications[0].contributionFailures"
            });
        }
    });

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
        if (result.kind !== "accepted") {
            return;
        }
        expect(result.state.contributions[0]).toMatchObject({
            status: "withdrawn",
            exitReason: "无法在本轮完成"
        });
    });
});
