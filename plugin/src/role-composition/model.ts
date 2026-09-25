import { z } from "zod";
import type { ToolRestriction } from "@deepseek-ai/dsh-tools";

const text = z.string().refine((value) => value.trim().length > 0);
const names = z.array(text).refine((values) => new Set(values).size === values.length);
const filter = z
    .strictObject({ allow: names.optional(), deny: names.optional() })
    .refine((value) => value.allow !== undefined || value.deny !== undefined);
const role = z.enum([
    "meeting_manager",
    "domain_architect",
    "runtime_engineer",
    "protocol_ui_engineer",
    "verification_reviewer",
    "github_research_analyst",
    "arxiv_research_analyst"
]);
export const abilityNames = [
    "meeting-facilitation",
    "repository-analysis",
    "evidence-review",
    "github",
    "arxiv"
] as const;
export type AbilityName = (typeof abilityNames)[number];
const instruction = z.strictObject({
    roleDefinitionId: role,
    version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
});
export type AgentInstructionRef = z.infer<typeof instruction>;
const definition = z
    .strictObject({
        agentDefinitionId: text,
        definitionVersion: text,
        roleDefinitionId: role,
        displayName: text,
        summary: text,
        agentInstructions: instruction,
        dshPresetId: text,
        requiredSkillNames: z
            .array(z.enum(abilityNames))
            .refine((values) => new Set(values).size === values.length),
        toolFilter: filter.optional(),
        expertiseTags: names.refine((value) => value.length > 0),
        evidenceScopes: z
            .array(z.enum(["repository", "github", "arxiv", "web"]))
            .refine((values) => new Set(values).size === values.length)
    })
    .refine((d) => d.agentInstructions.roleDefinitionId === d.roleDefinitionId);

export interface MeetingAgentDefinition extends Omit<
    z.infer<typeof definition>,
    "requiredSkillNames" | "toolFilter" | "expertiseTags" | "evidenceScopes"
> {
    requiredSkillNames: readonly AbilityName[];
    toolFilter?: ToolRestriction;
    expertiseTags: readonly string[];
    evidenceScopes: readonly ("repository" | "github" | "arxiv" | "web")[];
}

export interface AgentDefinitionBinding {
    agentDefinitionId: string;
    definitionVersion: string;
    definitionHash: string;
}

/** Validate and snapshot inline configuration without exposing configuration text in errors. */
export const parseAgentDefinitions = (value: unknown): readonly MeetingAgentDefinition[] => {
    if (value === undefined) return Object.freeze([]);
    try {
        const parsed = z.array(definition).max(64).parse(value);
        const ids = new Set<string>();
        for (const item of parsed) {
            if (
                ids.has(item.agentDefinitionId) ||
                Buffer.byteLength(JSON.stringify(item), "utf8") > 16 * 1024
            )
                throw new TypeError();
            ids.add(item.agentDefinitionId);
            item.requiredSkillNames.sort();
            item.toolFilter?.allow?.sort();
            item.toolFilter?.deny?.sort();
            Object.freeze(item.agentInstructions);
            Object.freeze(item.requiredSkillNames);
            Object.freeze(item.expertiseTags);
            Object.freeze(item.evidenceScopes);
            if (item.toolFilter) {
                if (item.toolFilter.allow) Object.freeze(item.toolFilter.allow);
                if (item.toolFilter.deny) Object.freeze(item.toolFilter.deny);
                Object.freeze(item.toolFilter);
            }
            Object.freeze(item);
        }
        return Object.freeze(parsed);
    } catch {
        throw new TypeError("Invalid meeting agent definitions.");
    }
};

export interface EffectiveAgentOptions {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
export interface ResourceBinding {
    instructions: AgentInstructionRef;
    presetId: string;
    presetSha256: string;
    skills: Array<{ name: AbilityName; sha256: string }>;
    compositionHash: string;
}
export interface PreparedDescriptor {
    descriptorId: string;
    meetingId: string;
    identityId: string;
    sessionId: string;
    definition: AgentDefinitionBinding;
    resources: ResourceBinding;
    agentOptions: EffectiveAgentOptions;
    descriptorHash: string;
    expiresAt: number;
}
