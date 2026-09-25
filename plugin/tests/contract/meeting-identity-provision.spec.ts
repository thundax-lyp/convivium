import { describe, expect, it, vi } from "vitest";
import { createMeetingIdentityEffectHandler } from "@/runtime/application-service/meeting-identity.js";
import { provisionMeetingIdentity } from "@/runtime/services/meeting-identity-provision.js";
import { definitionHash } from "@/role-composition/resolve.js";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

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
        const activateProvisioned = vi.fn(async () => {
            expect(execute).toHaveBeenCalledOnce();
        });
        const provision = vi.fn(async () => ({
            kind: "admitted" as const,
            result: {
                kind: "admitted" as const,
                admissionId: "rec-1",
                meetingId: "meeting-1",
                identityId: "identity-1",
                sessionId: "child-1",
                ownershipId: "owner-1",
                descriptorId: "descriptor:rec-1",
                displayName: "Architect",
                definitionId: "domain_architect",
                definitionVersion: "1",
                definitionHash: "a".repeat(64)
            }
        }));
        const handler = createMeetingIdentityEffectHandler({
            application: { execute } as never,
            repository: {
                read: async () => ({
                    meetingId: "meeting-1",
                    version: 4,
                    state: {
                        lifecycle: { status: "running" },
                        identityRecommendations: [
                            {
                                id: "rec-1",
                                decision: "admit",
                                status: "provisioning",
                                definitionId: "domain_architect",
                                definitionVersion: "1",
                                definitionHash: "a".repeat(64),
                                identityId: "identity-1",
                                sessionId: "child-1"
                            }
                        ]
                    }
                })
            } as never,
            definitions: [],
            provision,
            activateProvisioned,
            cleanupProvisioned: vi.fn()
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
        expect(activateProvisioned).toHaveBeenCalledWith("rec-1", expect.any(AbortSignal));
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({ requestId: "identity-admission:effect-1" }),
            expect.objectContaining({
                identityAdmissionResult: expect.objectContaining({ kind: "admitted" })
            }),
            expect.anything()
        );
    });
    it("rejects an effect whose recommendation and admission ids differ", async () => {
        const handler = createMeetingIdentityEffectHandler({
            application: { execute: vi.fn() } as never,
            repository: { read: vi.fn() } as never,
            definitions: [],
            provision: vi.fn() as never,
            activateProvisioned: vi.fn(async () => {}),
            cleanupProvisioned: vi.fn()
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
        const handler = createMeetingIdentityEffectHandler({
            application: { execute } as never,
            repository: {
                read: async () => ({
                    meetingId: "meeting-1",
                    version: 4,
                    state: {
                        lifecycle: { status: "running" },
                        identityRecommendations: [
                            {
                                id: "rec-1",
                                decision: "admit",
                                status: "provisioning",
                                definitionId: "domain_architect",
                                definitionVersion: "1",
                                definitionHash: "a".repeat(64),
                                identityId: "identity-1",
                                sessionId: "child-1"
                            }
                        ]
                    }
                })
            } as never,
            definitions: [],
            provision: vi.fn(async () => ({
                kind: "rejected" as const,
                failureCode: "RECOVERY_UNAVAILABLE"
            })),
            activateProvisioned: vi.fn(async () => {}),
            cleanupProvisioned: vi.fn()
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
        ).rejects.toMatchObject({
            code: "RECOVERY_UNAVAILABLE",
            retryable: true,
            terminalOnAttemptLimit: false
        });
        expect(execute).not.toHaveBeenCalled();
    });
});

describe("identity provision lifecycle races", () => {
    it("does not start provisioning while the Meeting is paused", async () => {
        const provision = vi.fn();
        const handler = createMeetingIdentityEffectHandler({
            application: { execute: vi.fn() } as never,
            repository: {
                read: async () => ({
                    meetingId: "meeting-1",
                    version: 4,
                    state: {
                        lifecycle: { status: "paused" },
                        identityRecommendations: [
                            {
                                id: "rec-1",
                                decision: "admit",
                                status: "provisioning",
                                definitionId: "domain_architect",
                                definitionVersion: "1",
                                definitionHash: "a".repeat(64),
                                identityId: "identity-1",
                                sessionId: "child-1"
                            }
                        ]
                    }
                })
            } as never,
            definitions: [],
            provision,
            activateProvisioned: vi.fn(async () => {}),
            cleanupProvisioned: vi.fn()
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
        ).rejects.toThrow("INVALID_STATE");
        expect(provision).not.toHaveBeenCalled();
    });

    it("cleans a child created concurrently with Meeting termination", async () => {
        const execute = vi.fn();
        const cleanupProvisioned = vi.fn();
        let reads = 0;
        const handler = createMeetingIdentityEffectHandler({
            application: { execute } as never,
            repository: {
                read: async () => {
                    reads += 1;
                    return {
                        meetingId: "meeting-1",
                        version: reads === 1 ? 4 : 5,
                        state: {
                            lifecycle: { status: reads === 1 ? "running" : "terminal" },
                            identityRecommendations: [
                                {
                                    id: "rec-1",
                                    decision: "admit",
                                    status: reads === 1 ? "provisioning" : "failed",
                                    definitionId: "domain_architect",
                                    definitionVersion: "1",
                                    definitionHash: "a".repeat(64),
                                    identityId: "identity-1",
                                    sessionId: "child-1"
                                }
                            ]
                        }
                    };
                }
            } as never,
            definitions: [],
            provision: vi.fn(async () => ({
                kind: "admitted" as const,
                result: {
                    kind: "admitted" as const,
                    admissionId: "rec-1",
                    meetingId: "meeting-1",
                    identityId: "identity-1",
                    sessionId: "child-1",
                    ownershipId: "owner-1",
                    descriptorId: "descriptor:rec-1",
                    displayName: "Architect",
                    definitionId: "domain_architect",
                    definitionVersion: "1",
                    definitionHash: "a".repeat(64)
                }
            })),
            activateProvisioned: vi.fn(async () => {}),
            cleanupProvisioned
        });

        await handler.dispatch(
            effect({
                kind: "identity_provision",
                recommendationId: "rec-1",
                admissionId: "rec-1"
            }) as never,
            new AbortController().signal
        );

        expect(cleanupProvisioned).toHaveBeenCalledWith("rec-1");
        expect(execute).not.toHaveBeenCalled();
    });

    it("cleans a provisioned child when admission CAS loses to Meeting termination", async () => {
        const cleanupProvisioned = vi.fn();
        let reads = 0;
        const handler = createMeetingIdentityEffectHandler({
            application: {
                execute: vi.fn(async () => ({
                    kind: "rejected" as const,
                    error: { code: "VERSION_CONFLICT" as const, message: "stale" }
                }))
            } as never,
            repository: {
                read: async () => {
                    reads += 1;
                    const terminal = reads === 3;
                    return {
                        meetingId: "meeting-1",
                        version: terminal ? 5 : 4,
                        state: {
                            lifecycle: { status: terminal ? "terminal" : "running" },
                            identityRecommendations: [
                                {
                                    id: "rec-1",
                                    decision: "admit",
                                    status: terminal ? "failed" : "provisioning",
                                    definitionId: "domain_architect",
                                    definitionVersion: "1",
                                    definitionHash: "a".repeat(64),
                                    identityId: "identity-1",
                                    sessionId: "child-1"
                                }
                            ]
                        }
                    };
                }
            } as never,
            definitions: [],
            provision: vi.fn(async () => ({
                kind: "admitted" as const,
                result: {
                    kind: "admitted" as const,
                    admissionId: "rec-1",
                    meetingId: "meeting-1",
                    identityId: "identity-1",
                    sessionId: "child-1",
                    ownershipId: "owner-1",
                    descriptorId: "descriptor:rec-1",
                    displayName: "Architect",
                    definitionId: "domain_architect",
                    definitionVersion: "1",
                    definitionHash: "a".repeat(64)
                }
            })),
            activateProvisioned: vi.fn(async () => {}),
            cleanupProvisioned
        });

        await handler.dispatch(
            effect({
                kind: "identity_provision",
                recommendationId: "rec-1",
                admissionId: "rec-1"
            }) as never,
            new AbortController().signal
        );

        expect(cleanupProvisioned).toHaveBeenCalledWith("rec-1");
    });
});

describe("dynamic peer identity provisioning", () => {
    const fixture = async () => {
        const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
        const definitions = parseAgentDefinitions(
            JSON.parse(await readFile(join(packageRoot, "config/definitions.json"), "utf8"))
                .definitions
        );
        const definition = definitions.find((d) => d.roleDefinitionId === "domain_architect")!;
        const path = join(packageRoot, "config/skills/repository-analysis/SKILL.md");
        const skill = {
            name: "repository-analysis",
            path,
            invocation: { modelInvocable: true },
            resourceBase: {
                kind: "directory",
                path: join(packageRoot, "config/skills/repository-analysis")
            },
            content: (await readFile(path, "utf8"))
                .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
                .trim()
        };
        let stored;
        let proof;
        const agents = { create: vi.fn(async () => {}), resume: vi.fn(async () => {}) };
        const ctx = {
            agentDefaultModel: {
                currentSelection: vi.fn(() => ({ provider: "fixture", model: "model" }))
            },
            llm: { resolveCallConfig: async (config) => config },
            agentPresets: { standingKeyFor: vi.fn(async () => ({})) },
            skills: {
                snapshot: vi.fn(async () => ({ complete: true, skills: [skill] })),
                get: async (name) => (name === skill.name ? skill : undefined)
            }
        };
        const owner = {
            readOwnership: async () => stored,
            readDescriptor: async () => proof,
            putProvisioning: vi.fn(async (ownership, descriptor) => {
                proof = descriptor;
                stored = { ...ownership, createdAt: Date.now(), updatedAt: Date.now() };
                return stored;
            }),
            markActive: vi.fn(async (ownership) => {
                stored = { ...ownership, lifecycleStatus: "active" };
                return stored;
            }),
            revokeAndDrainOwned: vi.fn(async () => {
                stored = { ...stored, capabilityStatus: "revoked", lifecycleStatus: "closed" };
            })
        };
        const input = {
            meetingId: "meeting",
            signal: new AbortController().signal,
            recommendation: {
                id: "admission",
                definitionId: definition.agentDefinitionId,
                definitionVersion: definition.definitionVersion,
                definitionHash: definitionHash(definition),
                identityId: "identity",
                sessionId: "session"
            }
        };
        const dependencies = {
            ctx,
            agents,
            owner,
            definitions,
            packageRoot,
            cwd: packageRoot,
            now: Date.now
        };
        return { ctx, agents, owner, input, dependencies };
    };
    it("refuses a missing Skill before storing ownership or creating a Session", async () => {
        const f = await fixture();
        f.ctx.skills.snapshot.mockResolvedValue({ complete: true, skills: [] });
        expect(await provisionMeetingIdentity(f.input, f.dependencies)).toEqual({
            kind: "rejected",
            failureCode: "CAPABILITY_MISSING"
        });
        expect(f.owner.putProvisioning).not.toHaveBeenCalled();
        expect(f.agents.create).not.toHaveBeenCalled();
    });
    it("creates the preflighted peer and leaves delivery activation to the committed result", async () => {
        const f = await fixture();
        const result = await provisionMeetingIdentity(f.input, f.dependencies);
        expect(result.kind).toBe("admitted");
        expect(f.agents.create).toHaveBeenCalledWith(
            expect.objectContaining({
                ownership: expect.objectContaining({
                    sessionId: "session",
                    admissionId: "admission",
                    lifecycleStatus: "provisioning"
                }),
                descriptor: expect.objectContaining({ sessionId: "session" })
            })
        );
        expect(f.agents.resume).not.toHaveBeenCalled();
        expect(await provisionMeetingIdentity(f.input, f.dependencies)).toEqual(result);
        expect(f.agents.create).toHaveBeenCalledTimes(1);
        expect(f.ctx.agentDefaultModel.currentSelection).toHaveBeenCalledTimes(1);
    });
    it("resumes the original provisioning Session without replacing resources or refreshing proof", async () => {
        const f = await fixture();
        f.owner.markActive.mockImplementationOnce(async (o) => o);
        await provisionMeetingIdentity(f.input, f.dependencies);
        f.ctx.agentPresets.standingKeyFor.mockRejectedValue(new Error("new default unavailable"));
        expect((await provisionMeetingIdentity(f.input, f.dependencies)).kind).toBe("admitted");
        expect(f.agents.resume).toHaveBeenCalledWith(
            expect.objectContaining({
                purpose: "provisioning",
                ownership: expect.objectContaining({ sessionId: "session" })
            })
        );
        expect(f.agents.create).toHaveBeenCalledTimes(1);
    });
    it("revokes a failed first factory and never substitutes another Session", async () => {
        const f = await fixture();
        f.agents.create.mockRejectedValue(new Error("factory failure"));
        expect(await provisionMeetingIdentity(f.input, f.dependencies)).toEqual({
            kind: "rejected",
            failureCode: "ADMISSION_FAILED"
        });
        expect(f.owner.revokeAndDrainOwned).toHaveBeenCalledOnce();
        expect(f.owner.markActive).not.toHaveBeenCalled();
    });
});
