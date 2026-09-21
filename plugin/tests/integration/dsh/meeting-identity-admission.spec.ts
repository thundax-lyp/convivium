import { describe, expect, it } from "vitest";
import { resolveDynamicMeetingDefinition } from "@/role-composition/resolve.js";
import { parseAgentDefinitions } from "@/role-composition/model.js";

const definitions = parseAgentDefinitions([
    {
        agentDefinitionId: "domain_architect",
        definitionVersion: "1",
        roleDefinitionId: "domain_architect",
        displayName: "Architect",
        summary: "summary",
        roleDescription: "role",
        dshPresetId: "meeting",
        requiredSkillNames: [],
        expertiseTags: ["evidence"],
        evidenceScopes: ["repository"]
    }
]);

describe("meeting identity admission boundary", () => {
    it("resolves only the exact Definition version and hash", () => {
        const hash = "";
        const mismatch = resolveDynamicMeetingDefinition(
            definitions,
            { id: "domain_architect", version: "1" },
            hash
        );
        expect(mismatch).toMatchObject({ kind: "rejected", code: "DEFINITION_VERSION_MISMATCH" });
        expect(
            resolveDynamicMeetingDefinition(definitions, { id: "missing", version: "1" }, hash)
        ).toMatchObject({ kind: "rejected", code: "DEFINITION_NOT_FOUND" });
    });
});
