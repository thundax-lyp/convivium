import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
    selectScenarios,
    CORE_SCENARIOS,
    SMOKE_SCENARIOS
} from "../../../scripts/smoke-profile/index.mjs";
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
