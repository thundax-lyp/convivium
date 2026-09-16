import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { openRoundV1 } from "@/domain/transitions/round-v1.js";
import { disposeHandRaiseV1, raiseHandV1 } from "@/domain/transitions/hand-raise-v1.js";

function openState() {
    const state = makeRunningMeetingStateV1();
    const opened = openRoundV1(state, {
        roundId: "round-v1",
        agendaId: "agenda-v1",
        managerId: "manager-v1",
        now: 1
    });
    expect(opened.kind).toBe("accepted");
    if (opened.kind !== "accepted") throw new Error("round did not open");
    return opened.state;
}

describe("hand raise transitions", () => {
    it("raises a hand and emits an initial hand request", () => {
        const result = raiseHandV1(openState(), {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            purpose: "提交证据",
            now: 2
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.pendingHandRaises).toEqual([
            {
                roundId: "round-v1",
                contributorId: "contributor-v1",
                purpose: "提交证据",
                raisedAt: 2
            }
        ]);
        expect(result.effectRequests).toEqual([
            {
                kind: "agent_notice",
                noticeKind: "hand_request",
                requestKind: "initial",
                recipientId: "manager-v1",
                agendaId: "agenda-v1",
                roundId: "round-v1",
                contributorId: "contributor-v1"
            }
        ]);
    });

    it("accepts a pending hand into one preparing contribution", () => {
        const raised = raiseHandV1(openState(), {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            purpose: "提交证据",
            now: 2
        });
        expect(raised.kind).toBe("accepted");
        if (raised.kind !== "accepted") return;
        const result = disposeHandRaiseV1(raised.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            managerId: "manager-v1",
            disposition: "accepted",
            reason: "接纳",
            contributionId: "contribution-v1",
            now: 3
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.pendingHandRaises).toEqual([]);
        expect(result.state.contributions[0]).toMatchObject({
            id: "contribution-v1",
            roundId: "round-v1",
            contributorId: "contributor-v1",
            status: "preparing",
            acceptedAt: 3,
            substantiveSupplementCount: 0
        });
        expect(result.state.rounds[0].contributionIds).toEqual(["contribution-v1"]);
        expect(result.effectRequests).toEqual([
            {
                kind: "agent_notice",
                noticeKind: "hand_disposition",
                requestKind: "initial",
                recipientId: "contributor-v1",
                agendaId: "agenda-v1",
                roundId: "round-v1",
                contributorId: "contributor-v1",
                disposition: "accepted",
                reason: "接纳",
                contributionId: "contribution-v1"
            }
        ]);
    });

    it("rejects one hand while another contributor remains independently eligible", () => {
        const state = openState();
        const first = raiseHandV1(state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            purpose: "A",
            now: 2
        });
        expect(first.kind).toBe("accepted");
        if (first.kind !== "accepted") return;
        const rejected = disposeHandRaiseV1(first.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            managerId: "manager-v1",
            disposition: "rejected",
            reason: "暂不接纳",
            now: 3
        });
        expect(rejected.kind).toBe("accepted");
        if (rejected.kind !== "accepted") return;
        const second = raiseHandV1(rejected.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            purpose: "B",
            now: 4
        });
        expect(second.kind).toBe("accepted");
        if (second.kind !== "accepted") return;
        expect(second.state.contributions).toEqual([]);
        expect(second.state.pendingHandRaises).toHaveLength(1);
    });
});
