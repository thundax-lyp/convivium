import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { parseAgentDefinitions } from "@/role-composition/model.js";

const expected = {
    meeting_manager: ["meeting-facilitation"],
    domain_architect: ["repository-analysis"],
    runtime_engineer: ["repository-analysis"],
    protocol_ui_engineer: ["repository-analysis"],
    verification_reviewer: ["arxiv", "evidence-review", "github", "repository-analysis"],
    github_research_analyst: ["github"],
    arxiv_research_analyst: ["arxiv"]
};
it("binds seven packaged identities to isolated native Presets and capability directories", async () => {
    const root = new URL("../../config/", import.meta.url);
    const definitions = parseAgentDefinitions(
        JSON.parse(await readFile(new URL("definitions.json", root), "utf8")).definitions
    );
    expect(definitions.map((d) => d.roleDefinitionId).sort()).toEqual(Object.keys(expected).sort());
    const nativeRequire = createRequire(import.meta.resolve("@deepseek-ai/dsh-agent-presets"));
    const { entryListSchema } = await import(
        nativeRequire.resolve("@deepseek-ai/cordis-plugin-include")
    );
    const { interpolate } = await import(
        nativeRequire.resolve("@deepseek-ai/cordis-plugin-loader")
    );
    const { load } = nativeRequire("js-yaml");
    for (const definition of definitions) {
        expect(definition.definitionVersion).toBe("2.0.0");
        expect(definition.requiredSkillNames).toEqual(expected[definition.roleDefinitionId]);
        expect(definition.dshPresetId).toBe(
            `convivium-${definition.roleDefinitionId.replace(/^meeting_/, "").replaceAll("_", "-")}`
        );
        const instructions = await readFile(
            new URL(`agents/${definition.roleDefinitionId}/2.0.0/AGENTS.md`, root)
        );
        expect(definition.agentInstructions.sha256).toBe(
            createHash("sha256").update(instructions).digest("hex")
        );
        const baseUrl = new URL(`presets/${definition.dshPresetId}/`, root).href;
        const rows = load(await readFile(new URL("agent.cordis.yml", baseUrl), "utf8"), {
            schema: entryListSchema
        });
        const config = interpolate(
            { baseUrl, process },
            rows.find((row) => row.id === "skill-filesystem").config
        );
        expect(config.includeDefaultRoots).toBe(false);
        expect(config.watch).toBe(false);
        expect(config.customSkillDirs).toEqual(
            definition.requiredSkillNames.map((name) =>
                fileURLToPath(new URL(`skills/${name}/`, root))
            )
        );
        expect(rows.some((row) => row.id === "tool-subagent")).toBe(false);
        for (const name of definition.requiredSkillNames) {
            const text = await readFile(new URL(`skills/${name}/SKILL.md`, root), "utf8");
            expect(text).toContain(`name: ${name}\n`);
            expect(text).toMatch(/description: .+/);
        }
    }
    const patch = load(await readFile(new URL("cordis.patch.yml", root), "utf8"), {
        schema: entryListSchema
    });
    expect(patch.find((row) => row.id === "agent-presets").config.default).toBe("standard");
});
