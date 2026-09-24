import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { createMeetingIdentityReader } from "@/runtime/services/meeting-identity-read.js";

const caller = (role: "manager" | "evidence_reviewer" | "participant", identityId: string) => ({
    caller: {
        channel: "dsh_tool" as const,
        principalId: identityId,
        sessionBindingId: `owner:${identityId}`
    },
    meetingId: "meeting-v1",
    identityId,
    role,
    ownership: {
        id: `owner:${identityId}`,
        meetingId: "meeting-v1",
        identityId,
        sessionId: `session:${identityId}`,
        parentSessionId: "captain-1",
        sessionLabel: `meeting:${identityId}`,
        provider: "spawn",
        role,
        lifecycleStatus: "active" as const,
        capabilityStatus: "active" as const,
        createdAt: 1,
        updatedAt: 1
    }
});

describe("Meeting identity read", () => {
    it.each([
        ["manager", "manager-v1", "submit_manager_plan"],
        ["evidence_reviewer", "reviewer-v1", "submit_evidence_review"],
        ["participant", "contributor-v1", "raise_hand"]
    ] as const)(
        "returns the caller-filtered Meeting view for %s",
        async (role, identityId, control) => {
            const state = makeRunningMeetingStateV1();
            state.identities = state.identities.map((identity) => ({
                ...identity,
                sessionOwnershipId: `owner:${identity.id}`
            }));
            const recover = vi.fn(async () => ({
                snapshot: {
                    meetingId: state.id,
                    version: state.version,
                    state,
                    createdAt: 0,
                    updatedAt: 1
                },
                sessionOwnership: []
            }));
            const reader = createMeetingIdentityReader({
                registry: { openMeeting: vi.fn(async () => ({ recover })) }
            });

            const result = await reader.read(
                { protocolVersion: 1, meetingId: state.id },
                caller(role, identityId),
                new AbortController().signal
            );

            expect(result).toMatchObject({
                meetingId: state.id,
                objective: state.objective,
                agenda: state.agenda
            });
            expect(result?.controls).toContain(control);
            expect(result).not.toHaveProperty("state");
        }
    );

    it("fails closed when the resolved identity is absent from the committed Meeting", async () => {
        const state = makeRunningMeetingStateV1();
        state.identities = state.identities.map((identity) => ({
            ...identity,
            sessionOwnershipId: `owner:${identity.id}`
        }));
        const reader = createMeetingIdentityReader({
            registry: {
                openMeeting: vi.fn(async () => ({
                    recover: async () => ({
                        snapshot: {
                            meetingId: state.id,
                            version: state.version,
                            state,
                            createdAt: 0,
                            updatedAt: 1
                        },
                        sessionOwnership: []
                    })
                }))
            }
        });

        await expect(
            reader.read(
                { protocolVersion: 1, meetingId: state.id },
                caller("participant", "identity-missing"),
                new AbortController().signal
            )
        ).resolves.toBeUndefined();
    });

    it("adds the Host catalog only to the Manager projection", async () => {
        const state = makeRunningMeetingStateV1();
        state.identities = state.identities.map((identity) => ({
            ...identity,
            sessionOwnershipId: `owner:${identity.id}`
        }));
        const reader = createMeetingIdentityReader({
            registry: {
                openMeeting: vi.fn(async () => ({
                    recover: async () => ({
                        snapshot: {
                            meetingId: state.id,
                            version: state.version,
                            state,
                            createdAt: 0,
                            updatedAt: 1
                        },
                        sessionOwnership: []
                    })
                }))
            },
            catalog: {
                readSnapshot: vi.fn(async () => ({
                    kind: "available" as const,
                    snapshot: {
                        protocolVersion: 1 as const,
                        meetingId: state.id,
                        catalogId: "catalog-1",
                        catalogVersion: "1",
                        generatedAt: 1,
                        candidates: []
                    }
                }))
            }
        });

        const result = await reader.read(
            { protocolVersion: 1, meetingId: state.id },
            caller("manager", "manager-v1"),
            new AbortController().signal
        );

        expect(result?.managerCatalog).toEqual({
            catalogId: "catalog-1",
            catalogVersion: "1",
            candidates: []
        });
    });
});
