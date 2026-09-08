import type { AgentOptions } from "@deepseek-ai/dsh-agent";
import { createHash } from "node:crypto";
import type { ToolRestriction } from "@deepseek-ai/dsh-tools";
import { parseAgentDefinitions } from "./model.js";
import type { AgentDefinitionBindingV1, MeetingAgentDefinitionV1 } from "./model.js";

export interface ResolvedRoleComposition {
    readonly persona: string;
    readonly toolFilter?: ToolRestriction;
    readonly agentOptions?: Pick<AgentOptions, "provider" | "model" | "reasoningEffort">;
    readonly agentDefinition: AgentDefinitionBindingV1;
}
export interface ResolveMeetingRolesInput {
    readonly definitions: readonly MeetingAgentDefinitionV1[];
    readonly managerAgentDefinitionId?: string;
    readonly participants: readonly {
        readonly participantKey: string;
        readonly agentDefinitionId?: string;
    }[];
}
export interface ResolvedMeetingRoles {
    readonly manager?: ResolvedRoleComposition;
    readonly participants: Readonly<Record<string, ResolvedRoleComposition>>;
}
export class RoleCompositionError extends Error {
    readonly code = "UNSUPPORTED_CAPABILITY";
    constructor() {
        super("Meeting role composition is unavailable.");
    }
}

function definitionHash(d: MeetingAgentDefinitionV1): string {
    return createHash("sha256")
        .update(
            JSON.stringify({
                agentDefinitionId: d.agentDefinitionId,
                definitionVersion: d.definitionVersion,
                roleDefinitionId: d.roleDefinitionId,
                displayName: d.displayName,
                summary: d.summary,
                persona: d.persona,
                dshPresetId: d.dshPresetId,
                requiredSkillNames: d.requiredSkillNames,
                ...(d.toolFilter === undefined
                    ? {}
                    : {
                          toolFilter: {
                              ...(d.toolFilter.allow === undefined
                                  ? {}
                                  : { allow: d.toolFilter.allow }),
                              ...(d.toolFilter.deny === undefined
                                  ? {}
                                  : { deny: d.toolFilter.deny })
                          }
                      }),
                ...(d.agentOptions === undefined ? {} : { agentOptions: d.agentOptions }),
                expertiseTags: d.expertiseTags,
                evidenceScopes: d.evidenceScopes
            })
        )
        .digest("hex");
}

/** Resolve all selections before the single capability preflight; never create Sessions. */
export async function resolveMeetingRoles(
    input: ResolveMeetingRolesInput,
    validate: (selected: readonly MeetingAgentDefinitionV1[]) => Promise<void>
): Promise<ResolvedMeetingRoles> {
    let definitions: readonly MeetingAgentDefinitionV1[];
    try {
        definitions = parseAgentDefinitions(input.definitions);
    } catch {
        throw new RoleCompositionError();
    }
    const selected: MeetingAgentDefinitionV1[] = [];
    function resolve(
        id: string | undefined,
        manager: boolean
    ): ResolvedRoleComposition | undefined {
        if (id === undefined) return undefined;
        if (typeof id !== "string" || !id.trim()) throw new RoleCompositionError();
        const d = definitions.find((item) => item.agentDefinitionId === id);
        if (!d || (d.roleDefinitionId === "meeting_manager") !== manager)
            throw new RoleCompositionError();
        selected.push(d);
        return Object.freeze({
            persona: d.persona,
            ...(d.toolFilter === undefined ? {} : { toolFilter: d.toolFilter }),
            ...(d.agentOptions === undefined
                ? {}
                : { agentOptions: d.agentOptions as AgentOptions }),
            agentDefinition: Object.freeze({
                agentDefinitionId: d.agentDefinitionId,
                definitionVersion: d.definitionVersion,
                definitionHash: definitionHash(d)
            })
        });
    }
    const manager = resolve(input.managerAgentDefinitionId, true);
    const participants: Record<string, ResolvedRoleComposition> = Object.create(null);
    for (const participant of input.participants) {
        const composition = resolve(participant.agentDefinitionId, false);
        if (composition) participants[participant.participantKey] = composition;
    }
    if (selected.length) await validate(Object.freeze(selected));
    return Object.freeze({
        ...(manager === undefined ? {} : { manager }),
        participants: Object.freeze(participants)
    });
}
