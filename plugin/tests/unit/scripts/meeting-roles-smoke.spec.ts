import { readFileSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
    selectScenarios,
    CORE_SCENARIOS,
    SMOKE_SCENARIOS
} from "../../../scripts/smoke-profile/index.mjs";
import { runMeetingRolesScenario } from "../../../scripts/smoke-profile/probe/scenarios/meeting-roles.js";
import { validateScenarioResult } from "../../../scripts/smoke-profile/result.mjs";
const wrapper = readFileSync(
    new URL("../../../scripts/smoke-profile/index.mjs", import.meta.url),
    "utf8"
);
const probe = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/index.js", import.meta.url),
    "utf8"
);
describe("meeting roles deployment smoke", () => {
    it("requires explicit selection and rejects Browser mode", () => {
        expect(selectScenarios([], "meeting-roles", false)).toEqual(["meeting-roles"]);
        expect(SMOKE_SCENARIOS).toHaveLength(17);
        expect(CORE_SCENARIOS).toHaveLength(5);
        expect(CORE_SCENARIOS).not.toContain("meeting-roles");
        expect(() => selectScenarios([], "meeting-roles", true)).toThrow();
    });
    it("does not let the fixture driver write on behalf of deployed participants", async () => {
        const source = probe.slice(
            probe.indexOf("async function driveParticipant(ctx, agent) {"),
            probe.indexOf("function scheduleParticipant(ctx, agent)")
        );
        const callTool = vi.fn();
        const drive = runInNewContext(source + "\ndriveParticipant", {
            scenario: "meeting-roles",
            callTool
        });
        await drive({}, {});
        expect(callTool).not.toHaveBeenCalled();
    });
    it("creates the deployed Captain with a native model selection and shared Preset", async () => {
        const create = vi.fn().mockResolvedValue({});
        const mount = vi.fn();
        const source = probe.slice(
            probe.indexOf('captain = ["role-composition", "meeting-roles"]'),
            probe.indexOf(
                "        const runtime = {",
                probe.indexOf('captain = ["role-composition", "meeting-roles"]')
            )
        );
        await runInNewContext(
            "(async () => { let captain; " + source.slice(0, source.lastIndexOf("}")) + " })()",
            {
                scenario: "meeting-roles",
                ctx: { agents: { create }, get: () => ({ mount }) },
                process: { cwd: () => "/workspace" }
            }
        );
        const config = create.mock.calls[0][0];
        expect(config.agentOptions).toEqual({
            provider: "deepseek-official",
            model: "deepseek-v4-flash"
        });
        expect(config.meta.agentPreset).toBe("convivium");
        const agentCtx = {};
        await config.setup(agentCtx);
        expect(mount).toHaveBeenCalledWith(agentCtx, "convivium");
    });
    it("loads the tarball deployment patch before the temporary control patch", async () => {
        const source = wrapper.slice(
            wrapper.indexOf("async function dumpConfig("),
            wrapper.indexOf("async function bootHost(")
        );
        const runCommand = vi.fn().mockResolvedValue({
            stdout: "@convivium/dsh-plugin @deepseek-ai/dsh-subagent-spawn-in-process spawn"
        });
        const dump = runInNewContext(source + "\ndumpConfig", {
            PROFILE: "web",
            join,
            CONVIVIUM_PACKAGE: "@convivium/dsh-plugin",
            PROVIDER: "spawn",
            dshCommand: (args) => ({ command: "dsh", args }),
            runCommand,
            writeFile: vi.fn()
        });
        await dump(
            {},
            "/temp/control.yml",
            "/temp/logs",
            "/temp/role-package/package/meeting-roles"
        );
        expect(runCommand.mock.calls[0][1]).toEqual([
            "web",
            "--patch",
            "/temp/role-package/package/meeting-roles/cordis.patch.yml",
            "--patch",
            "/temp/control.yml",
            "--dump-config"
        ]);
    });
    it("uses deployed definitions with eight participants instead of fixture definitions", async () => {
        const source = wrapper.slice(
            wrapper.indexOf("async function writeSmokePatch("),
            wrapper.indexOf("async function writeProbePackage(")
        );
        const writeFile = vi.fn();
        const writePatch = runInNewContext(source + "\nwriteSmokePatch", {
            PROVIDER: "spawn",
            BROWSER_MODE: false,
            writeFile
        });
        await writePatch("patch", "meeting-roles");
        const patch = writeFile.mock.calls[0][1];
        expect(patch).toContain("maxParticipants: 8");
        expect(patch).toContain("speakerTimeoutMs: 300000");
        expect(patch).toContain("agentDefinitions: !!js");
        expect(patch).toContain("CONVIVIUM_MEETING_ROLES_ROOT");
        expect(patch).not.toContain("agentModelOverrides");
    });
    it.each(["skill loading failed", "result timeout"])(
        "restores scenario and build resources after %s",
        async (failure) => {
            const source = wrapper.slice(
                wrapper.indexOf("async function main() {"),
                wrapper.indexOf("const isMain =")
            );
            const restore = vi.fn();
            const main = runInNewContext(source + "\nmain", {
                process: {
                    argv: ["node", "smoke"],
                    env: { CONVIVIUM_SMOKE_SCENARIO: "meeting-roles" }
                },
                selectScenarios: () => ["meeting-roles"],
                BROWSER_MODE: false,
                BOOT_TIMEOUT_MS: 30000,
                COMMAND_TIMEOUT_MS: 30000,
                validateTimeout: () => {},
                loadSmokeApiKey: async () => "private",
                resolve: join,
                pluginRoot: "/repo/plugin",
                mkdtemp: async () => "/temp/build",
                tempPrefix: "/temp/smoke-",
                packArtifact: async () => "/temp/build/artifact.tgz",
                runScenario: vi.fn().mockRejectedValue(new Error(failure)),
                restore,
                tempRoot: "/temp/scenario",
                join
            });
            await expect(main()).rejects.toThrow(failure);
            expect(restore.mock.calls).toEqual([[], ["/temp/build"]]);
        }
    );
});

