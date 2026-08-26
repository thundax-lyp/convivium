import { describe, expect, it } from "vitest";

import { apply, assertContinuableProvider, inject } from "../../src/index.js";

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

    it("checks capability without preparing or starting a child session", () => {
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
        expect(() => apply(ctx as never, config)).not.toThrow();
    });
});
