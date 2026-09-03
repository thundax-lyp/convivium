import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateScenarioResult } from "../../../scripts/smoke-profile/index.mjs";

describe("meeting convergence smoke profile", () => {
    it("registers one closed convergence selector and exact assertion set", async () => {
        const source = await readFile(
            new URL("../../../scripts/smoke-profile/index.mjs", import.meta.url),
            "utf8"
        );
        expect((source.match(/"convergence"/g) ?? []).length).toBe(3);
        expect(() =>
            validateScenarioResult({ ok: true, scenario: "unknown", assertions: [] }, "unknown")
        ).not.toThrow();
        expect(() =>
            validateScenarioResult(
                {
                    ok: true,
                    scenario: "convergence",
                    assertions: [
                        "deterministic-fallback",
                        "fallback-replay-idempotent",
                        "fallback-status-projected"
                    ]
                },
                "convergence"
            )
        ).not.toThrow();
        expect(() =>
            validateScenarioResult(
                { ok: true, scenario: "convergence", assertions: ["deterministic-fallback"] },
                "convergence"
            )
        ).toThrow("Convergence smoke assertions are incomplete.");
    });
});