const deployed = JSON.parse(
    readFileSync(new URL("../../../meeting-roles/definitions.json", import.meta.url), "utf8")
);
function deploymentResult() {
    return {
        ok: true,
        scenario: "meeting-roles",
        assertions: [
            "shared-preset-mounted",
            "nine-independent-sessions",
            "nine-native-skills-loaded",
            "research-tools-operational",
            "meeting-authority-preserved"
        ],
        observed: {
            presetId: "convivium",
            definitionCount: 9,
            participantCount: 8,
            skillLoads: deployed.definitions.map(
                (d: { roleDefinitionId: string; requiredSkillNames: string[] }) => ({
                    roleDefinitionId: d.roleDefinitionId,
                    skillName: d.requiredSkillNames[0],
                    sessionId: "meeting-" + d.roleDefinitionId,
                    loaded: true
                })
            ),
            research: [
                "github_research_analyst",
                "arxiv_research_analyst",
                "web_research_analyst"
            ].map((roleDefinitionId) => ({ roleDefinitionId, search: true, fetch: true })),
            deniedMeetingWrites: 2,
            deniedPresetTools: 2
        }
    };
}
describe("meeting roles evidence result", () => {
    it("accepts all nine distinct roles and three successful research scopes", () => {
        const result = deploymentResult();
        expect(validateScenarioResult(result, "meeting-roles")).toBe(result);
    });
    it.each([
        "missing assertion",
        "missing skill",
        "duplicate session",
        "duplicate role",
        "skill failure",
        "wrong skill",
        "research missing",
        "search failure",
        "fetch failure",
        "missing denials",
        "wrong count",
        "missing observed"
    ])("rejects %s", (failure) => {
        const result = deploymentResult();
        switch (failure) {
            case "missing assertion":
                result.assertions.pop();
                break;
            case "missing skill":
                result.observed.skillLoads.pop();
                break;
            case "duplicate session":
                result.observed.skillLoads[8].sessionId = result.observed.skillLoads[0].sessionId;
                break;
            case "duplicate role":
                result.observed.skillLoads[8].roleDefinitionId =
                    result.observed.skillLoads[0].roleDefinitionId;
                break;
            case "skill failure":
                result.observed.skillLoads[0].loaded = false;
                break;
            case "wrong skill":
                result.observed.skillLoads[0].skillName = "other";
                break;
            case "research missing":
                result.observed.research.pop();
                break;
            case "search failure":
                result.observed.research[0].search = false;
                break;
            case "fetch failure":
                result.observed.research[0].fetch = false;
                break;
            case "missing denials":
                result.observed.deniedPresetTools = 1;
                break;
            case "wrong count":
                result.observed.participantCount = 7;
                break;
            case "missing observed":
                Reflect.deleteProperty(result, "observed");
                break;
        }
        expect(() => validateScenarioResult(result, "meeting-roles")).toThrow(
            "Meeting roles smoke result is invalid"
        );
    });
});

