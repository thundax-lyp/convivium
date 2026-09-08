import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
    roleCompositionDefinitions,
    roleCompositionModelOverrides
} from "../../fixtures/role-composition.js";
import {
    roleSmokeDefinitions,
    roleSmokeModelOverrides
} from "../../../scripts/smoke-profile/probe/role-definitions.js";
import {
    selectScenarios,
    CORE_SCENARIOS,
    SMOKE_SCENARIOS,
    validateScenarioResult
} from "../../../scripts/smoke-profile/index.mjs";
import { validateColdCheckpoint } from "../../../scripts/smoke-profile/probe/support.js";

const wrapper = readFileSync(
    new URL("../../../scripts/smoke-profile/index.mjs", import.meta.url),
    "utf8"
);
const probe = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/index.js", import.meta.url),
    "utf8"
);
const recovery = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/recovery.js", import.meta.url),
    "utf8"
);
const assertions = [
    "phase1-checkpoint-durable",
    "host-pid-changed",
    "exact-parent-rebound",
    "transcript-prefix-preserved",
    "cold-followup-submitted",
    "role-persona-isolated",
    "role-tool-execution-denied",
    "role-parent-unmodified",
    "role-cold-config-v1-preserved"
];
const result = {
    ok: true,
    scenario: "role-composition",
    assertions,
    observed: {
        phase1HostPid: 1,
        phase2HostPid: 2,
        roleComposition: {
            phase1Checked: true,
            phase2Checked: true,
            managerPersona:
                "FR14_MANAGER_V1\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：fr14-fixture。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。",
            participantPersona:
                "FR14_PARTICIPANT_V1\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：fr14-fixture。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。",
            phase2ConfiguredVersion: "2.0.0",
            deniedTool: "convivium_role_probe",
            deniedBodyCalls: 0
        }
    }
};

