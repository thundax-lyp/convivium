import { describe, expect, it } from "vitest";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyMeetingAgentDefinitionSamples } from "../../../scripts/verify-agent-definition-samples.mjs";

const root = fileURLToPath(
    new URL("../../../examples/meeting-agent-definitions/", import.meta.url)
);
describe("Meeting Agent Definition samples", () => {
    it("accepts the canonical samples", async () => {
        await expect(verifyMeetingAgentDefinitionSamples(root)).resolves.toEqual([]);
    });

    it("rejects an unreadable root", async () => {
        await expect(verifyMeetingAgentDefinitionSamples(`${root}/missing`)).resolves.toEqual([
            { code: "ROOT_NOT_READABLE", location: "." }
        ]);
    });

    it("rejects a symlinked sample root", async () => {
        const temporaryRoot = await mkdtemp(join(tmpdir(), "convivium-agent-definitions-"));
        const fixtureRoot = join(temporaryRoot, "samples");
        try {
            await symlink(root, fixtureRoot);

            await expect(verifyMeetingAgentDefinitionSamples(fixtureRoot)).resolves.toEqual([
                { code: "SYMLINK_FORBIDDEN", location: "." }
            ]);
        } finally {
            await rm(temporaryRoot, { recursive: true, force: true });
        }
    });

    it.each([
        ["agent-definition.json", "AGENT.md"],
        ["AGENT.md", "agent-definition.json"]
    ])("rejects a symlinked %s", async (fileName, targetName) => {
        const temporaryRoot = await mkdtemp(join(tmpdir(), "convivium-agent-definitions-"));
        const fixtureRoot = join(temporaryRoot, "samples");
        const sampleRoot = join(fixtureRoot, "domain-architect");
        try {
            await cp(root, fixtureRoot, { recursive: true });
            await rm(join(sampleRoot, fileName));
            await symlink(targetName, join(sampleRoot, fileName));

            await expect(verifyMeetingAgentDefinitionSamples(fixtureRoot)).resolves.toEqual([
                {
                    code: "SYMLINK_FORBIDDEN",
                    location: `domain-architect/${fileName}`
                }
            ]);
        } finally {
            await rm(temporaryRoot, { recursive: true, force: true });
        }
    });
});
