import { describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import Tools from "@deepseek-ai/dsh-tools";

import { apply, inject } from "@/index.js";
import { createFakeDomainFacility } from "../fixtures/domain-storage.js";
import roleResources from "../../config/definitions.json" with { type: "json" };

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
                            "sessionPersistence",
                            "agentPresets",
                            "agentDefaultModel",
                            "skills",
                            "llm",
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
                for (const service of [
                    "sessionPersistence",
                    "agentPresets",
                    "agentDefaultModel",
                    "skills",
                    "llm"
                ])
                    root.provide(service, {});
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
