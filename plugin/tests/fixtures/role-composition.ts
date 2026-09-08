import type { MeetingAgentDefinitionV1 } from "../../src/role-composition/model.js";

export const roleCompositionDefinitions: readonly MeetingAgentDefinitionV1[] = [
    {
        agentDefinitionId: "fr14-manager",
        definitionVersion: "1.0.0",
        roleDefinitionId: "meeting_manager",
        displayName: "fr14-manager",
        summary: "fr14-manager",
        persona: "FR14_MANAGER_V1",
        dshPresetId: "minimal",
        requiredSkillNames: ["fr14-fixture"],
        agentOptions: {
            provider: "convivium-role-smoke",
            model: "manager-v1",
            reasoningEffort: "high"
        },
        expertiseTags: ["fixture"],
        evidenceScopes: []
    },
    {
        agentDefinitionId: "fr14-participant",
        definitionVersion: "1.0.0",
        roleDefinitionId: "domain_architect",
        displayName: "fr14-participant",
        summary: "fr14-participant",
        persona: "FR14_PARTICIPANT_V1",
        dshPresetId: "minimal",
        requiredSkillNames: ["fr14-fixture"],
        toolFilter: { deny: ["convivium_role_probe"] },
        agentOptions: {
            provider: "convivium-role-smoke",
            model: "participant-v1",
            reasoningEffort: "low"
        },
        expertiseTags: ["fixture"],
        evidenceScopes: []
    }
];
