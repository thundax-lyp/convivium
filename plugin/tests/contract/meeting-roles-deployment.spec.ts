import { readFileSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseAgentDefinitions } from "@/role-composition/model.js";

const deployed = JSON.parse(
    readFileSync(new URL("../../meeting-roles/definitions.json", import.meta.url), "utf8")
);

const roleSkills = new URL("../../meeting-roles/presets/convivium/skills/", import.meta.url);

it("publishes one Manager, one Evidence Reviewer and six Contributor definitions", () => {
    const definitions = parseAgentDefinitions(deployed.definitions);
    expect(definitions.map(({ roleDefinitionId }) => roleDefinitionId)).toEqual([
        "meeting_manager",
        "domain_architect",
        "runtime_engineer",
        "protocol_ui_engineer",
        "verification_reviewer",
        "github_research_analyst",
        "arxiv_research_analyst",
        "web_research_analyst"
    ]);
    expect(definitions).toHaveLength(8);
    expect(definitions.some(({ roleDefinitionId }) => roleDefinitionId === "meeting_scribe")).toBe(
        false
    );
});

it("publishes only the current contribution tools for Manager", () => {
    const definitions = parseAgentDefinitions(deployed.definitions);
    const manager = definitions.find(
        ({ roleDefinitionId }) => roleDefinitionId === "meeting_manager"
    );
    expect(manager).toMatchObject({
        definitionVersion: "1.1.0",
        toolFilter: {
            allow: [
                "skill",
                "convivium_meeting_status",
                "convivium_contribution",
                "convivium_read_contribution"
            ]
        }
    });
    expect(
        definitions
            .filter(({ roleDefinitionId }) => roleDefinitionId !== "meeting_manager")
            .every(({ definitionVersion }) => definitionVersion === "1.0.0")
    ).toBe(true);

    const currentGuidance = ["meeting-management/SKILL.md", "verification-review/SKILL.md"].map(
        (path) => readFileSync(new URL(path, roleSkills), "utf8")
    );
    expect(currentGuidance.join("\n")).not.toMatch(/convivium_submit_turn|submitManagerPlan/);
    expect(currentGuidance[0]).toContain("convivium_contribution");
    expect(currentGuidance[1]).toMatch(/逐.*版本.*主张/);
    expect(currentGuidance[1]).toContain("不得执行提交代码");
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
            // Later patches replace the config, so explicitly retain the deployed definitions.
            const control = load(
                `- id: convivium
  config:
    provider: spawn
    maxParticipants: 8
    speakerTimeoutMs: 300000
    outboxPollMs: 1000
    agentDefinitions: !!js "JSON.parse(process.getBuiltinModule('node:fs').readFileSync(process.getBuiltinModule('node:path').join(process.env.CONVIVIUM_MEETING_ROLES_ROOT, 'definitions.json'), 'utf8')).definitions"
`,
                { schema: entryListSchema }
            );
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
