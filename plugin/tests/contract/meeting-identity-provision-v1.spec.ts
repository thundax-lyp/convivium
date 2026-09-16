import { describe, expect, it } from "vitest";
import { deliverIdentityProvisionV1 } from "@/runtime/services/meeting-identity-provision-v1.js";
describe("identity provision delivery", () => {
    it("does not mark an effect delivered before a result commit", async () => {
        let delivered = false;
        const deps = {
            repository: {
                read: async () => ({
                    meetingId: "meeting-1",
                    teamId: "team-1",
                    version: 1,
                    createdAt: 0,
                    updatedAt: 0,
                    state: { identityRecommendations: [] }
                })
            },
            definitions: [],
            owner: {},
            parent: {},
            markDelivered: async () => {
                delivered = true;
            }
        } as never;
        await expect(
            deliverIdentityProvisionV1(
                {
                    id: "outbox-1",
                    deliveryId: "identity-provision:rec-1",
                    kind: "dispatch",
                    priority: 1,
                    payload: { recommendationId: "rec-1" },
                    attempts: 1,
                    leaseOwner: "worker",
                    leaseToken: "token",
                    leaseDeadline: 2
                },
                deps
            )
        ).rejects.toThrow("INVALID_STATE");
        expect(delivered).toBe(false);
    });
});
