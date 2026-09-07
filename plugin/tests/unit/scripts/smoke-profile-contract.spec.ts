import { describe, expect, it } from "vitest";
import { validateScenarioResult } from "../../../scripts/smoke-profile/index.mjs";

describe("meeting convergence smoke profile", () => {
    it("requires the complete convergence assertion set", () => {
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
