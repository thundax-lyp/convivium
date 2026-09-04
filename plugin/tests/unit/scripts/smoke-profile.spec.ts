import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    createSmokeEnvironment,
    loadSmokeApiKey,
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

    it("injects only the explicitly loaded DeepSeek credential", () => {
        const environment = createSmokeEnvironment(
            { PATH: "/bin", DEEPSEEK_API_KEY: "inherited" },
            { DSH_HOME: "/smoke", DEEPSEEK_API_KEY: "override" },
            "dev-key"
        );

        expect(environment).toEqual({
            PATH: "/bin",
            DSH_HOME: "/smoke",
            DEEPSEEK_API_KEY: "dev-key"
        });
    });
});

describe("loadSmokeApiKey", () => {
    it("loads the only required value from dev.env", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-smoke-env-"));
        const path = join(root, "dev.env");
        try {
            await writeFile(path, "# local secret\nDEEPSEEK_API_KEY=dev-key\n", "utf8");
            await expect(loadSmokeApiKey(path)).resolves.toBe("dev-key");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it.each([
        ["empty", "DEEPSEEK_API_KEY=\n", "dev.env DEEPSEEK_API_KEY must not be empty."],
        ["missing", "OTHER=value\n", "dev.env must define only DEEPSEEK_API_KEY."],
        [
            "extra",
            "DEEPSEEK_API_KEY=dev-key\nOTHER=value\n",
            "dev.env must define only DEEPSEEK_API_KEY."
        ]
    ])("rejects %s dev.env content", async (_case, content, message) => {
        const root = await mkdtemp(join(tmpdir(), "convivium-smoke-env-"));
        const path = join(root, "dev.env");
        try {
            await writeFile(path, content, "utf8");
            await expect(loadSmokeApiKey(path)).rejects.toThrow(message);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describe("smoke profile scenario guard", () => {
    it("loads dev.env for the DSH Host without exposing it to setup commands", () => {
        expect(smokeProfileSource).toContain(
            'loadSmokeApiKey(resolve(pluginRoot, "..", "dev.env"))'
        );
        expect(smokeProfileSource).toContain("await installArtifact(env, artifact);");
        expect(smokeProfileSource).toContain("await installProbe(env, probeDir);");
        expect(smokeProfileSource).toContain("await dumpConfig(env, patchPath, logsDir);");
        expect(smokeProfileSource).toContain(
            "const hostEnv = createSmokeEnvironment(env, {}, deepSeekApiKey);"
        );
        expect(smokeProfileSource).toContain(
            "await bootHost(hostEnv, patchPath, workspaceDir, logsDir, port)"
        );
        expect(smokeProfileSource).not.toContain(
            "await bootHost(env, patchPath, workspaceDir, logsDir, port)"
        );
    });

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
        expect(smokeProfileSource).toContain("const BROWSER_SPEAKER_TIMEOUT_MS = 30 * 60 * 1000");
        expect(smokeProfileSource).toContain("BROWSER_MODE ? BROWSER_SPEAKER_TIMEOUT_MS : 60000");
        expect(probeSource).toContain('from "./scenarios/reassign.js"');
        expect(probeSource).toContain("return runReassignScenario(runtime);");
        expect(probeSource.match(/runReassignScenario\(runtime\)/g)).toHaveLength(1);
        expect(reassignSource).toContain("export async function runReassignScenario(runtime)");
        expect(reassignSource).toContain("if (runtime.browserMode)");
        expect(reassignSource).toContain('"browser-reassign-ready"');
        expect(reassignSource).toContain('"convivium-reassign-browser-message"');
        expect(reassignSource.indexOf('"user/message"')).toBeLessThan(
            reassignSource.indexOf("ctx.sessions.flush")
        );
        expect(reassignSource.indexOf("ctx.sessions.flush")).toBeLessThan(
            reassignSource.indexOf("runtime.workspace.attachSession")
        );
        expect(reassignSource.indexOf("if (runtime.browserMode)")).toBeLessThan(
            reassignSource.indexOf('"convivium_reassign_turn"')
        );
        expect(reassignSource).toContain('"old-attempt-revoked"');
        expect(reassignSource).toContain('"old-activation-drained"');
        expect(reassignSource).toContain('"replacement-attempt-submitted"');
        expect(reassignSource).toContain('"transcript-preserved"');
    });

    it("validates the exact reassign browser-ready result", () => {
        const result = {
            ok: true,
            scenario: "reassign",
            browserReady: true,
            assertions: ["browser-reassign-ready"],
            meetingId: "meeting-1",
            observed: {
                oldAttemptId: "attempt-1",
                currentSpeakerId: "participant-a",
                currentAttemptId: "attempt-1",
                meetingVersion: 2
            }
        };
        expect(validateScenarioResult(result, "reassign")).toEqual(result);
        for (const malformed of [
            { ...result, assertions: [] },
            { ...result, assertions: ["wrong"] },
            { ...result, assertions: ["browser-reassign-ready", "extra"] },
            { ...result, extra: true },
            { ...result, observed: { ...result.observed, extra: true } },
            { ...result, meetingId: "" },
            { ...result, observed: { ...result.observed, oldAttemptId: "" } },
            { ...result, observed: { ...result.observed, currentAttemptId: "attempt-2" } },
            { ...result, observed: { ...result.observed, currentSpeakerId: "participant-b" } },
            { ...result, observed: { ...result.observed, meetingVersion: -1 } },
            { ...result, observed: { ...result.observed, meetingVersion: 1.5 } }
        ]) {
            expect(() => validateScenarioResult(malformed, "reassign")).toThrow(
                "Reassign browser-ready result is invalid."
            );
        }
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
