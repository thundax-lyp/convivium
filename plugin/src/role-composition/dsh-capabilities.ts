import type { Agent } from "@deepseek-ai/dsh-agent";
// Load the Cordis augmentations for ctx.agentPresets and ctx.skills without runtime imports.
import type {} from "@deepseek-ai/dsh-agent-presets";
import type {} from "@deepseek-ai/dsh-skill";
import type { MeetingAgentDefinitionV1 } from "./model.js";
import { RoleCompositionError } from "./resolve.js";
import type { AgentDefinitionBindingV1 } from "./model.js";
import type { IdentityRecommendationV1 } from "@/domain/meeting-state-v1.js";

export type PreflightIdentityResultV1 =
    | {
          kind: "ready";
          descriptor: {
              descriptorId: string;
              meetingId: string;
              parentSessionId: string;
              definition: { id: string; version: string };
              definitionHash: string;
              expiresAt: number;
          };
      }
    | {
          kind: "rejected";
          error: { code: "CAPABILITY_MISSING" | "PREFLIGHT_EXPIRED"; message: string };
          missing: readonly [];
      };

export async function preflightDynamicMeetingIdentityV1(
    parent: Agent,
    intent: IdentityRecommendationV1,
    definition: MeetingAgentDefinitionV1,
    binding: AgentDefinitionBindingV1,
    signal: AbortSignal
): Promise<PreflightIdentityResultV1> {
    try {
        await validateSharedRoleCapabilities(parent, [definition], signal);
    } catch {
        return {
            kind: "rejected",
            error: {
                code: "CAPABILITY_MISSING",
                message: "Required role capability is unavailable"
            },
            missing: []
        };
    }
    if (binding.definitionHash !== intent.definitionHash)
        return {
            kind: "rejected",
            error: {
                code: "CAPABILITY_MISSING",
                message: "Definition binding does not match intent"
            },
            missing: []
        };
    return {
        kind: "ready",
        descriptor: {
            descriptorId: `descriptor:${intent.id}`,
            meetingId: "",
            parentSessionId: "",
            definition: { id: definition.agentDefinitionId, version: definition.definitionVersion },
            definitionHash: binding.definitionHash,
            expiresAt: Date.now() + 300_000
        }
    };
}

/** Read capabilities in the exact Captain scope without installing or changing anything. */
export async function validateSharedRoleCapabilities(
    parent: Agent,
    definitions: readonly MeetingAgentDefinitionV1[],
    signal: AbortSignal
): Promise<void> {
    if (!definitions.length) return;
    try {
        signal.throwIfAborted();
        const presets = parent.ctx.get("agentPresets");
        if (!presets) throw new RoleCompositionError();
        const preset = presets.composedPreset(parent.ctx);
        if (!preset || definitions.some((d) => d.dshPresetId !== preset))
            throw new RoleCompositionError();
        const names = new Set(definitions.flatMap((d) => [...d.requiredSkillNames]));
        if (names.size > 0) {
            const skills = parent.ctx.get("skills");
            if (!skills) throw new RoleCompositionError();
            for (const name of names) {
                signal.throwIfAborted();
                const skill = await skills.get(name, {
                    scope: parent,
                    cwd: parent.session.header.cwd,
                    signal
                });
                signal.throwIfAborted();
                if (!skill || !skill.invocation.modelInvocable || !skill.content.trim())
                    throw new RoleCompositionError();
            }
        }
        signal.throwIfAborted();
        if (presets.composedPreset(parent.ctx) !== preset) throw new RoleCompositionError();
    } catch {
        signal.throwIfAborted();
        throw new RoleCompositionError();
    }
}
