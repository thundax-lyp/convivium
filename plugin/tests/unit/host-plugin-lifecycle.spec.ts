import { describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import Tools from "@deepseek-ai/dsh-tools";

const { createProvider } = vi.hoisted(() => ({ createProvider: vi.fn() }));
vi.mock("@/dsh/acp-codex/index.ts", async (original) => ({
    ...(await original<object>()),
    createCodexAcpProvider: createProvider
}));

import { apply, inject } from "@/index.ts";
import { getLocalMeetingWebRuntime } from "@/runtime/index.ts";
import { createFakeDomainFacility } from "../fixtures/domain-storage.ts";
import roleResources from "../../config/definitions.json" with { type: "json" };

const config = {
    provider: "spawn",
    maxParticipants: 3,
    initialContributorRoleIds: ["github_research_analyst", "arxiv_research_analyst"],
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
    const host = async (
        host: "127.0.0.1" | "localhost" | "0.0.0.0" | undefined,
        runtimeConfig: typeof config & { acpCodex?: { command: string; args: string[] } } = config
    ) => {
        const routeDispose = vi.fn();
        const register = vi.fn(() => routeDispose);
        const effects: Array<() => void | Promise<void>> = [];
        const toolDisposers: Array<ReturnType<typeof vi.fn>> = [];
        const childOrder: string[] = [];
        const ctx = {
            get: vi.fn((key: string) =>
                runtimeConfig.acpCodex
                    ? (ctx as unknown as Record<string, unknown>)[key]
                    : undefined
            ),
            sessions: {},
            sessionPersistence: {},
            agentPresets: {},
            agentDefaultModel: {},
            skills: {},
            llm: {},
            subprocess: {},
            systemPrompt: {},
            storageDomain: createFakeDomainFacility(),
            effect(setup: () => () => void | Promise<void>) {
                effects.push(setup());
            },
            on: vi.fn(() => {
                const disposer = vi.fn();
                effects.push(disposer);
                return disposer;
            }),
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
            inject(keys: string[], callback: (context: unknown) => unknown) {
                if (keys.includes("subprocess")) {
                    return callback(ctx);
                }
                expect(keys).toEqual(["webServer", "typertGateway", "typert"]);
                if (ctx.webServer !== undefined) {
                    callback(ctx);
                }
            },
            async plugin(
                plugin: { name?: string; apply(context: unknown, value: unknown): unknown },
                value: unknown
            ) {
                childOrder.push(plugin.name ?? "anonymous");
                if (plugin.name === "ConviviumRemoteService") {
                    return;
                }
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
                for (const effect of [...effects].reverse()) {
                    await effect();
                }
            }
        };
    };

    it("registers the optional ACP provider before recovery and closes it after Meeting runtime shutdown", async () => {
        const close = vi.fn();
        const unsubscribe = vi.fn();
        const subscribeBlocks = vi.fn(() => unsubscribe);
        let providerContext: Context;
        createProvider.mockImplementationOnce(async (context) => {
            providerContext = context;
            expect(context.tools.register).not.toHaveBeenCalled();
            return { close, subscribeBlocks };
        });
        const fixture = await host(undefined, {
            ...config,
            acpCodex: { command: "/scripted-acp", args: [] }
        });
        expect(createProvider).toHaveBeenCalledTimes(1);
        expect(fixture.toolDisposers).toHaveLength(14);
        close.mockImplementation(() => {
            expect(() => getLocalMeetingWebRuntime(providerContext)).toThrow();
        });
        await fixture.dispose();
        expect(subscribeBlocks).toHaveBeenCalledOnce();
        expect(unsubscribe).toHaveBeenCalledOnce();
        expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
            close.mock.invocationCallOrder[0]
        );
        expect(close).toHaveBeenCalledTimes(1);
    });

    it("closes the ACP provider when Meeting activation rejects invalid definitions", async () => {
        const close = vi.fn();
        createProvider.mockResolvedValueOnce({ close });
        await expect(
            host(undefined, {
                ...config,
                agentDefinitions: [],
                acpCodex: { command: "/scripted-acp", args: [] }
            })
        ).rejects.toThrow("exact eight packaged Meeting role definitions");
        expect(close).toHaveBeenCalledTimes(1);
    });

    it("does not activate Meeting tools when ACP route registration fails", async () => {
        createProvider.mockRejectedValueOnce(new Error("duplicate ACP route"));
        await expect(
            host(undefined, {
                ...config,
                acpCodex: { command: "/scripted-acp", args: [] }
            })
        ).rejects.toThrow("duplicate ACP route");
    });

    it("rejects enabled ACP when a required Host service is absent", async () => {
        const calls = createProvider.mock.calls.length;
        await expect(
            apply({ get: () => undefined } as never, {
                ...config,
                acpCodex: { command: "/scripted-acp", args: [] }
            })
        ).rejects.toThrow("Missing ACP Host service: agents");
        expect(createProvider).toHaveBeenCalledTimes(calls);
    });

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
        expect(fixture.toolDisposers).toHaveLength(14);
        for (const disposer of fixture.toolDisposers) {
            expect(disposer).toHaveBeenCalledTimes(1);
        }
    });

    it("registers meeting tools without a WebServer", async () => {
        const fixture = await host(undefined);
        expect(fixture.register).not.toHaveBeenCalled();
        expect(fixture.toolDisposers).toHaveLength(14);
        await fixture.dispose();
        for (const disposer of fixture.toolDisposers) {
            expect(disposer).toHaveBeenCalledTimes(1);
        }
    });

    it("requires the exact eight packaged role definitions without resolving their capabilities", async () => {
        const fixture = await host("127.0.0.1");
        expect(fixture.get).not.toHaveBeenCalledWith("agentPresets");
        expect(fixture.get).not.toHaveBeenCalledWith("skills");
        await fixture.dispose();
        await expect(
            host("127.0.0.1", {
                ...config,
                agentDefinitions: roleResources.definitions.slice(0, 7)
            })
        ).rejects.toThrow("exact eight packaged Meeting role definitions");
        await expect(host("127.0.0.1", { ...config, agentDefinitions: [{}] })).rejects.toThrow(
            "Invalid meeting agent definitions."
        );
    });

    it("does not register Meeting routes on all interfaces", async () => {
        const fixture = await host("0.0.0.0");
        expect(fixture.register).not.toHaveBeenCalled();
        expect(fixture.effects.length).toBeGreaterThan(0);
        await fixture.dispose();
        expect(fixture.toolDisposers).toHaveLength(14);
        for (const disposer of fixture.toolDisposers) {
            expect(disposer).toHaveBeenCalledTimes(1);
        }
    });

    it("does not register Meeting routes for a localhost host alias", async () => {
        const fixture = await host("localhost");
        expect(fixture.childOrder).toEqual(["convivium-meeting-consumer"]);
        await fixture.dispose();
        expect(fixture.toolDisposers).toHaveLength(14);
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
                ]) {
                    root.provide(service, {});
                }
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
                    ).toBe(14)
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
                ).toBe(14);
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
