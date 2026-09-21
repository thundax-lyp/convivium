import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { openRound as openRoundTransition } from "@/domain/transitions/round.js";

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
import { publishRound } from "@/domain/transitions/round-publication.js";

describe("round publication", () => {
    it("publishes an empty closable round once", () => {
        const opened = openRoundWithPlan(makeRunningMeetingStateV1(), {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 1
        });
        if (opened.kind !== "accepted") throw new Error("round");
        const result = publishRound(opened.state, {
            roundId: "round-v1",
            managerId: "manager-v1",
            publicationId: "publication-v1",
            messageIds: [],
            now: 2
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.publications).toHaveLength(1);
        expect(result.state.rounds[0]).toMatchObject({
            status: "published",
            publicationId: "publication-v1"
        });
        const duplicate = publishRound(result.state, {
            roundId: "round-v1",
            managerId: "manager-v1",
            publicationId: "publication-v2",
            messageIds: [],
            now: 3
        });
        expect(duplicate.kind).toBe("rejected");
        expect(duplicate.kind === "rejected" && duplicate.error.code).toBe("ROUND_NOT_CLOSABLE");
    });

    it("pauses when publication exactly exhausts the budget before completion", () => {
        const state = makeRunningMeetingStateV1();
        const opened = openRoundWithPlan(
            { ...state, limits: { ...state.limits, maxFormalMessages: 1 } },
            {
                roundId: "round-v1",
                agendaId: "agenda-v1",
                managerId: "manager-v1",
                now: 1
            }
        );
        expect(opened.kind).toBe("accepted");
        if (opened.kind !== "accepted") return;
        const result = publishRound(
            {
                ...opened.state,
                messages: [
                    {
                        id: "message-existing",
                        seq: 1,
                        actorId: "manager-v1",
                        agendaId: "agenda-v1",
                        kind: "manager_summary",
                        body: "existing",
                        publicationId: "publication-existing",
                        relatedIds: [],
                        createdAt: 1
                    }
                ]
            },
            {
                roundId: "round-v1",
                managerId: "manager-v1",
                publicationId: "publication-v1",
                messageIds: [],
                now: 2
            }
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.lifecycle).toMatchObject({
            status: "paused",
            reason: "message budget exhausted"
        });
    });

    it("converges when publication exactly exhausts the budget after completion", () => {
        const state = makeRunningMeetingStateV1();
        const opened = openRoundWithPlan(
            {
                ...state,
                objective: {
                    ...state.objective,
                    requiredOutputs: [],
                    acceptanceCriteria: [],
                    hardConstraints: []
                },
                limits: { ...state.limits, maxFormalMessages: 1 }
            },
            {
                roundId: "round-v1",
                agendaId: "agenda-v1",
                managerId: "manager-v1",
                now: 1
            }
        );
        expect(opened.kind).toBe("accepted");
        if (opened.kind !== "accepted") return;
        const result = publishRound(
            {
                ...opened.state,
                messages: [
                    {
                        id: "message-existing",
                        seq: 1,
                        actorId: "manager-v1",
                        agendaId: "agenda-v1",
                        kind: "manager_summary",
                        body: "existing",
                        publicationId: "publication-existing",
                        relatedIds: [],
                        createdAt: 1
                    }
                ]
            },
            {
                roundId: "round-v1",
                managerId: "manager-v1",
                publicationId: "publication-v1",
                messageIds: [],
                now: 2
            }
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.lifecycle.status).toBe("converging");
    });
});
