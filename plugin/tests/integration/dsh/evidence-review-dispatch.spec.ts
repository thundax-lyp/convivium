import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { createReviewDeliveryDispatcherV1 } from "@/runtime/services/evidence-review-dispatch.js";

const item = {
    id: "effect-delivery-1",
    deliveryId: "effect-delivery-1",
    kind: "dispatch" as const,
    priority: 1,
    payload: { kind: "review_delivery", reviewId: "review-1", authorId: "contributor-v1" },
    attempts: 2,
    leaseOwner: "worker",
    leaseToken: "token",
    leaseDeadline: 2
};

function reviewedState() {
    const state = makeRunningMeetingStateV1();
    state.version = 8;
    state.identities = state.identities.map((identity) => ({
        ...identity,
        sessionOwnershipId: `owner:${identity.id}`
    }));
    state.evidencePackages = [
        {
            id: "package-1",
            roundId: "round-1",
            contributionId: "contribution-1",
            authorId: "contributor-v1",
            agendaId: "agenda-v1",
            currentVersionId: "version-1",
            versions: [
                {
                    id: "version-1",
                    ordinal: 1,
                    observation: "observation",
                    interpretation: "interpretation",
                    method: "method",
                    falsifiers: [{ value: "f", reason: "r" }],
                    uncertainties: [{ value: "u", reason: "r" }],
                    limitations: [{ value: "l", reason: "r" }],
                    claims: [],
                    materials: [],
                    submittedAt: 1
                }
            ]
        }
    ];
    const dimension = {
        score: 2 as const,
        scope: "scope",
        reason: "reason",
        baselineEvidenceIds: []
    };
    state.reviews = [
        {
            id: "review-1",
            versionId: "version-1",
            reviewerId: "reviewer-v1",
            baselinePublicationIds: [],
            scope: "scope",
            dimensions: {
                source: dimension,
                credibility: dimension,
                completeness: dimension,
                support: dimension
            },
            createdAt: 2
        }
    ];
    const ownership = [
        {
            id: "owner:contributor-v1",
            meetingId: state.id,
            identityId: "contributor-v1",
            sessionId: "session:contributor-v1",
            parentSessionId: "captain-1",
            sessionLabel: "convivium:meeting-identity:participant:meeting-v1:contributor-v1",
            provider: "spawn",
            role: "participant" as const,
            lifecycleStatus: "active" as const,
            capabilityStatus: "active" as const,
            createdAt: 1,
            updatedAt: 1
        }
    ];
    return { state, ownership };
}

describe("review delivery dispatcher v1", () => {
    it("sends only to the author and records sent through the command application", async () => {
        const { state, ownership } = reviewedState();
        const sendMessage = vi.fn().mockResolvedValue("message-1");
        const execute = vi.fn().mockResolvedValue({ kind: "accepted" });
        const dispatcher = createReviewDeliveryDispatcherV1({
            sessions: { sendMessage },
            application: { execute } as never,
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: state.version,
                        state,
                        createdAt: 0,
                        updatedAt: 2
                    },
                    sessionOwnership: ownership
                })
            } as never
        });

        await dispatcher.dispatch({
            outboxItem: item,
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        });

        expect(sendMessage.mock.calls[0]?.[1]).toBe("session:contributor-v1");
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: "review-delivery:effect-delivery-1:2:sent",
                expectedMeetingVersion: 8,
                action: { kind: "record_review_delivery", reviewId: "review-1", status: "sent" }
            }),
            {
                caller: { channel: "runtime_recovery", principalId: "runtime-recovery" }
            },
            expect.any(AbortSignal)
        );
    });

    it("re-reads and retries a sent record after a concurrent Meeting version change", async () => {
        const { state, ownership } = reviewedState();
        const recover = vi
            .fn()
            .mockResolvedValueOnce({
                snapshot: { meetingId: state.id, version: 8, state, createdAt: 0, updatedAt: 2 },
                sessionOwnership: ownership
            })
            .mockResolvedValueOnce({
                snapshot: { meetingId: state.id, version: 8, state, createdAt: 0, updatedAt: 2 },
                sessionOwnership: ownership
            })
            .mockResolvedValue({
                snapshot: { meetingId: state.id, version: 9, state, createdAt: 0, updatedAt: 3 },
                sessionOwnership: ownership
            });
        const execute = vi
            .fn()
            .mockResolvedValueOnce({
                kind: "rejected",
                error: { code: "VERSION_CONFLICT", message: "retry" }
            })
            .mockResolvedValueOnce({ kind: "accepted" });
        const dispatcher = createReviewDeliveryDispatcherV1({
            sessions: { sendMessage: vi.fn().mockResolvedValue("message-1") },
            application: { execute } as never,
            repository: { recover } as never
        });

        await dispatcher.dispatch({
            outboxItem: item,
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        });

        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute.mock.calls.map(([command]) => command.expectedMeetingVersion)).toEqual([
            8, 9
        ]);
    });

    it("records a safe failed attempt and retries when inbox delivery fails", async () => {
        const { state, ownership } = reviewedState();
        const execute = vi.fn().mockResolvedValue({ kind: "accepted" });
        const dispatcher = createReviewDeliveryDispatcherV1({
            sessions: { sendMessage: vi.fn().mockRejectedValue(new Error("secret transport")) },
            application: { execute } as never,
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: state.version,
                        state,
                        createdAt: 0,
                        updatedAt: 2
                    },
                    sessionOwnership: ownership
                })
            } as never
        });
        await expect(
            dispatcher.dispatch({
                outboxItem: item,
                parent: { id: "captain-1" } as never,
                signal: new AbortController().signal
            })
        ).rejects.toMatchObject({ code: "REVIEW_DELIVERY_FAILED", retryable: true });
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: "review-delivery:effect-delivery-1:2:failed",
                action: {
                    kind: "record_review_delivery",
                    reviewId: "review-1",
                    status: "failed",
                    failureReason: "REVIEW_DELIVERY_FAILED"
                }
            }),
            expect.anything(),
            expect.anything()
        );
        expect(JSON.stringify(execute.mock.calls)).not.toContain("secret transport");
    });

    it("treats an existing sent delivery as delivered without sending again", async () => {
        const { state, ownership } = reviewedState();
        state.reviewDeliveries = [
            {
                id: "delivery-1",
                reviewId: "review-1",
                authorId: "contributor-v1",
                status: "sent",
                sentAt: 3
            }
        ];
        const sendMessage = vi.fn();
        const execute = vi.fn();
        const dispatcher = createReviewDeliveryDispatcherV1({
            sessions: { sendMessage },
            application: { execute } as never,
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: 9,
                        state,
                        createdAt: 0,
                        updatedAt: 3
                    },
                    sessionOwnership: ownership
                })
            } as never
        });
        await dispatcher.dispatch({
            outboxItem: item,
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        });
        expect(sendMessage).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });
});
