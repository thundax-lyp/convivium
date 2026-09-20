import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { openRoundV1 } from "@/domain/transitions/round-v1.js";
import { disposeHandRaiseV1, raiseHandV1 } from "@/domain/transitions/hand-raise-v1.js";
import {
    disposeSupplementHandV1,
    raiseSupplementHandV1
} from "@/domain/transitions/supplement-hand-v1.js";

function contributionState() {
    const opened = openRoundV1(makeRunningMeetingStateV1(), {
        roundId: "round-v1",
        agendaId: "agenda-v1",
        managerId: "manager-v1",
        now: 1
    });
    if (opened.kind !== "accepted") throw new Error("round did not open");
    const raised = raiseHandV1(opened.state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        purpose: "提交",
        now: 2
    });
    if (raised.kind !== "accepted") throw new Error("hand did not raise");
    const accepted = disposeHandRaiseV1(raised.state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        managerId: "manager-v1",
        disposition: "accepted",
        reason: "接纳",
        contributionId: "contribution-v1",
        now: 3
    });
    if (accepted.kind !== "accepted") throw new Error("hand did not accept");
    return accepted.state;
}

describe("supplement hand transitions", () => {
    it("records one supplement request on the original contribution", () => {
        const result = raiseSupplementHandV1(contributionState(), {
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            purpose: "补充反证",
            now: 4
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.contributions[0].supplementHand).toEqual({
            raisedAt: 4,
            purpose: "补充反证",
            status: "pending"
        });
        expect(result.state.contributions[0].response).toBe("补充反证");
    });

    it("accepts the hand without creating another contribution", () => {
        const raised = raiseSupplementHandV1(contributionState(), {
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            purpose: "补充",
            now: 4
        });
        if (raised.kind !== "accepted") throw new Error("supplement did not raise");
        const result = disposeSupplementHandV1(raised.state, {
            contributionId: "contribution-v1",
            managerId: "manager-v1",
            disposition: "accepted",
            reason: "继续",
            now: 5
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.contributions).toHaveLength(1);
        expect(result.state.contributions[0].supplementHand).toEqual({
            raisedAt: 4,
            purpose: "补充",
            status: "accepted",
            acceptedAt: 5
        });
    });

    it("rejects duplicate requests atomically", () => {
        const state = contributionState();
        const first = raiseSupplementHandV1(state, {
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            purpose: "补充",
            now: 4
        });
        if (first.kind !== "accepted") throw new Error("supplement did not raise");
        const second = raiseSupplementHandV1(first.state, {
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            purpose: "再次补充",
            now: 5
        });
        expect(second.kind).toBe("rejected");
        expect(second.kind === "rejected" && second.error.code).toBe("PRECONDITION_FAILED");
        expect(second.kind === "rejected" && second.state).toBe(first.state);
    });

    it("uses the registered version deadline instead of the initial preparation deadline", () => {
        const base = contributionState();
        const state = {
            ...base,
            limits: { ...base.limits, taskDeadlineMs: 10 },
            contributions: base.contributions.map((contribution) => ({
                ...contribution,
                packageId: "package-v1",
                status: "awaiting_response" as const
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
                            submittedAt: 12,
                            observation: "观察",
                            interpretation: "解释",
                            method: "方法",
                            falsifiers: [],
                            uncertainties: [],
                            limitations: [],
                            claims: [],
                            materials: []
                        }
                    ]
                }
            ]
        };

        const result = raiseSupplementHandV1(state, {
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            purpose: "补充",
            now: 14
        });

        expect(result.kind).toBe("accepted");
    });
});
