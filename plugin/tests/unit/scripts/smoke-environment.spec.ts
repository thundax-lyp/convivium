import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createSmokeEnvironment } from "../../../scripts/smoke-environment.mjs";

const smokeProfileSource = readFileSync(
    new URL("../../../scripts/smoke-profile.mjs", import.meta.url),
    "utf8"
);

describe("createSmokeEnvironment", () => {
    it("removes DeepSeek credentials inherited from the caller", () => {
        const environment = createSmokeEnvironment({
            PATH: "/bin",
            DEEPSEEK_API_KEY: "secret"
        });

        expect(environment).toEqual({ PATH: "/bin" });
    });

    it("does not allow command overrides to reintroduce DeepSeek credentials", () => {
        const environment = createSmokeEnvironment(
            { PATH: "/bin", DSH_HOME: "/old" },
            { DSH_HOME: "/smoke", DEEPSEEK_API_KEY: "secret" }
        );

        expect(environment).toEqual({ PATH: "/bin", DSH_HOME: "/smoke" });
    });
});

describe("smoke profile scenario guard", () => {
    it("accepts the decision-risk-closure selector with one dispatcher branch", () => {
        expect(smokeProfileSource).toContain('"decision-risk-closure"');
        expect(smokeProfileSource).toContain('if (scenario === "decision-risk-closure") {');
        expect(smokeProfileSource).toContain("async function runDecisionRiskClosureScenario(ctx)");
        expect(smokeProfileSource).toContain('action: "supersede"');
        expect(smokeProfileSource).toContain('action: "revoke"');
        expect(smokeProfileSource).toContain('"decision supersede replay result mismatch"');
        expect(smokeProfileSource).toContain('"decision history does not retain both decisions"');
        expect(smokeProfileSource).toContain('"risk replay result mismatch"');
        expect(smokeProfileSource).toContain('"risk-blocking-facts"');
        expect(smokeProfileSource).not.toContain("INTERNAL_UNIMPLEMENTED");
    });

    it("keeps unknown scenario handling fail closed", () => {
        expect(smokeProfileSource).toContain('"SCENARIO_NOT_IMPLEMENTED:" + scenario');
        expect(smokeProfileSource).toContain("if (!SMOKE_SCENARIOS.includes(SMOKE_SCENARIO))");
    });
});
