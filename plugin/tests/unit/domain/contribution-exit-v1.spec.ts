import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { openRoundV1 } from "@/domain/transitions/round-v1.js";
import { disposeHandRaiseV1, raiseHandV1 } from "@/domain/transitions/hand-raise-v1.js";
import { closeContributionV1 } from "@/domain/transitions/contribution-exit-v1.js";

function stateWithContribution() {
    const open = openRoundV1(makeRunningMeetingStateV1(), {
        roundId: "round-v1",
        agendaId: "agenda-v1",
        managerId: "manager-v1",
        now: 1
    });
    if (open.kind !== "accepted") throw new Error("round");
    const hand = raiseHandV1(open.state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        purpose: "提交",
        now: 2
    });
    if (hand.kind !== "accepted") throw new Error("hand");
    const accepted = disposeHandRaiseV1(hand.state, {
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
        const result = closeContributionV1(state, {
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
});
