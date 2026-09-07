export function roleSmokeDefinitions(phase) {
    if (phase !== "1" && phase !== "2") throw new TypeError("Invalid role smoke phase.");
    return [
        {
            agentDefinitionId: "fr14-manager",
            definitionVersion: phase === "1" ? "1.0.0" : "2.0.0",
            roleDefinitionId: "meeting_manager",
            displayName: "fr14-manager",
            summary: "fr14-manager",
            persona: phase === "1" ? "FR14_MANAGER_V1" : "FR14_MANAGER_V2",
            dshPresetId: "minimal",
            requiredSkillNames: ["fr14-fixture"],
            expertiseTags: ["fixture"],
            evidenceScopes: []
        },
        {
            agentDefinitionId: "fr14-participant",
            definitionVersion: phase === "1" ? "1.0.0" : "2.0.0",
            roleDefinitionId: "domain_architect",
            displayName: "fr14-participant",
            summary: "fr14-participant",
            persona: phase === "1" ? "FR14_PARTICIPANT_V1" : "FR14_PARTICIPANT_V2",
            dshPresetId: "minimal",
            requiredSkillNames: ["fr14-fixture"],
            toolFilter: { deny: ["convivium_role_probe"] },
            expertiseTags: ["fixture"],
            evidenceScopes: []
        }
    ];
}
