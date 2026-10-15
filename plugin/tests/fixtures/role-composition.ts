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
    "convivium.meeting_manager": "31aa91b12105e77260d358395063a9d761d75935fb465232de3b955647ff4e67",
    "convivium.domain_architect":
        "0ef7f40f2b1ed2d24b1bfb060e974c008131925534845e8ced0eb1ae79aa37e9",
    "convivium.runtime_engineer":
        "ea1445fbb682d1cbbd47926c51220bd0b31035e524210759d17ba634475724b0",
    "convivium.protocol_ui_engineer":
        "8015c7c759e49987fb36b156b4fed82e366b0effb4b26589ba01f0ba44d1835d",
    "convivium.verification_reviewer":
        "790c4c4fd9cd0b63e9b9724a398222e4ef5135ea211cde72ce3e182f2ce1d344",
    "convivium.github_research_analyst":
        "665332d2918ce24e70f66148caa82eea4f4255c02b6b5d3906cfc4d1cf771dcc",
    "convivium.arxiv_research_analyst":
        "2f5aa641b110e17386fdb361b774fbdfd9202fd9843323c3454b35ecd2326e59"
};
