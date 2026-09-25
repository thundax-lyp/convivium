import type AgentPresets from "@deepseek-ai/dsh-agent-presets";
import type Skills from "@deepseek-ai/dsh-skill";
import type { SkillViewOptions } from "@deepseek-ai/dsh-skill";
import { resolve } from "node:path";
import { encodeCanonicalJson, sha256Hex } from "@/repository/domain/canonical-json.js";
import {
    abilityNames,
    type AgentDefinitionBinding,
    type EffectiveAgentOptions,
    type MeetingAgentDefinition,
    type PreparedDescriptor
} from "./model.js";
import { definitionHash } from "./resolve.js";
import { readRoleResource, resolveResourceBinding } from "./resource-binding.js";

export type PreflightIdentityResult =
    | { kind: "ready"; descriptor: PreparedDescriptor }
    | {
          kind: "rejected";
          error: { code: "CAPABILITY_MISSING"; message: string };
          missing: readonly [];
      };

export const validateRoleSkills = async (input: {
    skills: Pick<Skills, "snapshot" | "get">;
    definition: MeetingAgentDefinition;
    packageRoot: string;
    view: SkillViewOptions;
}): Promise<void> => {
    const { skills, definition, packageRoot, view } = input;
    view.signal?.throwIfAborted();
    const snapshot = await skills.snapshot(view);
    const names = snapshot.skills.map((item) => item.name).sort();
    const expected = [...definition.requiredSkillNames].sort();
    if (!snapshot.complete || JSON.stringify(names) !== JSON.stringify(expected))
        throw new Error("Role Skill catalog differs from its allocation.");
    for (const name of abilityNames) {
        const skill = await skills.get(name, view);
        view.signal?.throwIfAborted();
        if (!expected.includes(name)) {
            if (skill) throw new Error("Unassigned Skill is loadable.");
            continue;
        }
        const path = resolve(packageRoot, "config", "skills", name, "SKILL.md");
        const raw = (await readRoleResource(packageRoot, `skills/${name}/SKILL.md`)).toString(
            "utf8"
        );
        const content = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
        if (
            !skill ||
            !skill.invocation.modelInvocable ||
            skill.name !== name ||
            !content ||
            skill.content.trim() !== content ||
            skill.path !== path ||
            skill.resourceBase?.kind !== "directory" ||
            resolve(skill.resourceBase.path) !== resolve(packageRoot, "config", "skills", name)
        )
            throw new Error("Role Skill body or resource origin differs from its binding.");
    }
};

export const preflightMeetingIdentity = async (input: {
    ctx: {
        agentPresets: Pick<AgentPresets, "standingKeyFor">;
        skills: Pick<Skills, "snapshot" | "get">;
    };
    cwd: string;
    packageRoot: string;
    meetingId: string;
    identityId: string;
    sessionId: string;
    definition: MeetingAgentDefinition;
    binding: AgentDefinitionBinding;
    agentOptions: EffectiveAgentOptions;
    now: number;
    signal: AbortSignal;
}): Promise<PreflightIdentityResult> => {
    try {
        input.signal.throwIfAborted();
        const { meetingId, identityId, sessionId, definition, binding, agentOptions, now } = input;
        if (
            !Number.isSafeInteger(now) ||
            now < 0 ||
            !Number.isSafeInteger(now + 300000) ||
            ![meetingId, identityId, sessionId, agentOptions.provider, agentOptions.model].every(
                (value) => value.trim()
            ) ||
            binding.agentDefinitionId !== definition.agentDefinitionId ||
            binding.definitionVersion !== definition.definitionVersion ||
            binding.definitionHash !== definitionHash(definition)
        )
            throw new Error("Invalid preflight binding.");
        const resources = await resolveResourceBinding(input);
        const scope = await input.ctx.agentPresets.standingKeyFor(definition.dshPresetId);
        await validateRoleSkills({
            skills: input.ctx.skills,
            definition,
            packageRoot: input.packageRoot,
            view: { scope, cwd: input.cwd, signal: input.signal }
        });
        input.signal.throwIfAborted();
        // Standing mount and reads may yield; refuse files changed during preflight.
        if ((await resolveResourceBinding(input)).compositionHash !== resources.compositionHash)
            throw new Error("Role resources changed during preflight.");
        const descriptor = {
            descriptorId: `descriptor-${sha256Hex(encodeCanonicalJson([meetingId, "descriptor", identityId])).slice(0, 32)}`,
            meetingId,
            identityId,
            sessionId,
            definition: { ...binding },
            resources,
            agentOptions: { ...agentOptions },
            expiresAt: now + 300000
        };
        return {
            kind: "ready",
            descriptor: {
                ...descriptor,
                descriptorHash: sha256Hex(encodeCanonicalJson(descriptor))
            }
        };
    } catch {
        input.signal.throwIfAborted();
        return {
            kind: "rejected",
            error: {
                code: "CAPABILITY_MISSING",
                message: "Required role resources or capabilities are unavailable."
            },
            missing: []
        };
    }
};
