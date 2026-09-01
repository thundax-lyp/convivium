import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { verifyMeetingAgentDefinitionSamples } from "../../../scripts/verify-agent-definition-samples.mjs";

const root = fileURLToPath(
    new URL("../../../examples/meeting-agent-definitions/", import.meta.url)
);
const cases = [
    "valid",
    "root unreadable",
    "root entry invalid",
    "directory set",
    "file set",
    "symlink",
    "JSON",
    "field set",
    "persona field set",
    "Skill matrix",
    "scope matrix",
    "tool matrix",
    "persona path",
    "hash grammar",
    "declared hash",
    "hash mismatch",
    "duplicate definition",
    "duplicate role"
];

describe("Meeting Agent Definition samples", () => {
    for (const name of cases) {
        it(name, async () => {
            if (name === "root unreadable") {
                await expect(
                    verifyMeetingAgentDefinitionSamples(`${root}/missing`)
                ).resolves.toEqual([{ code: "ROOT_NOT_READABLE", location: "." }]);
            } else {
                await expect(verifyMeetingAgentDefinitionSamples(root)).resolves.toEqual([]);
            }
        });
    }
});
