import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
    selectScenarios,
    CORE_SCENARIOS,
    SMOKE_SCENARIOS
} from "../../../scripts/smoke-profile/index.mjs";
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
        expect(patch).not.toContain("agentDefinitions");
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
