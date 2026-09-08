import type { AgentOptions } from "@deepseek-ai/dsh-agent";
import { createHash } from "node:crypto";
import type { ToolRestriction } from "@deepseek-ai/dsh-tools";
import { parseAgentModelOverrides } from "./model-options.js";
import type { MeetingAgentModelOverrides } from "./model-options.js";
import { parseAgentDefinitions } from "./model.js";
import type { AgentDefinitionBindingV1, MeetingAgentDefinitionV1 } from "./model.js";

export interface ResolvedRoleComposition {
    readonly persona: string;
    readonly toolFilter?: ToolRestriction;
    readonly agentOptions?: Pick<AgentOptions, "provider" | "model" | "reasoningEffort">;
    readonly agentDefinition: AgentDefinitionBindingV1;
}
export interface ResolveMeetingRolesInput {
    readonly agentModelOverrides?: MeetingAgentModelOverrides;
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
    readonly name = "RoleCompositionError";
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
                roleDescription: d.roleDescription,
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
    let overrides: MeetingAgentModelOverrides;
    try {
        definitions = parseAgentDefinitions(input.definitions);
        overrides = parseAgentModelOverrides(input.agentModelOverrides, definitions);
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
            persona:
                d.roleDescription +
                "\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：" +
                d.requiredSkillNames.join("、") +
                "。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。",
            ...(d.toolFilter === undefined ? {} : { toolFilter: d.toolFilter }),
            ...(overrides[id] === undefined ? {} : { agentOptions: overrides[id] }),
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
