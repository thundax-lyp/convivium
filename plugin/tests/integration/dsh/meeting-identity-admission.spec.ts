import { describe, expect, it } from "vitest";
import { resolveDynamicMeetingDefinition } from "@/role-composition/resolve.ts";
import { parseAgentDefinitions } from "@/role-composition/model.ts";

const definitions = parseAgentDefinitions([
    {
        agentDefinitionId: "domain_architect",

        roleDefinitionId: "domain_architect",
        displayName: "Architect",
        summary: "summary",
        agentInstructions: {
            roleDefinitionId: "domain_architect",
            sha256: "a".repeat(64)
        },
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
            { id: "domain_architect" },
            hash
        );
        expect(mismatch).toMatchObject({ kind: "rejected", code: "DEFINITION_HASH_MISMATCH" });
        expect(resolveDynamicMeetingDefinition(definitions, { id: "missing" }, hash)).toMatchObject(
            { kind: "rejected", code: "DEFINITION_NOT_FOUND" }
        );
    });
});
