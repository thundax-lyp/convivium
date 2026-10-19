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
        "9bd0eb976ae90b880d8d7ae757615a35fca0f430d70f061ea8a74289ae823212",
    "convivium.runtime_engineer":
        "7fbaefd734d365d545865fb399f452c4d5c27777c3daee4e3af2357381633202",
    "convivium.protocol_ui_engineer":
        "ab7b125a172cce570ed64aba9bdbbabb3a04769c7bed4b401aee87e77008b02a",
    "convivium.verification_reviewer":
        "790c4c4fd9cd0b63e9b9724a398222e4ef5135ea211cde72ce3e182f2ce1d344",
    "convivium.github_research_analyst":
        "fb604faf6155958ef6239139af7204b59405e3a4957f3bec1c37a0c12e485b9c",
    "convivium.arxiv_research_analyst":
        "8953f5106fe5a847f1fb9252a09443be5aa4bfdd445ea64bbc2602fc2853f36e"
};
