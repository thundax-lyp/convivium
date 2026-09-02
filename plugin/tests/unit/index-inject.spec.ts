import { describe, expect, it, vi } from "vitest";

import { apply, assertContinuableProvider, inject } from "../../src/index.js";
import { requireContinuableProvider } from "../../src/dsh/index.js";
import { createFakeDomainFacility } from "../fixtures/domain-storage.js";

const config = {
    provider: "spawn",
    maxParticipants: 3,
    speakerTimeoutMs: 60_000,
    outboxPollMs: 1_000
};

describe("Convivium host inject", () => {
    it("uses the DSH 0.1.1-rc.2 Context service keys rather than package names", () => {
        expect(inject).toEqual([
            "agents",
            "sessions",
            "subagents",
            "systemPrompt",
            "tools",
            "workspaceRegistry",
            "webServer"
        ]);
        expect(inject.some((service) => service.startsWith("@deepseek-ai/"))).toBe(false);
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
        await expect(apply(ctx as never, config)).resolves.toBeUndefined();
    });

    it("exposes the same non-creating capability gate through the session adapter", () => {
        const provider = { name: "spawn", prepareContinuable: async () => ({}) };
        expect(requireContinuableProvider({ getProvider: () => provider } as never, "spawn")).toBe(
            provider
        );
    });
});

describe("Convivium local Meeting route lifecycle", () => {
    async function host(host: "127.0.0.1" | "0.0.0.0") {
        const routeDispose = vi.fn();
        const register = vi.fn(() => routeDispose);
        const effects: Array<() => void | Promise<void>> = [];
        const toolDisposers: Array<ReturnType<typeof vi.fn>> = [];
        const childOrder: string[] = [];
        const ctx = {
            effect(setup: () => () => void | Promise<void>) {
                effects.push(setup());
            },
            agents: { get: () => undefined },
            subagents: {
                getProvider: () => ({ name: "spawn", prepareContinuable: async () => ({}) }),
                startContinuable: async () => {
                    throw new Error("not used");
                },
                listChildren: async () => [],
                interrupt: () => undefined,
                drainContinuableChildren: async () => undefined
            },
            tools: {
                register: vi.fn(() => {
                    const disposer = vi.fn();
                    toolDisposers.push(disposer);
                    return disposer;
                })
            },
            webServer: { host, register },
            async plugin(
                plugin: { name?: string; apply(context: unknown, value: unknown): unknown },
                value: unknown
            ) {
                childOrder.push(plugin.name ?? "anonymous");
                if (plugin.name === "convivium-meeting-consumer") {
                    await plugin.apply(
                        { ...ctx, storageDomain: createFakeDomainFacility() },
                        value
                    );
                }
            }
        };
        await apply(ctx as never, config);
        return {
            register,
            routeDispose,
            effects,
            toolDisposers,
            childOrder,
            dispose: async () => {
                for (const effect of [...effects].reverse()) await effect();
            }
        };
    }

    it("registers and disposes exactly one prefix on loopback", async () => {
        const fixture = await host("127.0.0.1");
        expect(fixture.childOrder).toEqual([
            "convivium-storage-jsonl",
            "convivium-meeting-consumer"
        ]);
        expect(fixture.register).toHaveBeenCalledTimes(1);
        expect(fixture.register.mock.calls[0]?.[0]).toMatchObject({
            kind: "prefix",
            path: "/api/convivium/meetings"
        });
        expect(fixture.effects).toHaveLength(19);
        expect(fixture.register).toHaveBeenCalledTimes(1);
        await fixture.dispose();
        expect(fixture.routeDispose).toHaveBeenCalledTimes(1);
        expect(fixture.toolDisposers).toHaveLength(17);
        for (const disposer of fixture.toolDisposers) expect(disposer).toHaveBeenCalledTimes(1);
    });

    it("does not register Meeting routes on all interfaces", async () => {
        const fixture = await host("0.0.0.0");
        expect(fixture.register).not.toHaveBeenCalled();
        expect(fixture.effects).toHaveLength(18);
        await fixture.dispose();
        expect(fixture.toolDisposers).toHaveLength(17);
        for (const disposer of fixture.toolDisposers) expect(disposer).toHaveBeenCalledTimes(1);
    });
});
