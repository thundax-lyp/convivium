import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDecisionRiskClosureScenario } from "../../../scripts/smoke-profile/probe/scenarios/decision-risk-closure.js";

import {
    createSmokeEnvironment,
    loadSmokeApiKey,
    loadMeetingStatusSchema,
    selectScenarios,
    CORE_SCENARIOS,
    SMOKE_SCENARIOS,
    validateScenarioResult
} from "../../../scripts/smoke-profile/index.mjs";
import { createConvergenceFixture } from "./convergence-fixture.js";

it("selects core, full and isolated diagnostic runs without ambiguous options", () => {
    expect(selectScenarios([], undefined, false)).toEqual(CORE_SCENARIOS);
    expect(selectScenarios(["--all"], undefined, false)).toEqual(SMOKE_SCENARIOS);
    expect(selectScenarios(["--json"], "cold-rebind", false)).toEqual(["cold-rebind"]);
    expect(selectScenarios([], undefined, true)).toEqual(["baseline"]);
    expect(selectScenarios([], "reassign", true)).toEqual(["reassign"]);
    expect(selectScenarios([], "scribe-minutes", false)).toEqual(["scribe-minutes"]);
    expect(selectScenarios([], "scribe-minutes", true)).toEqual(["scribe-minutes"]);
    expect(SMOKE_SCENARIOS).toHaveLength(16);
    expect(CORE_SCENARIOS).toHaveLength(5);
    expect(() => selectScenarios(["--all"], "baseline", false)).toThrow();
    expect(() => selectScenarios(["--all"], undefined, true)).toThrow();
    expect(() => selectScenarios(["--unknown"], undefined, false)).toThrow();
    expect(() => selectScenarios([], "convergence-reset", false)).toThrow();
});

it("loads the formal archived DTO schema from an isolated temporary bundle", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "convivium-schema-test-"));
    try {
        const schema = await loadMeetingStatusSchema(outDir);
        const fixture = createConvergenceFixture("convergence-stalled");
        expect(() => validateScenarioResult(fixture, fixture.scenario, schema)).not.toThrow();
        Reflect.deleteProperty(fixture.observed.archived.archive.package, "objectiveContract");
        expect(() => validateScenarioResult(fixture, fixture.scenario, schema)).toThrow(
            "Convergence runtime result is invalid."
        );
    } finally {
        await rm(outDir, { recursive: true, force: true });
    }
});

const smokeProfileSource = readFileSync(
    new URL("../../../scripts/smoke-profile/index.mjs", import.meta.url),
    "utf8"
);

