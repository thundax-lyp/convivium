import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { createMeetingNoticeDispatcherV1 } from "@/runtime/services/meeting-notice-dispatch.js";

const item = (payload: Record<string, unknown>) => ({
    id: "effect-1",
    deliveryId: "effect-1",
    kind: "dispatch" as const,
    priority: 1,
    payload,
    attempts: 1,
    leaseOwner: "worker",
    leaseToken: "token",
    leaseDeadline: 2
});

function fixture() {
    const state = makeRunningMeetingStateV1();
    state.identities = state.identities.map((identity) => ({
        ...identity,
        sessionOwnershipId: `owner:${identity.id}`
    }));
    const ownership = state.identities.map((identity) => {
        const role = identity.roles[0] === "contributor" ? "participant" : identity.roles[0];
        return {
            id: `owner:${identity.id}`,
            meetingId: state.id,
            identityId: identity.id,
            sessionId: `session:${identity.id}`,
            parentSessionId: "captain-1",
            sessionLabel: `convivium:meeting-identity:${role}:${state.id}:${identity.id}`,
            provider: "spawn",
            role,
            lifecycleStatus: "active",
            capabilityStatus: "active",
            createdAt: 1,
            updatedAt: 1
        };
    });
    return { state, ownership };
}

describe("meeting notice dispatcher v1", () => {
    it("delivers meeting_started only to the matching active owned contributor", async () => {
        const { state, ownership } = fixture();
        const sendMessage = vi.fn().mockResolvedValue("message-1");
        const dispatcher = createMeetingNoticeDispatcherV1({
            sessions: { sendMessage },
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: state.version,
                        state,
                        createdAt: 0,
                        updatedAt: 0
                    },
                    sessionOwnership: ownership
                })
            } as never
        });

        await dispatcher.dispatch({
            outboxItem: item({
                kind: "agent_notice",
                noticeKind: "meeting_started",
                recipientId: "contributor-v1",
                agendaId: "agenda-v1"
            }),
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        });

        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage.mock.calls[0]?.[1]).toBe("session:contributor-v1");
        const prompt = sendMessage.mock.calls[0]?.[2] as Array<{ type: string; text: string }>;
        expect(JSON.parse(prompt[0]!.text)).toEqual({
            effectId: "effect-1",
            meetingId: "meeting-v1",
            noticeKind: "meeting_started",
            agendaId: "agenda-v1"
        });
    });

    it("accepts a committed disposition after its pending source was removed", async () => {
        const { state, ownership } = fixture();
        const sendMessage = vi.fn().mockResolvedValue("message-2");
        const dispatcher = createMeetingNoticeDispatcherV1({
            sessions: { sendMessage },
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: 2,
                        state,
                        createdAt: 0,
                        updatedAt: 1
                    },
                    sessionOwnership: ownership
                })
            } as never
        });

        await dispatcher.dispatch({
            outboxItem: item({
                kind: "agent_notice",
                noticeKind: "opportunity_disposition",
                recipientId: "contributor-v1",
                agendaId: "agenda-v1",
                requestId: "request-1",
                disposition: "rejected",
                reason: "Out of scope"
            }),
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        });

        expect(sendMessage).toHaveBeenCalledOnce();
    });

    it("validates and delivers the remaining committed notice shapes", async () => {
        const { state, ownership } = fixture();
        state.opportunityRequests = [
            {
                id: "request-1",
                agendaId: "agenda-v1",
                contributorId: "contributor-v1",
                purpose: "Need evidence",
                requestedAt: 1
            }
        ];
        state.rounds = [
            {
                id: "round-1",
                agendaId: "agenda-v1",
                publicBaselinePublicationIds: [],
                openedAt: 1,
                status: "open",
                contributionIds: ["contribution-1"]
            }
        ];
        state.pendingHandRaises = [
            {
                roundId: "round-1",
                contributorId: "contributor-v1",
                purpose: "Contribute",
                raisedAt: 1
            }
        ];
        state.contributions = [
            {
                id: "contribution-1",
                roundId: "round-1",
                contributorId: "contributor-v1",
                handRaise: { raisedAt: 1, purpose: "Contribute" },
                acceptedAt: 2,
                status: "preparing",
                substantiveSupplementCount: 0
            }
        ];
        state.messages = [
            {
                id: "message-1",
                seq: 1,
                actorId: "contributor-v1",
                agendaId: "agenda-v1",
                kind: "evidence",
                body: "Published",
                publicationId: "publication-1",
                relatedIds: [],
                createdAt: 3
            }
        ];
        const sendMessage = vi.fn().mockResolvedValue("accepted");
        const dispatcher = createMeetingNoticeDispatcherV1({
            sessions: { sendMessage },
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: 3,
                        state,
                        createdAt: 0,
                        updatedAt: 3
                    },
                    sessionOwnership: ownership
                })
            } as never
        });
        const notices = [
            {
                noticeKind: "opportunity_request",
                recipientId: "manager-v1",
                requestId: "request-1"
            },
            {
                noticeKind: "hand_request",
                recipientId: "manager-v1",
                requestKind: "initial",
                roundId: "round-1",
                contributorId: "contributor-v1"
            },
            {
                noticeKind: "hand_disposition",
                recipientId: "contributor-v1",
                requestKind: "initial",
                roundId: "round-1",
                contributorId: "contributor-v1",
                disposition: "accepted",
                reason: "Proceed",
                contributionId: "contribution-1"
            },
            {
                noticeKind: "transcript_update",
                recipientId: "contributor-v1",
                publicMessageId: "message-1"
            }
        ];
        for (const notice of notices) {
            await dispatcher.dispatch({
                outboxItem: item({ kind: "agent_notice", agendaId: "agenda-v1", ...notice }),
                parent: { id: "captain-1" } as never,
                signal: new AbortController().signal
            });
        }
        expect(sendMessage).toHaveBeenCalledTimes(4);
    });

    it.each([
        ["closed ownership", { lifecycleStatus: "closed" }],
        ["revoked capability", { capabilityStatus: "revoked" }],
        ["cross-meeting ownership", { meetingId: "meeting-other" }],
        ["cross-identity ownership", { identityId: "other" }]
    ])("rejects %s", async (_name, override) => {
        const { state, ownership } = fixture();
        const changed = ownership.map((candidate) =>
            candidate.identityId === "contributor-v1" ? { ...candidate, ...override } : candidate
        );
        const dispatcher = createMeetingNoticeDispatcherV1({
            sessions: { sendMessage: vi.fn() },
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: 1,
                        state,
                        createdAt: 0,
                        updatedAt: 0
                    },
                    sessionOwnership: changed
                })
            } as never
        });
        await expect(
            dispatcher.dispatch({
                outboxItem: item({
                    kind: "agent_notice",
                    noticeKind: "meeting_started",
                    recipientId: "contributor-v1",
                    agendaId: "agenda-v1"
                }),
                parent: { id: "captain-1" } as never,
                signal: new AbortController().signal
            })
        ).rejects.toThrow("NOTICE_OWNERSHIP_INVALID");
    });

    it("fails closed for review_request and unknown notice kinds", async () => {
        const { state, ownership } = fixture();
        const dispatcher = createMeetingNoticeDispatcherV1({
            sessions: { sendMessage: vi.fn() },
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: 1,
                        state,
                        createdAt: 0,
                        updatedAt: 0
                    },
                    sessionOwnership: ownership
                })
            } as never
        });
        for (const noticeKind of ["review_request", "unknown"]) {
            await expect(
                dispatcher.dispatch({
                    outboxItem: item({
                        kind: "agent_notice",
                        noticeKind,
                        recipientId: "reviewer-v1",
                        agendaId: "agenda-v1"
                    }),
                    parent: { id: "captain-1" } as never,
                    signal: new AbortController().signal
                })
            ).rejects.toMatchObject({ code: "OUTBOX_ROUTE_UNAVAILABLE", retryable: false });
        }
    });
});
