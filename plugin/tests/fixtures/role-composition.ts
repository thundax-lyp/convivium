import type { MeetingAgentDefinitionV1 } from "@/role-composition/model.js";

export const roleCompositionDefinitions: readonly MeetingAgentDefinitionV1[] = [
    {
        agentDefinitionId: "fr14-manager",
        definitionVersion: "1.0.0",
        roleDefinitionId: "meeting_manager",
        displayName: "fr14-manager",
        summary: "fr14-manager",
        roleDescription: "FR14_MANAGER_V1",
        dshPresetId: "minimal",
        requiredSkillNames: ["fr14-fixture"],
        expertiseTags: ["fixture"],
        evidenceScopes: []
    },
    {
        agentDefinitionId: "fr14-participant",
        definitionVersion: "1.0.0",
        roleDefinitionId: "domain_architect",
        displayName: "fr14-participant",
        summary: "fr14-participant",
        roleDescription: "FR14_PARTICIPANT_V1",
        dshPresetId: "minimal",
        requiredSkillNames: ["fr14-fixture"],
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
