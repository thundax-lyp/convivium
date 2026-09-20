import { describe, expect, it, vi } from "vitest";
import { createMeetingIdentityEffectHandlerV1 } from "@/runtime/application-service/meeting-identity-v1.js";
import { provisionMeetingIdentityV1 } from "@/runtime/services/meeting-identity-provision-v1.js";
import { resolveMeetingRoles } from "@/role-composition/resolve.js";

const dynamicDefinition = {
    agentDefinitionId: "architect-definition",
    definitionVersion: "1",
    roleDefinitionId: "domain_architect" as const,
    displayName: "Architect",
    summary: "Architecture",
    roleDescription: "Architecture persona",
    dshPresetId: "minimal",
    requiredSkillNames: ["architecture-skill"],
    toolFilter: { deny: ["unsafe-tool"] },
    expertiseTags: ["architecture"],
    evidenceScopes: ["repository" as const]
};

async function dynamicRecommendation() {
    const roles = await resolveMeetingRoles(
        {
            definitions: [dynamicDefinition],
            participants: [
                { participantKey: "identity-1", agentDefinitionId: "architect-definition" }
            ]
        },
        async () => undefined
    );
    return {
        id: "rec-1",
        definitionId: "architect-definition",
        definitionVersion: "1",
        definitionHash: roles.participants["identity-1"]!.agentDefinition.definitionHash,
        identityId: "identity-1",
        childSessionId: "child-1"
    };
}

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

    it("keeps a recovery-unavailable admission effect retryable without committing failure", async () => {
        const execute = vi.fn();
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
            provision: vi.fn(async () => ({
                kind: "rejected" as const,
                failureCode: "RECOVERY_UNAVAILABLE"
            }))
        });

        await expect(
            handler.dispatch(
                effect({
                    kind: "identity_provision",
                    recommendationId: "rec-1",
                    admissionId: "rec-1"
                }) as never,
                new AbortController().signal
            )
        ).rejects.toMatchObject({ code: "RECOVERY_UNAVAILABLE", retryable: true });
        expect(execute).not.toHaveBeenCalled();
    });
});

describe("dynamic identity provisioning", () => {
    function dependencies(skillAvailable: boolean) {
        const startContinuable = vi.fn(async (input) => ({
            childId: input.childId,
            messageId: "message-1"
        }));
        const putProvisioning = vi.fn(async (owner) => ({ kind: "created" as const, owner }));
        const parent = {
            id: "captain-1",
            session: { header: { cwd: "/fixture" } },
            ctx: {
                get: (key: string) =>
                    key === "agentPresets"
                        ? { composedPreset: () => "minimal" }
                        : {
                              get: async () =>
                                  skillAvailable
                                      ? {
                                            content: "architecture instructions",
                                            invocation: { modelInvocable: true }
                                        }
                                      : undefined
                          }
            }
        };
        return {
            startContinuable,
            putProvisioning,
            value: {
                definitions: [dynamicDefinition],
                parent,
                runtime: { startContinuable },
                provider: "fixture",
                owner: {
                    readOwnership: async () => undefined,
                    putProvisioning,
                    inspectOwnedChild: async () => "absent" as const,
                    markActive: async (owner) => ({ ...owner, lifecycleStatus: "active" as const }),
                    revokeAndDrainOwned: vi.fn()
                },
                now: () => 1
            }
        };
    }

    it("fails before ownership or Session creation when a required Skill is unavailable", async () => {
        const fixture = dependencies(false);
        const result = await provisionMeetingIdentityV1(
            {
                recommendation: await dynamicRecommendation(),
                meetingId: "meeting-1",
                signal: new AbortController().signal
            },
            fixture.value as never
        );

        expect(result).toEqual({ kind: "rejected", failureCode: "CAPABILITY_MISSING" });
        expect(fixture.putProvisioning).not.toHaveBeenCalled();
        expect(fixture.startContinuable).not.toHaveBeenCalled();
    });

    it("starts the Session with the preflighted Definition composition", async () => {
        const fixture = dependencies(true);
        const result = await provisionMeetingIdentityV1(
            {
                recommendation: await dynamicRecommendation(),
                meetingId: "meeting-1",
                signal: new AbortController().signal
            },
            fixture.value as never
        );

        expect(result.kind).toBe("admitted");
        expect(fixture.startContinuable).toHaveBeenCalledWith(
            expect.objectContaining({
                request: expect.objectContaining({
                    persona: expect.stringContaining("Architecture persona"),
                    toolFilter: { deny: ["unsafe-tool"] }
                })
            })
        );
    });
});
