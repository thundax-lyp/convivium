import type { MeetingAgentDefinition } from "@/role-composition/model.ts";

export const roleCompositionDefinitions: readonly MeetingAgentDefinition[] = [
    {
        agentDefinitionId: "fr14-manager",

        roleDefinitionId: "meeting_manager",
        displayName: "fr14-manager",
        summary: "fr14-manager",
        agentInstructions: {
            roleDefinitionId: "meeting_manager",
            sha256: "a".repeat(64)
        },
        dshPresetId: "minimal",
        requiredSkillNames: ["repository-analysis"],
        expertiseTags: ["fixture"],
        evidenceScopes: []
    },
    {
        agentDefinitionId: "fr14-participant",

        roleDefinitionId: "domain_architect",
        displayName: "fr14-participant",
        summary: "fr14-participant",
        agentInstructions: {
            roleDefinitionId: "domain_architect",
            sha256: "b".repeat(64)
        },
        dshPresetId: "minimal",
        requiredSkillNames: ["repository-analysis"],
        toolFilter: { deny: ["convivium_role_probe"] },
        expertiseTags: ["fixture"],
        evidenceScopes: []
    }
];

export const roleCompositionModelOverrides = {
    "fr14-manager": {
        provider: "convivium-role-smoke",
        model: "manager-v1",
        reasoningEffort: "high"
    },
    "fr14-participant": {
        provider: "convivium-role-smoke",
        model: "participant-v1",
        reasoningEffort: "low"
    }
};

// Identity hashes captured from the unchanged fe886643 baseline before agentOptions.
export const packagedDefinitionHashes: Readonly<Record<string, string>> = {
    "convivium.meeting_manager": "08d3594eb423302b51a5e2894be22e1fad7975de95d882644bd3aaee63f977f8",
    "convivium.domain_architect":
        "9a34a78ca674e802b4338a8e1ccf3a687ad534401e019c0eb0026dda06469548",
    "convivium.runtime_engineer":
        "3b9fd56f57b7510fff8b91a433c6fce2455f7dd93ad3991637a849c472fff7df",
    "convivium.protocol_ui_engineer":
        "c62283c10d51a9e669bb0a848572062e7ba831b2580804df25aa1f666789fd41",
    "convivium.verification_reviewer":
        "790c4c4fd9cd0b63e9b9724a398222e4ef5135ea211cde72ce3e182f2ce1d344",
    "convivium.github_research_analyst":
        "df60fcdaf42f2de14d22fb2d53c79954f2e42dcd451220eccabc79423eaed09a",
    "convivium.arxiv_research_analyst":
        "e731d7a95031e89e5bfdbd045aea7d3889756d36c4d6e806301384cdfeccd23d"
};