it("keeps Browser cleanup alive through repeated forwarded stop signals", async () => {
    const moduleUrl = new URL("../../../scripts/smoke-profile/index.mjs", import.meta.url).href;
    const child = spawn(
        process.execPath,
        [
            "--input-type=module",
            "-e",
            `
        import { waitForBrowserStop } from ${JSON.stringify(moduleUrl)};
        const keepAlive = setInterval(() => {}, 1000);
        const stopped = waitForBrowserStop();
        console.log('ready');
        await stopped;
        console.log('cleaning');
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('cleanup=ok');
        clearInterval(keepAlive);
    `
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
        output += String(chunk);
        if (String(chunk).includes("ready")) child.kill("SIGINT");
        if (String(chunk).includes("cleaning")) child.kill("SIGTERM");
    });
    try {
        const result = await once(child, "exit");
        expect(result).toEqual([0, null]);
        expect(output).toContain("cleanup=ok");
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
});
const browserClientPreflightSource = readFileSync(
    new URL("../../../scripts/smoke-profile/browser-client-preflight.mjs", import.meta.url),
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

describe("isolated smoke environment", () => {
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

describe("smoke credential loading", () => {
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
    it("uses the one preflight seam before browser output", () => {
        const preflightCall =
            "await assertBrowserClientPreflight(origin, globalThis.fetch, BOOT_TIMEOUT_MS)";
        expect(smokeProfileSource).toContain('from "./browser-client-preflight.mjs"');
        expect(smokeProfileSource.match(/assertBrowserClientPreflight\(/g)).toHaveLength(1);
        expect(smokeProfileSource).toContain(preflightCall);
        expect(smokeProfileSource.indexOf(preflightCall)).toBeLessThan(
            smokeProfileSource.indexOf("console.log(JSON.stringify(result))")
        );
        expect(browserClientPreflightSource).toContain(
            [
                "export async function assertBrowserClientPreflight(",
                "    origin,",
                "    fetchImpl = globalThis.fetch,",
                "    timeoutMs",
                ")"
            ].join("\n")
        );
        expect(browserClientPreflightSource).toContain(
            "fail(`${label} returned HTTP ${response.status}`)"
        );
        expect(browserClientPreflightSource).toContain('"window.__ModuleLoader__.load"');
    });

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
            validateScenarioResult(
                {
                    ok: true,
                    scenario: "baseline",
                    assertions: ["attendance-reject-tool-zero-effects"]
                },
                "baseline"
            ).ok
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
        expect(() => selectScenarios([], "unknown", false)).toThrow(
            "Unsupported CONVIVIUM_SMOKE_SCENARIO"
        );
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
        expect(smokeProfileSource).toContain("const BROWSER_SPEAKER_TIMEOUT_MS = 5 * 60 * 1000");
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
            captainSessionId: "convivium-smoke-captain",
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
            { ...result, captainSessionId: "" },
            { ...result, captainSessionId: "other-session" },
            (() => {
                const { captainSessionId: _captainSessionId, ...missing } = result;
                return missing;
            })(),
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

    it("copies the probe tree and imports shared support", () => {
        expect(smokeProfileSource).toContain("cp(probeSourceDir, probeDir");
        expect(smokeProfileSource).toContain('from "./probe/support.js"');
        expect(smokeSupportSource).toContain("createProbeSupport(outputPath)");
    });
});

describe("convergence runtime selector wiring", () => {
    it.each([
        ["convergence-stalled", "runConvergenceStalledScenario"],
        ["convergence-turn-budget-completion", "runConvergenceTurnBudgetCompletionScenario"]
    ])("wires %s to %s without automatic participant submissions", (scenario, name) => {
        expect(smokeProfileSource).toContain('"' + scenario + '"');
        expect(probeSource).toContain('scenario !== "' + scenario + '"');
        expect(probeSource).toContain('case "' + scenario + '":');
        expect(probeSource.split("return " + name + "(runtime);")).toHaveLength(2);
        expect(convergenceSource).toContain("export async function " + name + "(runtime)");
        const driver = probeSource.slice(
            probeSource.indexOf("async function driveParticipant"),
            probeSource.indexOf("async function driveParticipant") + 900
        );
        expect(driver).toContain('scenario === "' + scenario + '"');
        expect(convergenceSource).not.toContain("runtime.setMeetingId(");
    });
});

describe("local decision risk browser fixture", () => {
    afterEach(() => vi.restoreAllMocks());
    function fixture() {
        const order: string[] = [];
        const candidates = [
            "Accept the closure proposal",
            "Accept the replacement closure proposal"
        ].map((statement, i) => ({
            id: `candidate-${i + 1}`,
            statement,
            proposalId: "delivery-1-proposal-1",
            proposalRevision: 1,
            sourceMessageId: "message-1"
        }));
        const pending = {
            pendingDecisionCandidates: candidates,
            risks: [
                {
                    id: "risk-1",
                    title: "Closure risk",
                    status: "open",
                    disposition: "blocking",
                    blocking: true,
                    riskLevel: "high"
                }
            ]
        };
        const paused: typeof pending & {
            status: string;
            acceptedDecisions: unknown[];
            currentAttemptId?: string;
        } = { ...structuredClone(pending), status: "paused", acceptedDecisions: [] };
        const runtime = {
            browserMode: true,
            scenario: "decision-risk-closure",
            ctx: {
                sessions: {
                    flush: vi.fn(async () => {
                        order.push("flush");
                    })
                }
            },
            captain: {
                agent: {
                    session: {
                        id: "convivium-smoke-captain",
                        append: vi.fn(() => {
                            order.push("append");
                        })
                    }
                }
            },
            workspace: {
                attachSession: vi.fn(async () => {
                    order.push("attach");
                })
            } as { attachSession: ReturnType<typeof vi.fn> } | undefined,
            createInput: () => ({
                objectiveContract: { acceptableRiskLevel: "low" },
                agenda: [{}]
            }),
            waitForAgent: async () => ({ id: "manager-1" }),
            waitForStoredManagerContext: async () => ({
                planningAttemptId: "planning-1",
                meetingVersion: 1
            }),
            waitForSpeakerContext: async () => ({
                agent: { id: "participant-session-1" },
                value: {
                    turn: { id: "turn-1" },
                    step: { id: "step-1" },
                    attempt: { attemptId: "attempt-1", deliveryId: "delivery-1" },
                    activeAgendaItem: { id: "agenda-1" }
                }
            }),
            assert(condition: unknown, message: string) {
                if (!condition) throw new Error(message);
            },
            setMeetingId: vi.fn(),
            writeResult: vi.fn(async () => {
                order.push("writeResult");
            }),
            callTool: vi.fn(
                async (
                    _ctx: unknown,
                    _agent: unknown,
                    _name: string,
                    _input: unknown,
                    id: number
                ) => {
                    order.push(String(id));
                    switch (id) {
                        case 1100:
                            return { result: { meetingId: "meeting-1" } };
                        case 1101:
                            return { result: { activeAgendaItem: { id: "agenda-1" } } };
                        case 1102:
                            return { result: { firstAttemptId: "attempt-1" } };
                        case 1103:
                            return { result: { messageId: "message-1" } };
                        case 1104:
                            return { meetingVersion: 3, result: pending };
                        case 1190:
                            return { meetingVersion: 4, result: { status: "paused" } };
                        case 1191:
                            return { meetingVersion: 4, result: paused };
                        default:
                            throw new Error(`Unexpected tool call ${id}`);
                    }
                }
            )
        };
        return { runtime, order, pending, paused };
    }
    const ready = () => ({
        ok: true,
        scenario: "decision-risk-closure",
        browserReady: true,
        assertions: ["browser-local-decision-risk-ready"],
        meetingId: "meeting-1",
        captainSessionId: "convivium-smoke-captain",
        observed: {
            meetingVersion: 4,
            status: "paused",
            candidateId: "candidate-1",
            replacementCandidateId: "candidate-2",
            riskId: "risk-1",
            evidenceMessageId: "message-1"
        }
    });
    it("pauses before exposing exact ready IDs and performs no later control writes", async () => {
        const { runtime, order } = fixture();
        await runDecisionRiskClosureScenario(runtime);
        expect(order).toEqual([
            "1100",
            "1101",
            "1102",
            "1103",
            "1104",
            "1190",
            "1191",
            "append",
            "flush",
            "attach",
            "writeResult"
        ]);
        const submission = runtime.callTool.mock.calls.find((call) => call[4] === 1103)![3];
        expect(submission).toMatchObject({
            changes: {
                decisionProposals: [
                    { statement: "Accept the closure proposal" },
                    { statement: "Accept the replacement closure proposal" }
                ],
                issues: [
                    {
                        title: "Closure risk",
                        affectedOutputIds: [],
                        affectedCriterionIds: ["criterion-smoke-order"],
                        violatedConstraintIds: [],
                        impact: "high",
                        urgency: "now",
                        safeDefaultAvailable: false,
                        riskLevel: "high"
                    }
                ]
            }
        });
        expect(runtime.callTool.mock.calls.find((call) => call[4] === 1190)![3]).toEqual({
            protocolVersion: 1,
            meetingId: "meeting-1",
            expectedMeetingVersion: 3,
            requestId: "smoke-local-browser-pause",
            reason: "Prepare local browser controls"
        });
        expect(runtime.captain.agent.session.append).toHaveBeenCalledWith(
            "user/message",
            {
                id: "convivium-local-control-browser-message",
                role: "user",
                content: [{ type: "text", text: "Local decision risk browser evidence" }],
                source: { kind: "user" }
            },
            { surfaceOp: "append" }
        );
        expect(runtime.ctx.sessions.flush).toHaveBeenCalledWith(runtime.captain.agent.session);
        expect(runtime.workspace!.attachSession).toHaveBeenCalledWith("convivium-smoke-captain");
        expect(runtime.setMeetingId).toHaveBeenCalledWith("meeting-1");
        expect(runtime.writeResult).toHaveBeenCalledExactlyOnceWith(ready());
    });
    it.each([
        "missing-candidate",
        "foreign-source",
        "risk-not-open",
        "active-attempt",
        "missing-workspace"
    ])("rejects %s without publishing ready", async (fault) => {
        const { runtime, pending, paused } = fixture();
        if (fault === "missing-candidate") pending.pendingDecisionCandidates.pop();
        if (fault === "foreign-source")
            pending.pendingDecisionCandidates[1]!.sourceMessageId = "external";
        if (fault === "risk-not-open") pending.risks[0]!.status = "accepted_risk";
        if (fault === "active-attempt") paused.currentAttemptId = "attempt-1";
        if (fault === "missing-workspace") runtime.workspace = undefined;
        await expect(runDecisionRiskClosureScenario(runtime)).rejects.toThrow();
        expect(runtime.writeResult).not.toHaveBeenCalled();
    });
    it("retains the ordinary single-candidate input and continues the Captain flow", async () => {
        const { runtime, pending } = fixture();
        runtime.browserMode = false;
        pending.pendingDecisionCandidates.pop();
        // The fake deliberately rejects the first Captain acceptance, proving the branch continues there.
        await expect(runDecisionRiskClosureScenario(runtime)).rejects.toThrow(
            "Unexpected tool call 1105"
        );
        const submission = runtime.callTool.mock.calls.find((call) => call[4] === 1103)![3] as {
            changes: { decisionProposals: unknown[]; issues: unknown[] };
        };
        expect(submission.changes.decisionProposals).toHaveLength(1);
        expect(submission.changes.issues).toEqual([]);
        expect(runtime.callTool.mock.calls.at(-1)![2]).toBe("convivium_accept_decision");
        expect(runtime.writeResult).not.toHaveBeenCalled();
    });
    it("accepts only the exact browser-ready contract", () => {
        const value = ready();
        expect(validateScenarioResult(value, value.scenario)).toBe(value);
        const mutations: ((value: Record<string, unknown>) => void)[] = [
            ...Object.keys(value).map((key) => (v: Record<string, unknown>) => {
                delete v[key];
            }),
            (v) => {
                v.extra = true;
            },
            (v) => {
                v.observed = null;
            },
            (v) => {
                v.meetingId = "";
            },
            (v) => {
                v.captainSessionId = "other";
            },
            (v) => {
                v.assertions = ["wrong"];
            },
            ...Object.keys(value.observed).map((key) => (v: Record<string, unknown>) => {
                delete (v.observed as Record<string, unknown>)[key];
            }),
            ...["candidateId", "replacementCandidateId", "riskId", "evidenceMessageId"].flatMap(
                (key) =>
                    ["", " ", null, 1].map((bad) => (v: Record<string, unknown>) => {
                        (v.observed as Record<string, unknown>)[key] = bad;
                    })
            ),
            ...[-1, 1.5].map((bad) => (v: Record<string, unknown>) => {
                (v.observed as Record<string, unknown>).meetingVersion = bad;
            }),
            (v) => {
                (v.observed as Record<string, unknown>).extra = true;
            },
            (v) => {
                (v.observed as Record<string, unknown>).status = "running";
            },
            (v) => {
                (v.observed as Record<string, unknown>).replacementCandidateId = "candidate-1";
            }
        ];
        for (const mutate of mutations) {
            const invalid = structuredClone(value);
            mutate(invalid);
            expect(() => validateScenarioResult(invalid, value.scenario)).toThrow();
        }
        const invalid = ready();
        invalid.observed.status = "running";
        expect(() => validateScenarioResult(invalid, value.scenario)).toThrow(
            "Local decision risk browser-ready result is invalid."
        );
    });
});
