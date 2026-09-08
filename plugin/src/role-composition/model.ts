import { z } from "zod";
import type { ToolRestriction } from "@deepseek-ai/dsh-tools";

const text = z.string().refine((value) => value.trim().length > 0);
const names = z.array(text).refine((values) => new Set(values).size === values.length);
const filter = z
    .strictObject({ allow: names.optional(), deny: names.optional() })
    .refine((value) => value.allow !== undefined || value.deny !== undefined);
const definition = z.strictObject({
    agentDefinitionId: text,
    definitionVersion: text,
    roleDefinitionId: z.enum([
        "meeting_manager",
        "domain_architect",
        "runtime_engineer",
        "protocol_ui_engineer",
        "verification_reviewer",
        "github_research_analyst",
        "arxiv_research_analyst",
        "web_research_analyst",
        "meeting_scribe"
    ]),
    displayName: text,
    summary: text,
    roleDescription: text.refine((value) => !value.includes("{{")),
    dshPresetId: text,
    requiredSkillNames: names.refine((value) => value.length > 0),
    toolFilter: filter.optional(),
    expertiseTags: names.refine((value) => value.length > 0),
    evidenceScopes: z
        .array(z.enum(["repository", "github", "arxiv", "web"]))
        .refine((values) => new Set(values).size === values.length)
});

export interface MeetingAgentDefinitionV1 extends Omit<
    z.infer<typeof definition>,
    "requiredSkillNames" | "toolFilter" | "expertiseTags" | "evidenceScopes"
> {
    requiredSkillNames: readonly string[];
    toolFilter?: ToolRestriction;
    expertiseTags: readonly string[];
    evidenceScopes: readonly ("repository" | "github" | "arxiv" | "web")[];
}

export interface AgentDefinitionBindingV1 {
    agentDefinitionId: string;
    definitionVersion: string;
    definitionHash: string;
}

/** Validate and snapshot inline configuration without exposing configuration text in errors. */
export function parseAgentDefinitions(value: unknown): readonly MeetingAgentDefinitionV1[] {
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
}
