import { captainActorIdFor } from "@/domain/control-actor.js";
import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { requestEvidenceOpportunity } from "@/domain/transitions/opportunity.js";
import {
    abortRound,
    isRoundClosable,
    openRound as openRoundTransition,
    respondRoundParticipation
} from "@/domain/transitions/round.js";
import { raiseHand } from "@/domain/transitions/hand-raise.js";

type OpenRoundFixtureInput = Omit<Parameters<typeof openRoundTransition>[1], "planId">;

const openRoundWithPlan = (
    state: Parameters<typeof openRoundTransition>[0],
    input: OpenRoundFixtureInput
) => {
    if (state.managerPlans.some((plan) => plan.id === "plan-v1")) {
        return openRoundTransition(state, { ...input, planId: "plan-v1" });
    }
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
        const initial = makeRunningMeetingStateV1();
        const state = {
            ...initial,
            identities: [
                ...initial.identities,
                {
                    id: "contributor-other",
                    displayName: "Other agenda contributor",
                    roles: ["contributor" as const],
                    agendaResponsibilityIds: ["agenda-other"],
                    riskAuthority: false,
                    required: false
                }
            ],
            agenda: [
                ...initial.agenda,
                {
                    id: "agenda-other",
                    title: "Other agenda",
                    question: "Other question",
                    status: "pending" as const,
                    requiredOutputIds: ["output-v1"]
                }
            ],
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
        if (queued.kind !== "accepted") {
            return;
        }
        const result = openRoundWithPlan(queued.state, {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 20,
            deadlineAt: 100
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") {
            return;
        }
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
                invitedContributorIds: ["contributor-v1"],
                participationResponses: [
                    { contributorId: "contributor-v1", status: "raised", recordedAt: 20 }
                ],
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
        expect(result.effectRequests).toEqual([
            {
                kind: "agent_notice",
                noticeKind: "round_opened",
                recipientId: "contributor-v1",
                agendaId: "agenda-v1",
                roundId: "round-v1"
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
        if (opened.kind !== "accepted") {
            return;
        }
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

    it("waits for invited contributors to choose before closing an empty round", () => {
        const state = makeRunningMeetingStateV1();
        const opened = openRoundWithPlan(state, {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 10
        });
        expect(opened.kind).toBe("accepted");
        if (opened.kind !== "accepted") {
            return;
        }
        expect(opened.state.rounds[0]).toMatchObject({
            invitedContributorIds: ["contributor-v1"],
            participationResponses: []
        });
        expect(isRoundClosable(opened.state, "round-v1")).toBe(false);
        const blocked = {
            ...opened.state,
            pendingHandRaises: [
                { roundId: "round-v1", contributorId: "contributor-v1", purpose: "x", raisedAt: 10 }
            ]
        };
        expect(isRoundClosable(blocked, "round-v1")).toBe(false);
        expect(isRoundClosable(opened.state, "missing")).toBe(false);
    });

    it("records an explicit decline and closes an empty round without claiming a contribution", () => {
        const opened = openRoundWithPlan(makeRunningMeetingStateV1(), {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 10
        });
        if (opened.kind !== "accepted") {
            throw new Error("round");
        }
        const declined = respondRoundParticipation(opened.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            status: "declined",
            now: 11
        });
        expect(declined.kind).toBe("accepted");
        if (declined.kind !== "accepted") {
            return;
        }
        expect(declined.state.rounds[0]?.participationResponses).toEqual([
            { contributorId: "contributor-v1", status: "declined", recordedAt: 11 }
        ]);
        expect(declined.state.contributions).toEqual([]);
        expect(isRoundClosable(declined.state, "round-v1")).toBe(true);
        expect(declined.effectRequests).toMatchObject([{ noticeKind: "round_ready" }]);
        expect(
            raiseHand(declined.state, {
                roundId: "round-v1",
                contributorId: "contributor-v1",
                purpose: "late",
                now: 12
            }).kind
        ).toBe("rejected");
    });

    it("distinguishes silence at the participation deadline from an explicit decline", () => {
        const opened = openRoundWithPlan(makeRunningMeetingStateV1(), {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 10,
            deadlineAt: 20
        });
        if (opened.kind !== "accepted") {
            throw new Error("round");
        }
        const early = respondRoundParticipation(opened.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            status: "no_response",
            now: 19
        });
        expect(early.kind).toBe("rejected");
        const lateDecline = respondRoundParticipation(opened.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            status: "declined",
            now: 20
        });
        expect(lateDecline.kind).toBe("rejected");
        const expired = respondRoundParticipation(opened.state, {
            roundId: "round-v1",
            contributorId: "contributor-v1",
            status: "no_response",
            now: 20
        });
        expect(expired.kind).toBe("accepted");
        if (expired.kind !== "accepted") {
            return;
        }
        expect(expired.state.rounds[0]?.participationResponses?.[0]?.status).toBe("no_response");
        expect(isRoundClosable(expired.state, "round-v1")).toBe(true);
    });

    it("aborts an open round and closes unfinished contributions without publishing", () => {
        const opened = openRoundWithPlan(makeRunningMeetingStateV1(), {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 1
        });
        expect(opened.kind).toBe("accepted");
        if (opened.kind !== "accepted") {
            return;
        }
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
            actor: { kind: "captain_user", id: captainActorIdFor("meeting-v1") },
            reason: "无法继续",
            now: 3
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") {
            return;
        }
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
