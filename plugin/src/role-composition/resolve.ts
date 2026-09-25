import type { AgentOptions } from "@deepseek-ai/dsh-agent";
import { encodeCanonicalJson, sha256Hex } from "@/repository/domain/canonical-json.js";
import type { ToolRestriction } from "@deepseek-ai/dsh-tools";
import { parseAgentModelOverrides } from "./model-options.js";
import type { MeetingAgentModelOverrides } from "./model-options.js";
import { parseAgentDefinitions } from "./model.js";
import type { AgentDefinitionBinding, MeetingAgentDefinition } from "./model.js";

export interface ResolvedRoleComposition {
    readonly agentInstructions: MeetingAgentDefinition["agentInstructions"];
    readonly toolFilter?: ToolRestriction;
    readonly agentOptions?: Pick<AgentOptions, "provider" | "model" | "reasoningEffort">;
    readonly agentDefinition: AgentDefinitionBinding;
}
export interface ResolveMeetingRolesInput {
    readonly agentModelOverrides?: MeetingAgentModelOverrides;
    readonly definitions: readonly MeetingAgentDefinition[];
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

export type DynamicDefinitionResolution =
    | { kind: "resolved"; definition: MeetingAgentDefinition; binding: AgentDefinitionBinding }
    | {
          kind: "rejected";
          code: "DEFINITION_NOT_FOUND" | "DEFINITION_VERSION_MISMATCH" | "ROLE_NOT_ALLOWED";
      };

export const resolveDynamicMeetingDefinition = (
    definitions: readonly MeetingAgentDefinition[],
    definitionRef: { id: string; version: string },
    expectedHash: string
): DynamicDefinitionResolution => {
    const definition = definitions.find((item) => item.agentDefinitionId === definitionRef.id);
    if (!definition) return { kind: "rejected", code: "DEFINITION_NOT_FOUND" };
    if (definition.definitionVersion !== definitionRef.version)
        return { kind: "rejected", code: "DEFINITION_VERSION_MISMATCH" };
    if (
        definition.roleDefinitionId === "meeting_manager" ||
        definition.roleDefinitionId === "verification_reviewer"
    )
        return { kind: "rejected", code: "ROLE_NOT_ALLOWED" };
    const binding = {
        agentDefinitionId: definition.agentDefinitionId,
        definitionVersion: definition.definitionVersion,
        definitionHash: definitionHash(definition)
    };
    if (binding.definitionHash !== expectedHash)
        return { kind: "rejected", code: "DEFINITION_VERSION_MISMATCH" };
    return { kind: "resolved", definition, binding };
};

export const definitionHash = (d: MeetingAgentDefinition): string =>
    sha256Hex(
        encodeCanonicalJson({
            ...d,
            requiredSkillNames: [...d.requiredSkillNames].sort(),
            ...(d.toolFilter === undefined
                ? {}
                : {
                      toolFilter: {
                          ...(d.toolFilter.allow === undefined
                              ? {}
                              : { allow: [...d.toolFilter.allow].sort() }),
                          ...(d.toolFilter.deny === undefined
                              ? {}
                              : { deny: [...d.toolFilter.deny].sort() })
                      }
                  })
        })
    );

/** Resolve all selections before the single capability preflight; never create Sessions. */
export const resolveMeetingRoles = async (
    input: ResolveMeetingRolesInput,
    validate: (selected: readonly MeetingAgentDefinition[]) => Promise<void>
): Promise<ResolvedMeetingRoles> => {
    let definitions: readonly MeetingAgentDefinition[];
    let overrides: MeetingAgentModelOverrides;
    try {
        definitions = parseAgentDefinitions(input.definitions);
        overrides = parseAgentModelOverrides(input.agentModelOverrides, definitions);
    } catch {
        throw new RoleCompositionError();
    }
    const selected: MeetingAgentDefinition[] = [];
    const resolve = (
        id: string | undefined,
        manager: boolean
    ): ResolvedRoleComposition | undefined => {
        if (id === undefined) return undefined;
        if (typeof id !== "string" || !id.trim()) throw new RoleCompositionError();
        const d = definitions.find((item) => item.agentDefinitionId === id);
        if (!d || (d.roleDefinitionId === "meeting_manager") !== manager)
            throw new RoleCompositionError();
        selected.push(d);
        return Object.freeze({
            agentInstructions: d.agentInstructions,
            ...(d.toolFilter === undefined ? {} : { toolFilter: d.toolFilter }),
            ...(overrides[id] === undefined ? {} : { agentOptions: overrides[id] }),
            agentDefinition: Object.freeze({
                agentDefinitionId: d.agentDefinitionId,
                definitionVersion: d.definitionVersion,
                definitionHash: definitionHash(d)
            })
        });
    };
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
};
