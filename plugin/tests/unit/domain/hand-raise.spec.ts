import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { openRound as openRoundTransition } from "@/domain/transitions/round.ts";

type OpenRoundFixtureInput = Omit<Parameters<typeof openRoundTransition>[1], "planId">;

const openRoundWithPlan = (
    state: Parameters<typeof openRoundTransition>[0],
    input: OpenRoundFixtureInput
) =>
    openRoundTransition(
        {
            ...state,
            managerPlans: [
                ...state.managerPlans,
                {
                    id: "plan-v1",
                    agendaId: input.agendaId,
                    managerId: input.managerId,
                    kind: "open_round",
                    roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
                    rationale: "plan",
                    createdAt: 0,
                    status: "active"
                }
            ]
        },
        { ...input, planId: "plan-v1" }
    );
import { disposeHandRaise, raiseHand } from "@/domain/transitions/hand-raise.ts";

function openState() {
    const state = makeRunningMeetingStateV1();
    state.rounds = [
        {
            id: "round-0",
            agendaId: "agenda-v1",
            planId: "plan-0",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            publicBaselinePublicationIds: [],
            openedAt: 0,
            status: "published",
            contributionIds: [],
            invitedContributorIds: [],
            participationResponses: [],
            publicationId: "publication-0"
        }
    ];
    state.managerPlans = [
        {
            id: "plan-0",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            kind: "open_round",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            rationale: "plan",
            createdAt: 0,
            status: "completed"
        }
    ];
    state.publications = [
        {
            id: "publication-0",
            roundId: "round-0",
            seq: 1,
            finalVersionIds: [],
            finalReviewIds: [],
            publishedAt: 0,
            exitReasons: []
        }
    ];
    const opened = openRoundWithPlan(state, {
        roundId: "round-v1",
        agendaId: "agenda-v1",
        managerId: "manager-v1",
        now: 1
    });
    expect(opened.kind).toBe("accepted");
    if (opened.kind !== "accepted") {
        throw new Error("round did not open");
    }
    return opened.state;
}

describe("hand raise", () => {
    it("raises a hand and emits an initial hand request", () => {
        const result = raiseHand(openState(), {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            purpose: "提交证据",
            now: 2
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") {
            return;
        }
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
        const raised = raiseHand(openState(), {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            purpose: "提交证据",
            now: 2
        });
        expect(raised.kind).toBe("accepted");
        if (raised.kind !== "accepted") {
            return;
        }
        const result = disposeHandRaise(raised.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            managerId: "manager-v1",
            disposition: "accepted",
            reason: "接纳",
            contributionId: "contribution-v1",
            now: 3
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") {
            return;
        }
        expect(result.state.pendingHandRaises).toEqual([]);
        expect(result.state.contributions[0]).toMatchObject({
            id: "contribution-v1",
            roundId: "round-v1",
            contributorId: "contributor-v1",
            status: "preparing",
            acceptedAt: 3
        });
        expect(result.state.rounds.find(({ id }) => id === "round-v1")?.contributionIds).toEqual([
            "contribution-v1"
        ]);
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

    it("rejects an accepted hand when all formal message slots are reserved", () => {
        const raised = raiseHand(
            { ...openState(), limits: { ...openState().limits, maxFormalMessages: 0 } },
            {
                roundId: "round-v1",
                contributorId: "contributor-v1",
                purpose: "提交证据",
                now: 2
            }
        );
        expect(raised.kind).toBe("accepted");
        if (raised.kind !== "accepted") {
            return;
        }
        const result = disposeHandRaise(raised.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            managerId: "manager-v1",
            disposition: "accepted",
            reason: "接纳",
            contributionId: "contribution-v1",
            now: 3
        });
        expect(result.kind).toBe("rejected");
        if (result.kind === "rejected") {
            expect(result.error.code).toBe("LIMIT_EXCEEDED");
        }
        expect(result.state).toBe(raised.state);
    });

    it("rejects one hand while another contributor remains independently eligible", () => {
        const state = openState();
        const first = raiseHand(state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            purpose: "A",
            now: 2
        });
        expect(first.kind).toBe("accepted");
        if (first.kind !== "accepted") {
            return;
        }
        const rejected = disposeHandRaise(first.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            managerId: "manager-v1",
            disposition: "rejected",
            reason: "暂不接纳",
            now: 3
        });
        expect(rejected.kind).toBe("accepted");
        if (rejected.kind !== "accepted") {
            return;
        }
        const second = raiseHand(rejected.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            purpose: "B",
            now: 4
        });
        expect(second.kind).toBe("rejected");
        expect(second.kind === "rejected" && second.error.code).toBe("PRECONDITION_FAILED");
        expect(rejected.state.contributions).toEqual([]);
    });
});
