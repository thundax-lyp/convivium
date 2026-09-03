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
const probeSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/index.js", import.meta.url),
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
const isolationSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/isolation.js", import.meta.url),
    "utf8"
);
const reassignSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/reassign.js", import.meta.url),
    "utf8"
);
const recoverySource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/recovery.js", import.meta.url),
    "utf8"
);
const archiveSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/archive.js", import.meta.url),
    "utf8"
);
const completionSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/completion.js", import.meta.url),
    "utf8"
);
const decisionRiskSource = readFileSync(
    new URL(
        "../../../scripts/smoke-profile/probe/scenarios/decision-risk-closure.js",
        import.meta.url
    ),
    "utf8"
);
const convergenceSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/convergence.js", import.meta.url),
    "utf8"
);
const baselineSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/baseline.js", import.meta.url),
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
        expect(probeSource).toContain('case "decision-risk-closure":');
        expect(probeSource).toContain("return runDecisionRiskClosureScenario(runtime);");
        expect(decisionRiskSource).toContain(
            "export async function runDecisionRiskClosureScenario(runtime)"
        );
        expect(decisionRiskSource).toContain('action: "supersede"');
        expect(decisionRiskSource).toContain('action: "revoke"');
        expect(decisionRiskSource).toContain('"decision supersede replay result mismatch"');
        expect(decisionRiskSource).toContain('"decision history does not retain both decisions"');
        expect(decisionRiskSource).toContain('"risk replay result mismatch"');
        expect(decisionRiskSource).toContain('"risk-blocking-facts"');
        expect(smokeProfileSource).not.toContain("INTERNAL_UNIMPLEMENTED");
    });

    it("keeps unknown scenario handling fail closed", () => {
        expect(probeSource).toContain('"SCENARIO_NOT_IMPLEMENTED:" + runtime.scenario');
        expect(smokeProfileSource).toContain("if (!SMOKE_SCENARIOS.includes(SMOKE_SCENARIO))");
    });

    it("dispatches risk-reopen to one scenario module", () => {
        expect(probeSource).toContain('from "./scenarios/risk-reopen.js"');
        expect(probeSource).toContain("return runRiskReopenScenario(runtime);");
        expect(riskReopenSource).toContain("export async function runRiskReopenScenario(runtime)");
        expect(riskReopenSource).toContain('"risk-disposed"');
        expect(riskReopenSource).toContain('"risk-replay-stable"');
        expect(riskReopenSource).toContain('"risk-idempotency-conflict"');
        expect(probeSource).toContain('scenario === "risk-reopen"');
        expect(probeSource).toContain('scenario === "cold-rebind"');
        expect(probeSource.match(/runRiskReopenScenario\(/g)).toHaveLength(1);
    });

    it("dispatches mail-race to one scenario module", () => {
        expect(probeSource).toContain('from "./scenarios/mail.js"');
        expect(probeSource).toContain("return runMailRaceScenario(runtime);");
        expect(probeSource.match(/runMailRaceScenario\(runtime\)/g)).toHaveLength(1);
        expect(mailSource).toContain("export async function runMailRaceScenario(runtime)");
        expect(mailSource).toContain('"single-mail-terminal"');
        expect(mailSource).toContain('"stable-delivery-ids"');
        expect(mailSource).toContain('"private-body-not-projected"');
        expect(mailSource).toContain('"recipient-queue-reusable"');
    });

    it("dispatches cross-meeting to one scenario module", () => {
        expect(probeSource).toContain('from "./scenarios/isolation.js"');
        expect(probeSource).toContain("return runCrossMeetingScenario(runtime);");
        expect(probeSource.match(/runCrossMeetingScenario\(runtime\)/g)).toHaveLength(1);
        expect(isolationSource).toContain("export async function runCrossMeetingScenario(runtime)");
        expect(isolationSource).toContain('"ownership-sets-disjoint"');
        expect(isolationSource).toContain('"meeting-a-cleanup-isolated"');
        expect(isolationSource).toContain('"meeting-b-submitted"');
        expect(isolationSource).toContain('"team-b-submitted"');
    });

    it("dispatches reassign to one scenario module", () => {
        expect(probeSource).toContain('from "./scenarios/reassign.js"');
        expect(probeSource).toContain("return runReassignScenario(runtime);");
        expect(probeSource.match(/runReassignScenario\(runtime\)/g)).toHaveLength(1);
        expect(reassignSource).toContain("export async function runReassignScenario(runtime)");
        expect(reassignSource).toContain('"old-attempt-revoked"');
        expect(reassignSource).toContain('"old-activation-drained"');
        expect(reassignSource).toContain('"replacement-attempt-submitted"');
        expect(reassignSource).toContain('"transcript-preserved"');
    });

    it("dispatches cold-rebind to one scenario module", () => {
        expect(probeSource).toContain('from "./scenarios/recovery.js"');
        expect(probeSource).toContain("return runColdRebindScenario(runtime);");
        expect(probeSource.match(/runColdRebindScenario\(runtime\)/g)).toHaveLength(1);
        expect(recoverySource).toContain("export async function runColdRebindScenario(runtime)");
        expect(recoverySource).toContain('"phase1-checkpoint-durable"');
        expect(recoverySource).toContain('"host-pid-changed"');
        expect(recoverySource).toContain('"exact-parent-rebound"');
        expect(recoverySource).toContain('"transcript-prefix-preserved"');
        expect(recoverySource).toContain('"cold-followup-submitted"');
    });

    it("dispatches archive-continuation to one scenario module", () => {
        expect(probeSource).toContain('from "./scenarios/archive.js"');
        expect(probeSource).toContain("return runArchiveContinuationScenario(runtime);");
        expect(probeSource.match(/runArchiveContinuationScenario\(runtime\)/g)).toHaveLength(1);
        expect(archiveSource).toContain(
            "export async function runArchiveContinuationScenario(runtime)"
        );
        expect(archiveSource).toContain('"source-archived"');
        expect(archiveSource).toContain('"source-sessions-drained"');
        expect(archiveSource).toContain('"continuation-final-summary-only"');
        expect(archiveSource).toContain('"target-identities-new"');
    });

    it("dispatches completion-end to one scenario module", () => {
        expect(probeSource).toContain('from "./scenarios/completion.js"');
        expect(probeSource).toContain("return runCompletionEndScenario(runtime);");
        expect(probeSource.match(/runCompletionEndScenario\(runtime\)/g)).toHaveLength(1);
        expect(completionSource).toContain(
            "export async function runCompletionEndScenario(runtime)"
        );
        expect(completionSource).toContain("Promise.allSettled");
        expect(completionSource).toContain('"single-winner"');
        expect(completionSource).toContain('"single-termination"');
        expect(completionSource).toContain('"terminal-submit-rejected"');
        expect(completionSource).toContain('"terminal-end-rejected"');
    });

    it("dispatches task-handraise to the shared completion module", () => {
        expect(probeSource).toContain("return runTaskHandraiseScenario(runtime);");
        expect(probeSource.match(/runTaskHandraiseScenario\(runtime\)/g)).toHaveLength(1);
        expect(completionSource).toContain(
            "export async function runTaskHandraiseScenario(runtime)"
        );
        expect(completionSource).toContain('"task-delivered"');
        expect(completionSource).toContain('"task-started"');
        expect(completionSource).toContain('"finish-created-handraise"');
        expect(completionSource).toContain('"handraise-visible-then-consumed"');
        expect(completionSource).toContain('"later-turn-submitted"');
    });

    it("dispatches decision-risk-closure to its lifecycle module", () => {
        expect(probeSource).toContain('from "./scenarios/decision-risk-closure.js"');
        expect(probeSource).toContain("return runDecisionRiskClosureScenario(runtime);");
        expect(probeSource.match(/runDecisionRiskClosureScenario\(runtime\)/g)).toHaveLength(1);
        expect(decisionRiskSource).toContain(
            "export async function runDecisionRiskClosureScenario(runtime)"
        );
        for (const label of [
            "candidate-visible-to-captain",
            "candidate-accepted",
            "accepted-candidate-not-pending",
            "decision-history-current-state",
            "decision-pending-by-current-revision",
            "risk-disposition-status",
            "risk-blocking-facts",
            "risk-replay-version-stable",
            "event-order-not-observable-by-command-status"
        ])
            expect(decisionRiskSource).toContain(`"${label}"`);
    });

    it("dispatches convergence to its lifecycle module", () => {
        expect(probeSource).toContain('from "./scenarios/convergence.js"');
        expect(probeSource).toContain("return runConvergenceScenario(runtime);");
        expect(probeSource.match(/runConvergenceScenario\(runtime\)/g)).toHaveLength(1);
        expect(convergenceSource).toContain(
            "export async function runConvergenceScenario(runtime)"
        );
        expect(convergenceSource).toContain('"deterministic-fallback"');
        expect(convergenceSource).toContain('"fallback-replay-idempotent"');
        expect(convergenceSource).toContain('"fallback-status-projected"');
    });

    it("dispatches baseline and timeout to one shared module", () => {
        expect(probeSource).toContain("await runSelectedScenario(runtime);");
        expect(probeSource).toContain("return runBaselineScenario(runtime);");
        expect(probeSource.match(/runBaselineScenario\(runtime\)/g)).toHaveLength(1);
        expect(baselineSource).toContain("export async function runBaselineScenario(runtime)");
        expect(baselineSource).toContain('"baseline-transcript-acb"');
        expect(baselineSource).toContain('"baseline-http-pause-resume"');
        expect(baselineSource).toContain('scenario === "timeout"');
    });

    it("copies the probe tree and keeps shared support exports bounded", () => {
        expect(smokeProfileSource).toContain("cp(probeSourceDir, probeDir");
        expect(smokeProfileSource).toContain('from "./probe/support.js"');
        expect(smokeSupportSource.match(/^export function /gm)).toHaveLength(2);
        expect(smokeSupportSource).toContain("createProbeSupport(outputPath)");
    });
});
