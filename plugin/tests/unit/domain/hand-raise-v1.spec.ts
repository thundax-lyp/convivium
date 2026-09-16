import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { openRoundV1 } from "@/domain/transitions/round-v1.js";
import { disposeHandRaiseV1, raiseHandV1 } from "@/domain/transitions/hand-raise-v1.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-v1-validation.js";

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

function stateWithMail(
    status: "queued" | "processing" | "completed" | "timed_out" | "cancelled",
    recipientId = "contributor-v1"
) {
    const state = openState();
    const publication = {
        id: "publication-v1",
        roundId: "round-v1",
        seq: 1,
        finalVersionIds: [],
        finalReviewIds: [],
        publishedAt: 0,
        exitReasons: []
    };
    const mail = {
        id: "mail-v1",
        senderId: "manager-v1",
        recipientId,
        body: "private context",
        relatedIds: [publication.id],
        sendContextPublicationUpperBound: [publication.id],
        status,
        deadlineAt: 600000,
        createdAt: 0,
        ...(status !== "queued"
            ? { processingContextPublicationUpperBound: [publication.id], processingStartedAt: 1 }
            : {}),
        ...(status === "completed" ? { completedAt: 2 } : {}),
        ...(status === "timed_out" ? { completedAt: 600000, failureReason: "timeout" } : {}),
        ...(status === "cancelled" ? { completedAt: 2, failureReason: "cancelled" } : {})
    };
    const candidate = {
        ...state,
        publications: [publication],
        privateMails: [mail]
    } as MeetingState;
    expect(validateMeetingStateV1(candidate)).toMatchObject({ kind: "valid" });
    return candidate;
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

    it("atomically rejects accepting a contributor who is a processing mail recipient", () => {
        const raised = raiseHandV1(stateWithMail("processing"), {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            purpose: "提交证据",
            now: 2
        });
        expect(raised.kind).toBe("accepted");
        if (raised.kind !== "accepted") return;
        const before = raised.state;
        const result = disposeHandRaiseV1(before, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            managerId: "manager-v1",
            disposition: "accepted",
            reason: "接纳",
            contributionId: "contribution-v1",
            now: 3
        });
        expect(result.kind).toBe("rejected");
        if (result.kind === "rejected") expect(result.error.code).toBe("PRECONDITION_FAILED");
        expect(result.state).toBe(before);
        expect(result.state.pendingHandRaises).toBe(before.pendingHandRaises);
        expect(result.state.rounds).toBe(before.rounds);
        expect(result.state.contributions).toBe(before.contributions);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    it.each(["rejected", "deferred"] as const)(
        "allows %s disposition while mail is processing",
        (disposition) => {
            const raised = raiseHandV1(stateWithMail("processing"), {
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
                disposition,
                reason: "暂不接纳",
                now: 3
            });
            expect(result.kind).toBe("accepted");
            if (result.kind === "accepted") expect(result.state.pendingHandRaises).toEqual([]);
        }
    );

    it.each(["queued", "completed", "timed_out", "cancelled"] as const)(
        "allows accepted hand with %s mail",
        (status) => {
            const raised = raiseHandV1(stateWithMail(status), {
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
                contributionId: `contribution-${status}`,
                now: 3
            });
            expect(result.kind).toBe("accepted");
        }
    );

    it("allows accepted hand when another recipient has a processing mail", () => {
        const raised = raiseHandV1(stateWithMail("processing", "reviewer-v1"), {
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
            contributionId: "contribution-other",
            now: 3
        });
        expect(result.kind).toBe("accepted");
    });
});
