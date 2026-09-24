import { describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import Tools from "@deepseek-ai/dsh-tools";

import { apply, assertContinuableProvider, inject } from "@/index.js";
import { requireContinuableProvider } from "@/dsh/index.js";
import {
    activateTargetMeetingApplication,
    getLocalMeetingWebRuntime,
    getMeetingCommandApplication
} from "@/runtime/index.js";
import { createFakeDomainFacility } from "../fixtures/domain-storage.js";
import roleResources from "../../meeting-roles/definitions.json" with { type: "json" };

const config = {
    provider: "spawn",
    maxParticipants: 3,
    speakerTimeoutMs: 60_000,
    outboxPollMs: 1_000,
    agentDefinitions: roleResources.definitions
};

const providerCapabilities = {
    agentOptions: true,
    outputSchema: true,
    depthLimit: true,
    toolFilter: true,
    persona: true
};

describe("Convivium host inject", () => {
    it("keeps the top-level compositor dependency-free", () => {
        expect(inject).toEqual([]);
    });
});

describe("Convivium continuable provider gate", () => {
    it("fails loud when the explicitly configured provider is unavailable", () => {
        const getProvider = (name: string) => {
            expect(name).toBe("spawn");
            return undefined;
        };

        expect(() =>
            assertContinuableProvider({ subagents: { getProvider } } as never, "spawn")
        ).toThrow(/spawn.*not registered/);
    });

    it("fails loud without the prepareContinuable capability", () => {
        const provider = {
            name: "spawn",
            prepareContinuable: undefined
        };

        expect(() =>
            assertContinuableProvider(
                { subagents: { getProvider: () => provider } } as never,
                "spawn"
            )
        ).toThrow(/spawn.*prepareContinuable/);
    });

    it("checks capability without preparing or starting a child session", async () => {
        const prepareContinuable = () => {
            throw new Error("must not prepare a child during plugin activation");
        };
        const startContinuable = () => {
            throw new Error("must not start a child during plugin activation");
        };
        const provider = {
            name: "spawn",
            prepareContinuable,
            startContinuable
        };
        const ctx = {
            subagents: { getProvider: () => provider }
        };

        expect(assertContinuableProvider(ctx as never, "spawn")).toBe(provider);
    });

    it("exposes the same non-creating capability gate through the session adapter", () => {
        const provider = { name: "spawn", prepareContinuable: async () => ({}) };
        expect(requireContinuableProvider({ getProvider: () => provider } as never, "spawn")).toBe(
            provider
        );
    });
});

describe("target Meeting lifecycle", () => {
    it("creates one running Meeting and exactly seven owned child Sessions", async () => {
        const starts: unknown[] = [];
        const subagents = {
            getProvider: () => ({
                name: "spawn",
                capabilities: providerCapabilities,
                inheritsParentContext: false,
                prepareContinuable: async () => ({ inheritParentContext: false })
            }),
            startContinuable: async (spec: { childId: string }) => {
                starts.push(spec);
                return { childId: spec.childId, messageId: `message-${starts.length}` };
            },
            interrupt: vi.fn(),
            drainContinuableChildren: vi.fn()
        };
        const readSnapshot = vi.fn(async () => ({
            kind: "available" as const,
            snapshot: {
                protocolVersion: 1 as const,
                meetingId: "placeholder",
                catalogId: "catalog-1",
                catalogVersion: "1",
                generatedAt: 1,
                candidates: [
                    {
                        candidateId: "candidate-1",
                        definition: { id: "domain_architect", version: "1" },
                        definitionHash: "a".repeat(64),
                        displayName: "Architect",
                        availability: "available" as const,
                        meetingRoles: ["contributor" as const],
                        responsibilitySummary: "Architecture evidence",
                        capabilitySummary: [],
                        suitability: []
                    }
                ]
            }
        }));
        const owner = {
            storageDomain: createFakeDomainFacility(),
            subagents,
            get: (key: string) => (key === "convivium.agentCatalog" ? { readSnapshot } : undefined)
        };
        const dispose = await activateTargetMeetingApplication(owner as never, config);
        const application = getMeetingCommandApplication(owner);
        const captain = {
            id: "captain-1",
            session: { header: { cwd: "/fixture" } },
            ctx: {
                get: (key: string) =>
                    key === "agentPresets"
                        ? { composedPreset: () => "convivium" }
                        : key === "skills"
                          ? {
                                get: async () => ({
                                    content: "fixture",
                                    invocation: { modelInvocable: true }
                                })
                            }
                          : undefined
            }
        };
        const identities = roleResources.definitions.map((definition, index) => ({
            identityKey: `identity-${index + 1}`,
            definitionId: definition.agentDefinitionId,
            definitionVersion: definition.definitionVersion,
            displayName: definition.displayName,
            roles:
                definition.roleDefinitionId === "meeting_manager"
                    ? (["manager"] as const)
                    : definition.roleDefinitionId === "verification_reviewer"
                      ? (["evidence_reviewer"] as const)
                      : (["contributor"] as const),
            agendaResponsibilityIds: ["agenda-1"],
            riskAuthority: false,
            required: true
        }));
        const command = {
            protocolVersion: 1,
            meetingId: "new",
            expectedMeetingVersion: 0,
            requestId: "create-target-1",
            action: {
                kind: "create_meeting",
                objective: {
                    statement: "Produce verified evidence",
                    requiredOutputs: [{ id: "output-1", text: "Evidence" }],
                    acceptanceCriteria: [{ id: "criterion-1", text: "Reviewed" }],
                    hardConstraints: [],
                    acceptableRiskLevel: "low"
                },
                identities,
                managerIdentityKey: "identity-1",
                evidenceReviewerIdentityKey: "identity-5",
                initialAgenda: [
                    {
                        id: "agenda-1",
                        title: "Evidence",
                        question: "What evidence is sufficient?",
                        requiredOutputIds: ["output-1"],
                        ownerIdentityKey: "identity-1"
                    }
                ],
                initialActiveAgendaId: "agenda-1",
                limits: {
                    maxFormalMessages: 20,
                    maxDurationMs: 60000,
                    taskDeadlineMs: 30000,
                    reviewDeadlineMs: 30000
                }
            }
        } as const;
        const context = {
            caller: { channel: "dsh_tool" as const, principalId: "captain-1" },
            captainParent: captain as never
        };
        const [result, replay] = await Promise.all([
            application.execute(command, context, new AbortController().signal),
            application.execute(command, context, new AbortController().signal)
        ]);

        expect(result).toMatchObject({ kind: "accepted", committedVersion: 1 });
        expect(replay).toEqual(result);
        expect(starts).toHaveLength(7);
        const runtime = getLocalMeetingWebRuntime(owner);
        const managerStart = starts.find((item) =>
            String((item as { label?: string }).label).includes(":manager:")
        ) as { childId: string };
        const manager = await runtime.findBySessionId(
            managerStart.childId,
            new AbortController().signal
        );
        expect(manager?.ownership.id).toBeDefined();
        readSnapshot.mockImplementationOnce(async () => ({
            kind: "available" as const,
            snapshot: {
                protocolVersion: 1 as const,
                meetingId: result.meetingId,
                catalogId: "catalog-1",
                catalogVersion: "1",
                generatedAt: 1,
                candidates: [
                    {
                        candidateId: "candidate-1",
                        definition: { id: "domain_architect", version: "1" },
                        definitionHash: "a".repeat(64),
                        displayName: "Architect",
                        availability: "available" as const,
                        meetingRoles: ["contributor" as const],
                        responsibilitySummary: "Architecture evidence",
                        capabilitySummary: [],
                        suitability: []
                    }
                ]
            }
        }));
        await expect(
            application.execute(
                {
                    protocolVersion: 1,
                    meetingId: result.meetingId,
                    expectedMeetingVersion: 1,
                    requestId: "recommend-identity-1",
                    action: {
                        kind: "recommend_identity",
                        candidateId: "candidate-1",
                        definitionId: "domain_architect",
                        definitionVersion: "1",
                        catalogId: "catalog-1",
                        catalogVersion: "1",
                        agendaId: "agenda-1",
                        decision: "admit",
                        rationale: "Need architecture evidence",
                        expectedContribution: "Architecture analysis",
                        evidenceGap: "Architecture evidence is missing"
                    }
                },
                {
                    caller: {
                        channel: "dsh_tool",
                        principalId: manager!.ownership.identityId!,
                        sessionBindingId: manager!.ownership.id
                    }
                },
                new AbortController().signal
            )
        ).resolves.toMatchObject({
            kind: "accepted",
            identityDecision: { decision: "admit", status: "provisioning" }
        });
        expect(readSnapshot).toHaveBeenCalledOnce();
        await expect(
            application.execute(
                {
                    protocolVersion: 1,
                    meetingId: result.meetingId,
                    expectedMeetingVersion: 2,
                    requestId: "runtime-review-delivery-1",
                    action: {
                        kind: "record_review_delivery",
                        reviewId: "missing-review",
                        status: "sent"
                    }
                },
                {
                    caller: {
                        channel: "runtime_recovery",
                        principalId: "runtime-recovery"
                    }
                },
                new AbortController().signal
            )
        ).resolves.toMatchObject({ kind: "rejected", error: { code: "NOT_FOUND" } });
        await expect(
            application.execute(
                {
                    protocolVersion: 1,
                    meetingId: result.meetingId,
                    expectedMeetingVersion: 2,
                    requestId: "deadline-close-1",
                    action: {
                        kind: "close_contribution",
                        contributionId: "missing-contribution",
                        exit: "timed_out",
                        reason: "deadline elapsed"
                    }
                },
                {
                    caller: {
                        channel: "deadline_handler",
                        principalId: "deadline-handler"
                    }
                },
                new AbortController().signal
            )
        ).resolves.toMatchObject({ kind: "rejected", error: { code: "NOT_FOUND" } });
        await dispose();
    });
});

describe("Convivium local Meeting route lifecycle", () => {
    async function host(
        host: "127.0.0.1" | "localhost" | "0.0.0.0" | undefined,
        runtimeConfig = config,
        workspace: { path: string } | undefined = undefined,
        includeWorkspaceRegistry = false
    ) {
        const routeDispose = vi.fn();
        const register = vi.fn(() => routeDispose);
        const effects: Array<() => void | Promise<void>> = [];
        const toolDisposers: Array<ReturnType<typeof vi.fn>> = [];
        const childOrder: string[] = [];
        const workspaceRegistry = includeWorkspaceRegistry
            ? { get: vi.fn(() => workspace) }
            : undefined;
        const ctx = {
            get: vi.fn((key: string) =>
                key === "workspaceRegistry" ? workspaceRegistry : undefined
            ),
            effect(setup: () => () => void | Promise<void>) {
                effects.push(setup());
            },
            agents: { get: () => undefined },
            logger: vi.fn(() => ({ warn: vi.fn() })),
            subagents: {
                getProvider: () => ({
                    name: "spawn",
                    capabilities: providerCapabilities,
                    prepareContinuable: async () => ({})
                }),
                startContinuable: async () => {
                    throw new Error("not used");
                },
                listChildren: async () => [],
                listDescendants: async () => [],
                interrupt: () => undefined,
                drainContinuableChildren: async () => undefined
            },
            tools: {
                register: vi.fn(() => {
                    const disposer = vi.fn();
                    toolDisposers.push(disposer);
                    effects.push(disposer);
                    return disposer;
                })
            },
            webServer: host === undefined ? undefined : { host, register },
            typertGateway: {},
            typert: {},
            inject(keys: string[], callback: (context: unknown) => void) {
                expect(keys).toEqual(["webServer", "typertGateway", "typert"]);
                if (ctx.webServer !== undefined) callback(ctx);
            },
            async plugin(
                plugin: { name?: string; apply(context: unknown, value: unknown): unknown },
                value: unknown
            ) {
                childOrder.push(plugin.name ?? "anonymous");
                if (plugin.name === "ConviviumRemoteService") return;
                if (plugin.name === "convivium-meeting-consumer") {
                    expect(plugin).toMatchObject({
                        inject: [
                            "agents",
                            "sessions",
                            "subagents",
                            "systemPrompt",
                            "tools",
                            "storageDomain"
                        ]
                    });
                    await plugin.apply(
                        { ...ctx, storageDomain: createFakeDomainFacility() },
                        value
                    );
                }
            }
        };
        await apply(ctx as never, runtimeConfig);
        return {
            register,
            routeDispose,
            effects,
            toolDisposers,
            childOrder,
            get: ctx.get,
            dispose: async () => {
                for (const effect of [...effects].reverse()) await effect();
            }
        };
    }

    it("registers exactly one Remote Service on loopback", async () => {
        const fixture = await host("127.0.0.1");
        expect(fixture.childOrder).toEqual([
            "convivium-meeting-consumer",
            "ConviviumRemoteService"
        ]);
        expect(fixture.register).not.toHaveBeenCalled();
        expect(fixture.effects.length).toBeGreaterThan(0);
        await fixture.dispose();
        expect(fixture.routeDispose).not.toHaveBeenCalled();
        expect(fixture.toolDisposers).toHaveLength(10);
        expect(fixture.get).toHaveBeenCalledWith("convivium.agentCatalog");
        for (const disposer of fixture.toolDisposers) expect(disposer).toHaveBeenCalledTimes(1);
    });

    it("registers meeting tools without a WebServer", async () => {
        const fixture = await host(undefined);
        expect(fixture.register).not.toHaveBeenCalled();
        expect(fixture.toolDisposers).toHaveLength(10);
        await fixture.dispose();
        for (const disposer of fixture.toolDisposers) expect(disposer).toHaveBeenCalledTimes(1);
    });

    it("requires the exact seven enabled role definitions without resolving their capabilities", async () => {
        const fixture = await host("127.0.0.1");
        expect(fixture.get).not.toHaveBeenCalledWith("agentPresets");
        expect(fixture.get).not.toHaveBeenCalledWith("skills");
        await fixture.dispose();
        await expect(
            host("127.0.0.1", {
                ...config,
                agentDefinitions: roleResources.definitions.slice(0, 6)
            })
        ).rejects.toThrow("exact seven enabled Meeting role definitions");
        await expect(host("127.0.0.1", { ...config, agentDefinitions: [{}] })).rejects.toThrow(
            "Invalid meeting agent definitions."
        );
    });

    it("does not register Meeting routes on all interfaces", async () => {
        const fixture = await host("0.0.0.0");
        expect(fixture.register).not.toHaveBeenCalled();
        expect(fixture.effects.length).toBeGreaterThan(0);
        await fixture.dispose();
        expect(fixture.toolDisposers).toHaveLength(10);
        for (const disposer of fixture.toolDisposers) expect(disposer).toHaveBeenCalledTimes(1);
    });

    it("does not register Meeting routes for a localhost host alias", async () => {
        const fixture = await host("localhost");
        expect(fixture.childOrder).toEqual(["convivium-meeting-consumer"]);
        await fixture.dispose();
        expect(fixture.toolDisposers).toHaveLength(10);
    });

    it("does not activate legacy workspace projection", async () => {
        const fixture = await host(
            "0.0.0.0",
            { ...config, developerMarkdownWorkspaceId: "workspace-1" },
            { path: "/tmp/convivium-workspace" },
            true
        );
        await fixture.dispose();
        const withoutWorkspace = await host("0.0.0.0", {
            ...config,
            developerMarkdownWorkspaceId: "missing"
        });
        await withoutWorkspace.dispose();
    });
});

describe("Convivium Cordis service lifecycle", () => {
    it.each([false, true])(
        "keeps tools gated on the configured provider and independent of WebServer (late provider: %s)",
        async (lateProvider) => {
            const root = new Context();
            try {
                await root.plugin(SystemPrompt, {});
                await root.plugin(Tools, { mode: "native" });
                root.provide("agents", { get: () => undefined });
                root.provide("sessions", {});
                const spawnProvider: SubagentProvider = {
                    name: "spawn",
                    capabilities: providerCapabilities,
                    inheritsParentContext: false,
                    async start() {
                        throw new Error("Unexpected start");
                    },
                    async prepareContinuable() {
                        return { inheritParentContext: false };
                    }
                };
                let registeredProvider = lateProvider ? undefined : spawnProvider;
                root.provide("subagents", {
                    getProvider: () => registeredProvider,
                    startContinuable: async () => {
                        throw new Error("Unexpected start");
                    },
                    listChildren: async () => [],
                    listDescendants: async () => [],
                    interrupt() {},
                    drainContinuableChildren: async () => {}
                });
                root.provide("storageDomain", createFakeDomainFacility());
                const plugin = await root.plugin({
                    name: "convivium-composition-test",
                    apply: (ctx) => apply(ctx, config)
                });
                if (lateProvider) {
                    expect(
                        root.tools.schemas().filter((s) => s.name.startsWith("convivium_"))
                    ).toEqual([]);
                    root.emit("subagent/provider-added", { ...spawnProvider, name: "other" });
                    expect(
                        root.tools.schemas().filter((s) => s.name.startsWith("convivium_"))
                    ).toEqual([]);
                    registeredProvider = spawnProvider;
                    root.emit("subagent/provider-added", spawnProvider);
                }
                await vi.waitFor(() =>
                    expect(
                        root.tools.schemas().filter((s) => s.name.startsWith("convivium_")).length
                    ).toBe(10)
                );
                const register = vi.fn(() => vi.fn());
                const web = await root.plugin({
                    name: "test-web-server",
                    apply(ctx) {
                        ctx.provide("webServer", { host: "127.0.0.1", register });
                    }
                });
                expect(register).not.toHaveBeenCalled();
                await web.dispose();
                expect(
                    root.tools.schemas().filter((s) => s.name.startsWith("convivium_")).length
                ).toBe(10);
                await root.plugin({
                    name: "test-web-server-again",
                    apply(ctx) {
                        ctx.provide("webServer", { host: "127.0.0.1", register });
                    }
                });
                expect(register).not.toHaveBeenCalled();
                await plugin.dispose();
                await vi.waitFor(() =>
                    expect(
                        root.tools.schemas().filter((s) => s.name.startsWith("convivium_"))
                    ).toEqual([])
                );
                root.emit("subagent/provider-added", spawnProvider);
                expect(root.tools.schemas().filter((s) => s.name.startsWith("convivium_"))).toEqual(
                    []
                );
            } finally {
                await root.fiber.dispose();
            }
        }
    );
});
