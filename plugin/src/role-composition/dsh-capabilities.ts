import type { Agent } from "@deepseek-ai/dsh-agent";
// Load the Cordis augmentations for ctx.agentPresets and ctx.skills without runtime imports.
import type {} from "@deepseek-ai/dsh-agent-presets";
import type {} from "@deepseek-ai/dsh-skill";
import type { MeetingAgentDefinitionV1 } from "./model.js";
import { RoleCompositionError } from "./resolve.js";

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
        const skills = parent.ctx.get("skills");
        if (!presets || !skills) throw new RoleCompositionError();
        const preset = presets.composedPreset(parent.ctx);
        if (!preset || definitions.some((d) => d.dshPresetId !== preset))
            throw new RoleCompositionError();
        const names = new Set(definitions.flatMap((d) => [...d.requiredSkillNames]));
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
        signal.throwIfAborted();
        if (presets.composedPreset(parent.ctx) !== preset) throw new RoleCompositionError();
    } catch {
        signal.throwIfAborted();
        throw new RoleCompositionError();
    }
}
