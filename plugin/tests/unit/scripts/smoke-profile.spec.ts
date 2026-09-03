import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
    createSmokeEnvironment,
    validateScenarioResult
} from "../../../scripts/smoke-profile/index.mjs";

const smokeProfileSource = readFileSync(
    new URL("../../../scripts/smoke-profile/index.mjs", import.meta.url),
    "utf8"
);
const smokeSupportSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/support.js", import.meta.url),
    "utf8"
);
const riskReopenSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/risk-reopen.js", import.meta.url),
    "utf8"
);
const mailSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/mail.js", import.meta.url),
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
    it("exports the smoke result validator from the entrypoint", () => {
        expect(
            validateScenarioResult({ ok: true, scenario: "baseline", assertions: [] }, "baseline")
                .ok
        ).toBe(true);
    });

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

    it("dispatches risk-reopen to one scenario module", () => {
        expect(smokeProfileSource).toContain('from "./scenarios/risk-reopen.js"');
        expect(smokeProfileSource).toContain("await runRiskReopenScenario(runtime);");
        expect(riskReopenSource).toContain("export async function runRiskReopenScenario(runtime)");
        expect(riskReopenSource).toContain('"risk-disposed"');
        expect(riskReopenSource).toContain('"risk-replay-stable"');
        expect(riskReopenSource).toContain('"risk-idempotency-conflict"');
        expect(smokeProfileSource.match(/runRiskReopenScenario\(/g)).toHaveLength(1);
    });

    it("dispatches mail-race to one scenario module", () => {
        expect(smokeProfileSource).toContain('from "./scenarios/mail.js"');
        expect(smokeProfileSource).toContain("await runMailRaceScenario(runtime);");
        expect(smokeProfileSource.match(/runMailRaceScenario\(runtime\)/g)).toHaveLength(1);
        expect(mailSource).toContain("export async function runMailRaceScenario(runtime)");
        expect(mailSource).toContain('"single-mail-terminal"');
        expect(mailSource).toContain('"stable-delivery-ids"');
        expect(mailSource).toContain('"private-body-not-projected"');
        expect(mailSource).toContain('"recipient-queue-reusable"');
    });

    it("copies the probe tree and keeps shared support exports bounded", () => {
        expect(smokeProfileSource).toContain("cp(probeSourceDir, probeDir");
        expect(smokeProfileSource).toContain('from "./probe/support.js"');
        expect(smokeSupportSource.match(/^export function /gm)).toHaveLength(2);
        expect(smokeSupportSource).toContain("createProbeSupport(outputPath)");
    });
});
