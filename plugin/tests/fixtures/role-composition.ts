import type { MeetingAgentDefinition } from "@/role-composition/model.js";

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