const scenarioSource = readFileSync(
    new URL("../../../scripts/smoke-profile/probe/scenarios/meeting-roles.js", import.meta.url),
    "utf8"
);
describe("native Skill loading evidence", () => {
    const loaded = runInNewContext(
        scenarioSource.slice(
            scenarioSource.indexOf("function loadedSkill("),
            scenarioSource.indexOf("export async function")
        ) + "\nloadedSkill"
    );
    const assert = (condition: boolean, message: string) => {
        if (!condition) throw new Error(message);
    };
    const methods = ["method 1", "method 2", "method 3", "method 4"];
    function events() {
        return [
            {
                type: "tool/call",
                seq: 10,
                time: 100,
                data: { name: "skill", arguments: '{"name":"required"}', callId: "call-1" }
            },
            {
                type: "tool/result",
                seq: 11,
                time: 101,
                data: {
                    message: {
                        content: [
                            {
                                type: "tool-result",
                                toolCallId: "call-1",
                                isError: false,
                                content: [{ type: "text", text: methods.join("\n") }]
                            }
                        ]
                    }
                }
            },
            {
                type: "assistant/message",
                seq: 12,
                time: 102,
                data: { message: { content: [{ type: "text", text: "ROLE_READY" }] } }
            }
        ];
    }
    it("requires a paired successful load followed by the assistant reply", () => {
        expect(loaded(events(), "required", methods, 100, 9, assert)).toBe(true);
        expect(loaded(events().slice(1), "required", methods, 100, 9, assert)).toBe(false);
        expect(loaded(events().slice(0, 2), "required", methods, 100, 9, assert)).toBe(false);
        expect(loaded(events(), "another-skill", methods, 100, 9, assert)).toBe(false);
    });
    it("rejects history from before this probe and another call's result", () => {
        expect(loaded(events(), "required", methods, 103, 9, assert)).toBe(false);
        expect(loaded(events(), "required", methods, 100, 12, assert)).toBe(false);
        const unmatched = JSON.parse(JSON.stringify(events()));
        unmatched[1].data.message.content[0].toolCallId = "other";
        expect(loaded(unmatched, "required", methods, 100, 9, assert)).toBe(false);
    });
    it("fails immediately when the native turn ends with an error", () => {
        const failed = [
            {
                type: "turn/end",
                seq: 10,
                time: 100,
                data: { reason: { kind: "error", error: { code: "UNKNOWN" } } }
            }
        ];
        expect(() => loaded(failed, "required", methods, 100, 9, assert)).toThrow(
            "Native role turn failed before Skill confirmation: required"
        );
        expect(loaded(failed, "required", methods, 101, 9, assert)).toBe(false);
    });
    it("fails on tool errors or missing method content", () => {
        const failed = JSON.parse(JSON.stringify(events()));
        failed[1].data.message.content[0].isError = true;
        expect(() => loaded(failed, "required", methods, 100, 9, assert)).toThrow(
            "Native Skill loading failed"
        );
        expect(() => loaded(events(), "required", [...methods, "missing"], 100, 9, assert)).toThrow(
            "Native Skill methods missing"
        );
    });
    it("does not treat reasoning or an interrupted reply as ROLE_READY", () => {
        const interrupted = JSON.parse(JSON.stringify(events()));
        interrupted[2].data.interrupted = true;
        expect(loaded(interrupted, "required", methods, 100, 9, assert)).toBe(false);
        interrupted[2].data.interrupted = false;
        interrupted[2].data.message.content[0].type = "reasoning";
        expect(loaded(interrupted, "required", methods, 100, 9, assert)).toBe(false);
    });
    it("aborts and rejects a probe that never completes", async () => {
        vi.useFakeTimers();
        try {
            const bounded = runInNewContext(
                scenarioSource.slice(
                    scenarioSource.indexOf("async function bounded("),
                    scenarioSource.indexOf("function loadedSkill(")
                ) + "\nbounded",
                { AbortController, setTimeout, clearTimeout }
            );
            let signal: AbortSignal | undefined;
            const pending = bounded(180000, (value: AbortSignal) => {
                signal = value;
                return new Promise(() => {});
            });
            const rejected = expect(pending).rejects.toThrow("Meeting roles probe timed out");
            await vi.advanceTimersByTimeAsync(180000);
            await rejected;
            expect(signal?.aborted).toBe(true);
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("native deployment patch composition", () => {
    it("preserves packaged definitions and runtime controls with separate profile and asset roots", async () => {
        const nativeRequire = createRequire(import.meta.resolve("@deepseek-ai/dsh-agent-presets"));
        const { applyEntryPatches, entryListSchema } = await import(
            nativeRequire.resolve("@deepseek-ai/cordis-plugin-include")
        );
        const { interpolate } = await import(
            nativeRequire.resolve("@deepseek-ai/cordis-plugin-loader")
        );
        const { load } = nativeRequire("js-yaml");
        const root = await mkdtemp(join(tmpdir(), "convivium-role-composition-"));
        try {
            const assets = join(root, "resources/meeting-roles");
            await cp(fileURLToPath(new URL("../../../meeting-roles", import.meta.url)), assets, {
                recursive: true
            });
            const deployment = load(readFileSync(join(assets, "cordis.patch.yml"), "utf8"), {
                schema: entryListSchema
            });
            const writeFile = vi.fn();
            const source = wrapper.slice(
                wrapper.indexOf("async function writeSmokePatch("),
                wrapper.indexOf("async function writeProbePackage(")
            );
            const writePatch = runInNewContext(source + "\nwriteSmokePatch", {
                PROVIDER: "spawn",
                BROWSER_MODE: false,
                writeFile
            });
            await writePatch("control", "meeting-roles");
            const control = load(writeFile.mock.calls[0][1], { schema: entryListSchema });
            const warnings = vi.fn();
            const rows = applyEntryPatches(
                [
                    { id: "agent-presets", config: { default: "standard" } },
                    { id: "convivium", config: { provider: "spawn" } }
                ],
                [...deployment, ...control],
                warnings
            );
            expect(warnings).not.toHaveBeenCalled();
            const context = {
                baseUrl: pathToFileURL(join(root, "profile/")).href,
                process: {
                    getBuiltinModule: process.getBuiltinModule,
                    env: { CONVIVIUM_MEETING_ROLES_ROOT: assets }
                }
            };
            const preset = interpolate(context, rows[0].config);
            const meeting = interpolate(context, rows[1].config);
            expect(preset.default).toBe("convivium");
            expect(preset.roots).toEqual([{ path: join(assets, "presets"), trust: "system" }]);
            expect(
                readFileSync(join(preset.roots[0].path, "convivium/agent.cordis.yml"), "utf8")
            ).toContain("skill-filesystem");
            expect(meeting).toEqual({
                provider: "spawn",
                dataRoot: "convivium-smoke-data",
                maxParticipants: 8,
                speakerTimeoutMs: 300000,
                outboxPollMs: 1000,
                agentDefinitions: deployed.definitions
            });
            const missing = {
                ...context,
                process: { getBuiltinModule: process.getBuiltinModule, env: {} }
            };
            expect(() => interpolate(missing, rows[0].config)).toThrow();
            expect(() => interpolate(missing, rows[1].config)).toThrow();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describe("meeting roles probe service boundary", () => {
    it("resolves the optional preset service before creating the eight-participant meeting", async () => {
        vi.stubEnv(
            "CONVIVIUM_MEETING_ROLES_ROOT",
            fileURLToPath(new URL("../../../meeting-roles", import.meta.url))
        );
        try {
            const composedPreset = vi.fn().mockReturnValue("convivium");
            const get = vi.fn().mockReturnValue({ composedPreset });
            const callTool = vi.fn().mockRejectedValue(new Error("creation boundary reached"));
            const captain = { ctx: {} };
            await expect(
                runMeetingRolesScenario({
                    ctx: { get },
                    captain: { agent: captain },
                    assert: (condition: boolean, message: string) => {
                        if (!condition) throw new Error(message);
                    },
                    createInput: () => ({ agenda: [{}] }),
                    callTool,
                    nextCall: () => 1
                })
            ).rejects.toThrow("creation boundary reached");
            expect(get).toHaveBeenCalledWith("agentPresets");
            expect(composedPreset).toHaveBeenCalledWith(captain.ctx);
            const input = callTool.mock.calls[0][3];
            expect(input.participants).toHaveLength(8);
            expect(input.agenda[0].requiredParticipantKeys).toEqual(
                input.participants.map((p: { participantKey: string }) => p.participantKey)
            );
            expect(input.managerAgentDefinitionId).toBe("convivium.meeting_manager");
        } finally {
            vi.unstubAllEnvs();
        }
    });
});

describe("live child capability probes", () => {
    it("awaits native capability checks before returning the unchanged Skill policy decision", async () => {
        let handler: (
            exec: { agent: { id: string }; name: string },
            result: { isError: boolean },
            next: () => Promise<unknown>
        ) => Promise<unknown>;
        let finish: () => void;
        const pending = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const probeLiveRole = vi.fn().mockReturnValue(pending);
        const source = scenarioSource.slice(
            scenarioSource.indexOf("        let probeError;"),
            scenarioSource.indexOf("        try {\n            await bounded(180000")
        );
        runInNewContext(source, {
            ctx: {
                on: (_event: string, callback: typeof handler) => {
                    handler = callback;
                }
            },
            sessionId: "live-child",
            definition: { roleDefinitionId: "github_research_analyst" },
            probeLiveRole
        });
        const decision = { action: "accept" };
        const agent = { id: "live-child" };
        let returned = false;
        const call = handler!(
            { agent, name: "skill" },
            { isError: false },
            async () => decision
        ).then((value) => {
            returned = true;
            return value;
        });
        await vi.waitFor(() =>
            expect(probeLiveRole).toHaveBeenCalledWith(agent, "github_research_analyst")
        );
        expect(returned).toBe(false);
        finish!();
        expect(await call).toBe(decision);
    });
    it.each(["UNKNOWN_TOOL", "WEB_PROVIDER_ERROR"])(
        "requires native lookup denial, received %s",
        async (code) => {
            const execute = vi.fn().mockResolvedValue({ isError: true, error: { info: { code } } });
            const call = vi.fn();
            const source = scenarioSource.slice(
                scenarioSource.indexOf("    const execute ="),
                scenarioSource.indexOf("    for (const { definition, sessionId } of identities)")
            );
            const run = runInNewContext(source + "\nprobeLiveRole", {
                ctx: { tools: { execute, schemas: () => [{ name: "skill" }] } },
                runtime: { nextCall: () => 1 },
                call,
                meetingId: "meeting",
                AbortController,
                URL,
                assert: (condition: boolean, message: string) => {
                    if (!condition) throw new Error(message);
                }
            });
            if (code === "UNKNOWN_TOOL") {
                await run({ id: "live-child" }, "meeting_manager");
                expect(execute).toHaveBeenCalledTimes(2);
                expect(call).toHaveBeenCalledTimes(1);
            } else {
                await expect(run({ id: "live-child" }, "meeting_manager")).rejects.toThrow(
                    "Role tool was not denied at lookup"
                );
                expect(call).not.toHaveBeenCalled();
            }
        }
    );
});
