import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { requestEvidenceOpportunity } from "@/domain/transitions/opportunity.js";
import {
    abortRound,
    isRoundClosable,
    openRound as openRoundTransition
} from "@/domain/transitions/round.js";

type OpenRoundFixtureInput = Omit<Parameters<typeof openRoundTransition>[1], "planId">;

const openRoundWithPlan = (
    state: Parameters<typeof openRoundTransition>[0],
    input: OpenRoundFixtureInput
) => {
    if (state.managerPlans.some((plan) => plan.id === "plan-v1"))
        return openRoundTransition(state, { ...input, planId: "plan-v1" });
    return openRoundTransition(
        {
            ...state,
            managerPlans: [
                ...state.managerPlans,
                {
                    id: "plan-v1",
                    agendaId: input.agendaId,
                    managerId: input.managerId,
                    kind: "open_round",
                    roundGoal: {
                        question: "q",
                        evidenceGap: "gap",
                        expectedOutput: "output"
                    },
                    rationale: "plan",
                    createdAt: 0,
                    status: "active"
                }
            ]
        },
        { ...input, planId: "plan-v1" }
    );
};

describe("round transitions", () => {
    it("opens with all current publications as baseline and transfers queued requests to hands", () => {
        const state = {
            ...makeRunningMeetingStateV1(),
            publications: [
                {
                    id: "publication-1",
                    roundId: "old-round",
                    seq: 1,
                    finalVersionIds: [],
                    finalReviewIds: [],
                    publishedAt: 1,
                    exitReasons: []
                }
            ]
        };
        const queued = requestEvidenceOpportunity(state, {
            requestId: "request-v1",
            agendaId: "agenda-v1",
            contributorId: "contributor-v1",
            purpose: "补充证据",
            now: 10
        });
        expect(queued.kind).toBe("accepted");
        if (queued.kind !== "accepted") return;
        const result = openRoundWithPlan(queued.state, {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 20,
            deadlineAt: 100
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.rounds).toEqual([
            {
                id: "round-v1",
                agendaId: "agenda-v1",
                planId: "plan-v1",
                roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
                publicBaselinePublicationIds: ["publication-1"],
                openedAt: 20,
                status: "open",
                contributionIds: [],
                deadlineAt: 100
            }
        ]);
        expect(result.state.opportunityRequests).toEqual([]);
        expect(result.state.pendingHandRaises).toEqual([
            {
                roundId: "round-v1",
                contributorId: "contributor-v1",
                purpose: "补充证据",
                raisedAt: 10
            }
        ]);
    });

    it("rejects a second open round and an invalid deadline atomically", () => {
        const state = makeRunningMeetingStateV1();
        const opened = openRoundWithPlan(state, {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 10
        });
        expect(opened.kind).toBe("accepted");
        if (opened.kind !== "accepted") return;
        const duplicate = openRoundWithPlan(opened.state, {
            roundId: "round-v2",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 11
        });
        expect(duplicate.kind).toBe("rejected");
        expect(duplicate.kind === "rejected" && duplicate.error.code).toBe("PRECONDITION_FAILED");
        expect(duplicate.kind === "rejected" && duplicate.state).toBe(opened.state);
        const invalidDeadline = openRoundWithPlan(state, {
            roundId: "round-v3",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 10,
            deadlineAt: 10
        });
        expect(invalidDeadline.kind).toBe("rejected");
        expect(invalidDeadline.kind === "rejected" && invalidDeadline.error.code).toBe(
            "PRECONDITION_FAILED"
        );
    });

    it("treats an empty open round as closable and pending hands as blocking", () => {
        const state = makeRunningMeetingStateV1();
        const opened = openRoundWithPlan(state, {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 10
        });
        expect(opened.kind).toBe("accepted");
        if (opened.kind !== "accepted") return;
        expect(isRoundClosable(opened.state, "round-v1")).toBe(true);
        const blocked = {
            ...opened.state,
            pendingHandRaises: [
                { roundId: "round-v1", contributorId: "contributor-v1", purpose: "x", raisedAt: 10 }
            ]
        };
        expect(isRoundClosable(blocked, "round-v1")).toBe(false);
        expect(isRoundClosable(opened.state, "missing")).toBe(false);
    });

    it("aborts an open round and closes unfinished contributions without publishing", () => {
        const opened = openRoundWithPlan(makeRunningMeetingStateV1(), {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 1
        });
        expect(opened.kind).toBe("accepted");
        if (opened.kind !== "accepted") return;
        const state = {
            ...opened.state,
            rounds: [{ ...opened.state.rounds[0], contributionIds: ["contribution-v1"] }],
            contributions: [
                {
                    id: "contribution-v1",
                    roundId: "round-v1",
                    contributorId: "contributor-v1",
                    handRaise: { purpose: "x", raisedAt: 1 },
                    acceptedAt: 2,
                    status: "preparing" as const,
                    substantiveSupplementCount: 0
                }
            ],
            pendingHandRaises: [
                { roundId: "round-v1", contributorId: "contributor-v1", purpose: "x", raisedAt: 1 }
            ]
        };
        const result = abortRound(state, {
            roundId: "round-v1",
            actor: { kind: "local_controller", id: "local-v1" },
            reason: "无法继续",
            now: 3
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.rounds[0]).toMatchObject({
            status: "aborted",
            abortReason: "无法继续",
            abortedAt: 3
        });
        expect(result.state.contributions[0]).toMatchObject({
            status: "aborted",
            exitReason: "无法继续"
        });
        expect(result.state.pendingHandRaises).toEqual([]);
        expect(result.state.publications).toEqual([]);
    });
});
