import { describe, expect, it, vi } from "vitest";
import { createMeetingIdentityEffectHandlerV1 } from "@/runtime/application-service/meeting-identity-v1.js";

const effect = (payload: Record<string, unknown>) => ({
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

describe("identity provision effect handler", () => {
    it("uses the committed admission id and commits through the command application", async () => {
        const execute = vi.fn(async () => ({ kind: "accepted" as const }));
        const provision = vi.fn(async () => ({
            kind: "admitted" as const,
            result: {
                kind: "admitted" as const,
                admissionId: "rec-1",
                meetingId: "meeting-1",
                identityId: "identity-1",
                childSessionId: "child-1",
                ownershipId: "owner-1",
                descriptorId: "descriptor:rec-1",
                displayName: "Architect",
                definitionId: "domain_architect",
                definitionVersion: "1",
                definitionHash: "a".repeat(64)
            }
        }));
        const handler = createMeetingIdentityEffectHandlerV1({
            application: { execute } as never,
            repository: {
                read: async () => ({
                    meetingId: "meeting-1",
                    version: 4,
                    state: {
                        identityRecommendations: [
                            {
                                id: "rec-1",
                                decision: "admit",
                                status: "provisioning",
                                definitionId: "domain_architect",
                                definitionVersion: "1",
                                definitionHash: "a".repeat(64),
                                identityId: "identity-1",
                                childSessionId: "child-1"
                            }
                        ]
                    }
                })
            } as never,
            definitions: [],
            provision
        });
        await handler.dispatch(
            effect({
                kind: "identity_provision",
                recommendationId: "rec-1",
                admissionId: "rec-1"
            }) as never,
            new AbortController().signal
        );
        expect(provision).toHaveBeenCalledWith(expect.objectContaining({ meetingId: "meeting-1" }));
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({ requestId: "identity-admission:effect-1" }),
            expect.objectContaining({
                identityAdmissionResult: expect.objectContaining({ kind: "admitted" })
            }),
            expect.anything()
        );
    });
    it("rejects an effect whose recommendation and admission ids differ", async () => {
        const handler = createMeetingIdentityEffectHandlerV1({
            application: { execute: vi.fn() } as never,
            repository: { read: vi.fn() } as never,
            definitions: [],
            provision: vi.fn() as never
        });
        await expect(
            handler.dispatch(
                effect({
                    kind: "identity_provision",
                    recommendationId: "rec-1",
                    admissionId: "rec-2"
                }) as never,
                new AbortController().signal
            )
        ).rejects.toThrow("INVALID_ARGUMENT");
    });
});
