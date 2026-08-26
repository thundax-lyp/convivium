import { describe, expect, it } from "vitest";

import { inject } from "../../src/index.js";

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
