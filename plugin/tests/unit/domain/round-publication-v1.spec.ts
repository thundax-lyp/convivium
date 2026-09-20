import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { openRoundV1 } from "@/domain/transitions/round.js";
import { publishRoundV1 } from "@/domain/transitions/round-publication-v1.js";

describe("round publication", () => {
    it("publishes an empty closable round once", () => {
        const opened = openRoundV1(makeRunningMeetingStateV1(), {
            roundId: "round-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            now: 1
        });
        if (opened.kind !== "accepted") throw new Error("round");
        const result = publishRoundV1(opened.state, {
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
        const duplicate = publishRoundV1(result.state, {
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
        const opened = openRoundV1(
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
        const result = publishRoundV1(
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
        const opened = openRoundV1(
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
        const result = publishRoundV1(
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
