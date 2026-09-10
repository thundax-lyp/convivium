import { readFileSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import { writeSmokePatch } from "../../scripts/smoke-profile/index.mjs";

const deployed = JSON.parse(
    readFileSync(new URL("../../meeting-roles/definitions.json", import.meta.url), "utf8")
);

it("accepts all nine published role definitions through the runtime parser", () => {
    expect(parseAgentDefinitions(deployed.definitions)).toHaveLength(9);
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
            await cp(fileURLToPath(new URL("../../meeting-roles", import.meta.url)), assets, {
                recursive: true
            });
            const deployment = load(readFileSync(join(assets, "cordis.patch.yml"), "utf8"), {
                schema: entryListSchema
            });
            const controlPath = join(root, "control.yml");
            await writeSmokePatch(controlPath, "meeting-roles");
            const control = load(readFileSync(controlPath, "utf8"), { schema: entryListSchema });
            const warnings = vi.fn();
            const rows = applyEntryPatches(
                [
                    { id: "storage-domain", config: { backend: "json" } },
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
            const preset = interpolate(
                context,
                rows.find((row) => row.id === "agent-presets").config
            );
            const meeting = interpolate(context, rows.find((row) => row.id === "convivium").config);
            expect(preset.default).toBe("convivium");
            expect(preset.roots).toEqual([{ path: join(assets, "presets"), trust: "system" }]);
            expect(
                readFileSync(join(preset.roots[0].path, "convivium/agent.cordis.yml"), "utf8")
            ).toContain("skill-filesystem");
            expect(meeting).toEqual({
                provider: "spawn",
                maxParticipants: 8,
                speakerTimeoutMs: 300000,
                outboxPollMs: 1000,
                agentDefinitions: deployed.definitions
            });
            const missing = {
                ...context,
                process: { getBuiltinModule: process.getBuiltinModule, env: {} }
            };
            expect(() =>
                interpolate(missing, rows.find((row) => row.id === "agent-presets").config)
            ).toThrow();
            expect(() =>
                interpolate(missing, rows.find((row) => row.id === "convivium").config)
            ).toThrow();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
