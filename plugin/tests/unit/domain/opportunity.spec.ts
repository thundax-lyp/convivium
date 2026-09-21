import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import {
    disposeEvidenceOpportunity,
    requestEvidenceOpportunityV1
} from "@/domain/transitions/opportunity.js";

describe("evidence opportunity transitions", () => {
    it("queues one opportunity and emits a manager notice", () => {
        const state = makeRunningMeetingStateV1();
        const result = requestEvidenceOpportunityV1(state, {
            requestId: "request-v1",
            agendaId: "agenda-v1",
            contributorId: "contributor-v1",
            purpose: "补充公开证据",
            now: 10
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.opportunityRequests).toEqual([
            {
                id: "request-v1",
                agendaId: "agenda-v1",
                contributorId: "contributor-v1",
                purpose: "补充公开证据",
                requestedAt: 10
            }
        ]);
        expect(result.effectRequests).toEqual([
            {
                kind: "agent_notice",
                noticeKind: "opportunity_request",
                recipientId: "manager-v1",
                agendaId: "agenda-v1",
                requestId: "request-v1"
            }
        ]);
        expect(result.state).not.toBe(state);
        expect(result.state.version).toBe(state.version + 1);
        expect(result.state.updatedAt).toBe(10);
    });

    it("disposes a pending opportunity without creating a round or contribution", () => {
        const state = makeRunningMeetingStateV1();
        const queued = requestEvidenceOpportunityV1(state, {
            requestId: "request-v1",
            agendaId: "agenda-v1",
            contributorId: "contributor-v1",
            purpose: "补充公开证据",
            now: 10
        });
        expect(queued.kind).toBe("accepted");
        if (queued.kind !== "accepted") return;
        const result = disposeEvidenceOpportunity(queued.state, {
            requestId: "request-v1",
            managerId: "manager-v1",
            disposition: "rejected",
            reason: "本轮暂不需要",
            now: 11
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.opportunityRequests).toEqual([]);
        expect(result.state.rounds).toEqual([]);
        expect(result.state.contributions).toEqual([]);
        expect(result.effectRequests).toEqual([
            {
                kind: "agent_notice",
                noticeKind: "opportunity_disposition",
                recipientId: "contributor-v1",
                agendaId: "agenda-v1",
                requestId: "request-v1",
                disposition: "rejected",
                reason: "本轮暂不需要"
            }
        ]);
    });

    it.each([
        [
            "duplicate pending",
            "PRECONDITION_FAILED",
            (state: ReturnType<typeof makeRunningMeetingStateV1>) => ({
                ...state,
                opportunityRequests: [
                    {
                        id: "request-old",
                        agendaId: "agenda-v1",
                        contributorId: "contributor-v1",
                        purpose: "x",
                        requestedAt: 1
                    }
                ]
            })
        ],
        [
            "wrong contributor",
            "UNAUTHORIZED",
            (state: ReturnType<typeof makeRunningMeetingStateV1>) => ({
                ...state,
                identities: state.identities.map((identity) =>
                    identity.id === "contributor-v1"
                        ? { ...identity, roles: ["manager"] as const }
                        : identity
                )
            })
        ]
    ])("rejects %s atomically", (_label, expectedCode, makeState) => {
        const state = makeState(makeRunningMeetingStateV1());
        const result = requestEvidenceOpportunityV1(state, {
            requestId: "request-v1",
            agendaId: "agenda-v1",
            contributorId: "contributor-v1",
            purpose: "x",
            now: 10
        });
        expect(result.kind).toBe("rejected");
        expect(result.kind === "rejected" && result.error.code).toBe(expectedCode);
        expect(result.kind === "rejected" && result.state).toBe(state);
    });

    it("rejects disposal by a non-manager and leaves the request intact", () => {
        const state = makeRunningMeetingStateV1();
        const pendingState = {
            ...state,
            opportunityRequests: [
                {
                    id: "request-v1",
                    agendaId: "agenda-v1",
                    contributorId: "contributor-v1",
                    purpose: "x",
                    requestedAt: 1
                }
            ]
        };
        const result = disposeEvidenceOpportunity(pendingState, {
            requestId: "request-v1",
            managerId: "contributor-v1",
            disposition: "deferred",
            reason: "x",
            now: 2
        });
        expect(result.kind).toBe("rejected");
        expect(result.kind === "rejected" && result.error.code).toBe("UNAUTHORIZED");
        expect(result.kind === "rejected" && result.state).toBe(pendingState);
    });
});