describe("role composition smoke contract", () => {
    it("is explicitly selectable, outside core, and rejects Browser mode", () => {
        expect(selectScenarios([], "role-composition", false)).toEqual(["role-composition"]);
        expect(SMOKE_SCENARIOS).toContain("role-composition");
        expect(CORE_SCENARIOS).not.toContain("role-composition");
        expect(() => selectScenarios([], "role-composition", true)).toThrow();
    });
    it("preserves role identity while changing configuration for cold restart", () => {
        expect(roleSmokeDefinitions("1")).toEqual(roleCompositionDefinitions);
        expect(roleSmokeDefinitions("2")).toEqual(
            roleCompositionDefinitions.map((d) => ({
                ...d,
                definitionVersion: "2.0.0",
                roleDescription: d.roleDescription.replace("V1", "V2")
            }))
        );
        expect(roleSmokeModelOverrides("1")).toEqual(roleCompositionModelOverrides);
        expect(roleSmokeModelOverrides("2")).toEqual(
            Object.fromEntries(
                Object.entries(roleCompositionModelOverrides).map(([id, options]) => [
                    id,
                    { ...options, model: options.model.replace("v1", "v2") }
                ])
            )
        );
        expect(() => roleSmokeModelOverrides("3")).toThrow(TypeError);
        const fresh = roleSmokeDefinitions("1");
        fresh[0].requiredSkillNames.push("changed");
        expect(roleSmokeDefinitions("1")).toEqual(roleCompositionDefinitions);
        for (const value of [undefined, 1, "3", ""])
            expect(() => roleSmokeDefinitions(value)).toThrow(TypeError);
    });
    it("runs the actual participant driver without any automatic tool calls", async () => {
        const a = probe.indexOf("async function driveParticipant(ctx, agent) {");
        const b = probe.indexOf("function scheduleParticipant(ctx, agent)", a);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThan(a);
        const callTool = vi.fn();
        const drive = runInNewContext(probe.slice(a, b) + "\ndriveParticipant", {
            scenario: "role-composition",
            captain: { agent: {} },
            meetingId: "meeting",
            participants: ["participant-a"],
            callTool,
            nextCall: 1
        });
        await drive({}, { id: "meeting-participant-a" });
        expect(callTool).not.toHaveBeenCalled();
    });
    it("isolates role configuration and cleanup across Host restarts", async () => {
        const a = wrapper.indexOf("async function writeSmokePatch(");
        const b = wrapper.indexOf("async function writeProbePackage(", a);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThan(a);
        const writeFile = vi.fn();
        const writePatch = runInNewContext(wrapper.slice(a, b) + "\nwriteSmokePatch", {
            writeFile,
            dirname,
            join,
            PROVIDER: "spawn",
            BROWSER_MODE: false,
            roleSmokeDefinitions,
            roleSmokeModelOverrides
        });
        await writePatch("patch", "role-composition", "1");
        await writePatch("patch", "role-composition", "2");
        for (const [i, phase] of ["1", "2"].entries()) {
            const yaml = writeFile.mock.calls[i][1];
            const modelRaw = yaml.split("\n").find((line) => line.includes("agentModelOverrides:"));
            expect(JSON.parse(modelRaw.slice(modelRaw.indexOf(":") + 1))).toEqual(
                roleSmokeModelOverrides(phase)
            );
            const raw = yaml.split("\n").find((line) => line.includes("agentDefinitions:"));
            expect(JSON.parse(raw.slice(raw.indexOf(":") + 1))).toEqual(
                roleSmokeDefinitions(phase)
            );
        }
        expect(wrapper).toContain('await writeSmokePatch(patchPath, scenario, "2")');
        expect(wrapper).toContain('hostEnv.CONVIVIUM_SMOKE_COLD_PHASE = "2"');
        expect(wrapper).toContain("await restore();");
        expect(wrapper).toContain("await restore(buildRoot);");
        expect(probe).toContain("await ctx.agents.create(");
        expect(recovery).toContain("await ctx.agents.resume(");
        expect(recovery).toContain("checkpoint.scenario === scenario");
    });
    it("installs a packed probe so its declared dependencies are resolved", async () => {
        const a = wrapper.indexOf("async function installProbe(");
        const b = wrapper.indexOf("async function dumpConfig(", a);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThan(a);
        const runCommand = vi.fn().mockResolvedValue({ stdout: '{"filename":"probe.tgz"}' });
        const access = vi.fn();
        const install = runInNewContext(wrapper.slice(a, b) + "\ninstallProbe", {
            runCommand,
            access,
            constants: { R_OK: 4 },
            resolve: (...parts) => parts.join("/"),
            basename: (name) => name,
            PROFILE: "smoke",
            dshCommand: (args) => ({ command: "dsh", args })
        });
        const env = { DSH_HOME: "/temp/home" };
        await install(env, "/temp/probe");
        expect(runCommand.mock.calls[0]).toEqual([
            "pnpm",
            ["pack", "--json", "--pack-destination", "/temp/probe/.."],
            { cwd: "/temp/probe", env }
        ]);
        expect(access).toHaveBeenCalledWith("/temp/probe/../probe.tgz", 4);
        expect(runCommand.mock.calls[1]).toEqual([
            "dsh",
            ["plugin", "--profile", "smoke", "add", "/temp/probe/../probe.tgz"],
            { env }
        ]);
    });
    it("rejects unchecked or foreign checkpoint scenarios while retaining the existing contract", () => {
        const checkpoint = {
            schemaVersion: 1,
            scenario: "role-composition",
            phase: 1,
            roleCompositionChecked: true,
            hostPid: 10,
            captainSessionId: "convivium-smoke-captain",
            meetingId: "m",
            meetingVersion: 2,
            managerSessionId: "manager",
            participantSessionId: "participant",
            sessionIds: ["manager", "participant"],
            transcriptMessageIds: ["message"],
            managerPlanningAttemptId: "plan",
            managerPlanningMeetingVersion: 2
        };
        expect(validateColdCheckpoint(checkpoint).roleCompositionChecked).toBe(true);
        expect(() =>
            validateColdCheckpoint({ ...checkpoint, roleCompositionChecked: false })
        ).toThrow();
        expect(() => validateColdCheckpoint({ ...checkpoint, scenario: "unknown" })).toThrow();
        expect(validateColdCheckpoint({ ...checkpoint, scenario: "cold-rebind" }).scenario).toBe(
            "cold-rebind"
        );
    });
    it("validates cold role isolation and denies restricted tool execution", () => {
        expect(validateScenarioResult(result, "role-composition")).toBe(result);
        for (const label of assertions)
            expect(() =>
                validateScenarioResult(
                    { ...result, assertions: assertions.filter((a) => a !== label) },
                    "role-composition"
                )
            ).toThrow();
        for (const [key, value] of Object.entries(result.observed.roleComposition)) {
            const invalid =
                typeof value === "boolean" ? false : typeof value === "number" ? 1 : "wrong";
            expect(() =>
                validateScenarioResult(
                    {
                        ...result,
                        observed: {
                            ...result.observed,
                            roleComposition: { ...result.observed.roleComposition, [key]: invalid }
                        }
                    },
                    "role-composition"
                )
            ).toThrow();
        }
        expect(() =>
            validateScenarioResult(
                { ...result, observed: { ...result.observed, phase2HostPid: 1 } },
                "role-composition"
            )
        ).toThrow();
    });
});
