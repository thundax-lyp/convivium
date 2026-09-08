import { describe, expect, it } from "vitest";
import { cp, mkdtemp, rm, symlink, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import { verifyMeetingAgentDefinitions } from "../../../scripts/verify-agent-definition-samples.mjs";

const root = fileURLToPath(new URL("../../../meeting-roles/", import.meta.url));
const skill = "presets/convivium/skills/meeting-management/SKILL.md";
async function withFixture(run: (path: string) => Promise<void>) {
    const temporary = await mkdtemp(join(tmpdir(), "convivium-role-deployment-"));
    try {
        const path = join(temporary, "roles");
        await cp(root, path, { recursive: true });
        await run(path);
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}
describe("Meeting Agent Definition deployment", () => {
    it("accepts the complete native resource set and runtime definitions", async () => {
        expect(await verifyMeetingAgentDefinitions(root)).toEqual([]);
        const doc = JSON.parse(await readFile(join(root, "definitions.json"), "utf8"));
        expect(parseAgentDefinitions(doc.definitions)).toHaveLength(9);
    });
    it("rejects an unreadable root", async () => {
        expect(await verifyMeetingAgentDefinitions(join(root, "missing"))).toEqual([
            { code: "ROOT_NOT_READABLE", location: "." }
        ]);
    });
    it.each(["root", "definitions.json", skill, "presets/convivium/skills"])(
        "rejects symlinked %s without following it",
        async (location) => {
            await withFixture(async (path) => {
                const link = location === "root" ? `${path}-link` : join(path, location);
                if (location !== "root") await rm(link, { recursive: true });
                await symlink(root, link);
                expect(
                    await verifyMeetingAgentDefinitions(location === "root" ? link : path)
                ).toContainEqual({
                    code: "SYMLINK_FORBIDDEN",
                    location: location === "root" ? "." : location
                });
            });
        }
    );
    it.each([
        "missing-skill",
        "wrong-name",
        "not-invocable",
        "empty-body",
        "missing-step",
        "wrong-preset",
        "old-persona",
        "old-options",
        "unknown-file",
        "invalid-json"
    ])("rejects %s deployment", async (kind) => {
        await withFixture(async (path) => {
            const skillPath = join(path, skill),
                jsonPath = join(path, "definitions.json");
            if (kind === "missing-skill") await rm(skillPath);
            else if (["wrong-name", "not-invocable", "empty-body", "missing-step"].includes(kind)) {
                let text = await readFile(skillPath, "utf8");
                if (kind === "wrong-name") text = text.replace("meeting-management", "wrong");
                if (kind === "not-invocable")
                    text = text.replace(
                        "disable-model-invocation: false",
                        "disable-model-invocation: true"
                    );
                if (kind === "empty-body") text = text.slice(0, text.lastIndexOf("---") + 3) + "\n";
                if (kind === "missing-step") text = text.replace(/^4\..*$/m, "");
                await writeFile(skillPath, text);
            } else if (kind === "unknown-file") await writeFile(join(path, "extra.txt"), "extra");
            else if (kind === "invalid-json") await writeFile(jsonPath, "{");
            else {
                const doc = JSON.parse(await readFile(jsonPath, "utf8"));
                if (kind === "wrong-preset") doc.definitions[0].dshPresetId = "other";
                if (kind === "old-persona") doc.definitions[0].persona = "legacy";
                if (kind === "old-options") doc.definitions[0].agentOptions = { model: "legacy" };
                await writeFile(jsonPath, JSON.stringify(doc));
            }
            expect((await verifyMeetingAgentDefinitions(path)).length).toBeGreaterThan(0);
        });
    });
});
