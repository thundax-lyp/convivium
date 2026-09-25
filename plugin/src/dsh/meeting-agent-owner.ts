import { MessageId, ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import type { Context } from "@deepseek-ai/cordis";
import type { AgentHandle, AgentSetup } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type {} from "@deepseek-ai/dsh-tools";
import type { MeetingAgentDefinition, PreparedDescriptor } from "@/role-composition/model.js";
import { definitionHash } from "@/role-composition/resolve.js";
import { resolveResourceBinding, readRoleResource } from "@/role-composition/resource-binding.js";
import { validateRoleSkills } from "@/role-composition/dsh-capabilities.js";
import { encodeCanonicalJson, sha256Hex } from "@/repository/domain/canonical-json.js";
import type { SessionOwnership } from "@/repository/types.js";

type Purpose = "provisioning" | "delivery" | "cleanup";
type ResumeInput = {
    ownership: SessionOwnership;
    definition: MeetingAgentDefinition;
    purpose: Purpose;
    signal: AbortSignal;
};
export interface MeetingAgentOwner {
    create(input: {
        ownership: SessionOwnership;
        descriptor: PreparedDescriptor;
        definition: MeetingAgentDefinition;
        signal: AbortSignal;
    }): Promise<void>;
    resume(input: ResumeInput): Promise<void>;
    deliver(input: {
        ownership: SessionOwnership;
        deliveryId: string;
        text: string;
        authorize: () => Promise<void>;
        signal: AbortSignal;
    }): Promise<boolean>;
    suspend(input: { ownership: SessionOwnership; reason: string }): Promise<void>;
    stop(input: {
        ownership: SessionOwnership;
        definition: MeetingAgentDefinition;
        reason: string;
        signal: AbortSignal;
    }): Promise<void>;
    disposeAll(): Promise<void>;
}
export const createMeetingAgentOwner = ({
    ctx,
    packageRoot
}: {
    ctx: Context;
    packageRoot: string;
}): MeetingAgentOwner => {
    const options = (ownership: SessionOwnership) => ({
        provider: ownership.agentOptions.provider,
        model: ownership.agentOptions.model,
        ...(ownership.agentOptions.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: ReasoningEffortId(ownership.agentOptions.reasoningEffort) })
    });
    const handles = new Map<
        string,
        { handle: AgentHandle; purpose: Purpose; sessionId: string; compositionHash: string }
    >();
    const pending = new Map<string, Promise<unknown>>();
    let closing = false;
    const serial = <T>(key: string, run: () => Promise<T>): Promise<T> => {
        if (closing) return Promise.reject(new Error("RECOVERY_UNAVAILABLE: owner is stopping"));
        const result = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
        pending.set(key, result);
        void result
            .finally(() => {
                if (pending.get(key) === result) pending.delete(key);
            })
            .catch(() => {});
        return result;
    };
    const entry = (ownership: SessionOwnership) => {
        const current = handles.get(ownership.id);
        if (
            current &&
            (current.sessionId !== ownership.sessionId ||
                current.compositionHash !== ownership.resources.compositionHash)
        )
            throw new Error("OWNERSHIP_CONFLICT");
        return current;
    };
    const release = async (ownership: SessionOwnership, reason: string) => {
        const current = entry(ownership);
        if (!current) return;
        current.handle.agent.cancel({ kind: "hook", reason });
        await current.handle.agent.whenIdle();
        await current.handle.dispose();
        handles.delete(ownership.id);
    };
    const verifyResources = async (
        ownership: SessionOwnership,
        definition: MeetingAgentDefinition
    ) => {
        if (
            definitionHash(definition) !== ownership.definition.definitionHash ||
            definition.agentDefinitionId !== ownership.definition.agentDefinitionId ||
            definition.definitionVersion !== ownership.definition.definitionVersion
        )
            throw new Error("RECOVERY_UNAVAILABLE: definition binding differs");
        const resources = await resolveResourceBinding({
            packageRoot,
            definition,
            agentOptions: ownership.agentOptions
        });
        if (
            sha256Hex(encodeCanonicalJson(resources)) !==
            sha256Hex(encodeCanonicalJson(ownership.resources))
        )
            throw new Error("RECOVERY_UNAVAILABLE: resources differ");
    };
    const setup =
        (
            ownership: SessionOwnership,
            definition: MeetingAgentDefinition,
            purpose: Purpose,
            signal: AbortSignal
        ): AgentSetup =>
        async (agentCtx) => {
            signal.throwIfAborted();
            await verifyResources(ownership, definition);
            await ctx.agentPresets.mount(agentCtx, definition.dshPresetId);
            const ref = definition.agentInstructions;
            const text = (
                await readRoleResource(
                    packageRoot,
                    `agents/${ref.roleDefinitionId}/${ref.version}/AGENTS.md`
                )
            ).toString("utf8");
            agentCtx.systemPrompt.section({ name: "convivium:role-identity", order: 1, text });
            if (definition.toolFilter) agentCtx.tools.restrict(definition.toolFilter);
            if (purpose !== "delivery") agentCtx.tools.restrict({ allow: [] });
            if (!agentCtx.agent) throw new Error("RECOVERY_UNAVAILABLE: missing scoped Agent");
            await validateRoleSkills({
                skills: agentCtx.skills,
                definition,
                packageRoot,
                view: { scope: agentCtx.agent, cwd: agentCtx.agent.session.header.cwd, signal }
            });
            await verifyResources(ownership, definition);
            signal.throwIfAborted();
        };
    const remember = async (ownership: SessionOwnership, handle: AgentHandle, purpose: Purpose) => {
        if (
            handle.agent.id !== ownership.sessionId ||
            handle.agent.session.header.agentPreset !== ownership.resources.presetId ||
            handle.agent.session.header.parentSession !== undefined
        ) {
            await handle.dispose();
            throw new Error("RECOVERY_UNAVAILABLE: Session header differs");
        }
        handles.set(ownership.id, {
            handle,
            purpose,
            sessionId: ownership.sessionId,
            compositionHash: ownership.resources.compositionHash
        });
    };
    const resume = async (input: ResumeInput) => {
        const { ownership, definition, purpose, signal } = input;
        signal.throwIfAborted();
        if (
            (purpose === "delivery" &&
                (ownership.lifecycleStatus !== "active" ||
                    ownership.capabilityStatus !== "active")) ||
            (purpose === "provisioning" &&
                (ownership.lifecycleStatus !== "provisioning" ||
                    ownership.capabilityStatus !== "active")) ||
            (purpose === "cleanup" &&
                (ownership.lifecycleStatus === "closed" ||
                    ownership.capabilityStatus !== "revoked"))
        )
            throw new Error("RECOVERY_UNAVAILABLE: invalid ownership purpose");
        const current = entry(ownership);
        if (current?.purpose === purpose) return;
        if (current) await release(ownership, "Change meeting Agent scope");
        if (ctx.agents.get(SessionId(ownership.sessionId)))
            throw new Error("RECOVERY_UNAVAILABLE: unowned live Agent");
        await verifyResources(ownership, definition);
        const handle = await ctx.agents.resume({
            resumeSessionId: SessionId(ownership.sessionId),
            agentOptions: options(ownership),
            signal,
            setup: setup(ownership, definition, purpose, signal)
        });
        await remember(ownership, handle, purpose);
    };
    return {
        create: (input) =>
            serial(input.ownership.id, async () => {
                const { ownership, descriptor, definition, signal } = input;
                signal.throwIfAborted();
                const { descriptorHash, ...body } = descriptor;
                if (
                    ownership.lifecycleStatus !== "provisioning" ||
                    ownership.capabilityStatus !== "active" ||
                    Date.now() >= descriptor.expiresAt ||
                    descriptorHash !== sha256Hex(encodeCanonicalJson(body)) ||
                    descriptorHash !== ownership.descriptorHash ||
                    descriptor.descriptorId !== ownership.descriptorId ||
                    descriptor.meetingId !== ownership.meetingId ||
                    descriptor.identityId !== ownership.identityId ||
                    descriptor.sessionId !== ownership.sessionId ||
                    !["definition", "resources", "agentOptions"].every(
                        (key) =>
                            sha256Hex(encodeCanonicalJson(Reflect.get(descriptor, key))) ===
                            sha256Hex(encodeCanonicalJson(Reflect.get(ownership, key)))
                    )
                )
                    throw new Error("PREFLIGHT_EXPIRED: invalid creation binding");
                if (entry(ownership)) return;
                if (ctx.agents.get(SessionId(ownership.sessionId)))
                    throw new Error("RECOVERY_UNAVAILABLE: unowned live Agent");
                await verifyResources(ownership, definition);
                const handle = await ctx.agents.create({
                    sessionId: SessionId(ownership.sessionId),
                    meta: { agentPreset: definition.dshPresetId },
                    agentOptions: options(ownership),
                    signal,
                    setup: setup(ownership, definition, "provisioning", signal)
                });
                await remember(ownership, handle, "provisioning");
            }),
        resume: (input) => serial(input.ownership.id, () => resume(input)),
        deliver: (input) =>
            serial(input.ownership.id, async () => {
                input.signal.throwIfAborted();
                await input.authorize();
                const current = entry(input.ownership);
                if (
                    !current ||
                    current.purpose !== "delivery" ||
                    input.ownership.lifecycleStatus !== "active" ||
                    input.ownership.capabilityStatus !== "active" ||
                    !input.text.trim() ||
                    !input.deliveryId.trim()
                )
                    throw new Error("RECOVERY_UNAVAILABLE: no authorized delivery handle");
                current.handle.agent.followup({
                    id: MessageId(input.deliveryId),
                    role: "user",
                    content: [{ type: "text", text: input.text }],
                    source: { kind: "plugin", plugin: "convivium" }
                });
                const durable = await ctx.sessions.flush(current.handle.agent.session);
                await input.authorize();
                input.signal.throwIfAborted();
                return durable;
            }),
        suspend: (input) =>
            serial(input.ownership.id, () => release(input.ownership, input.reason)),
        stop: (input) =>
            serial(input.ownership.id, async () => {
                if (input.ownership.capabilityStatus !== "revoked")
                    throw new Error("RECOVERY_UNAVAILABLE: revoke before stop");
                if (!entry(input.ownership) && input.ownership.lifecycleStatus !== "closed")
                    await resume({ ...input, purpose: "cleanup" });
                await release(input.ownership, input.reason);
            }),
        disposeAll: async () => {
            closing = true;
            await Promise.allSettled([...pending.values()]);
            const errors: unknown[] = [];
            for (const [id, current] of handles) {
                try {
                    current.handle.agent.cancel({
                        kind: "hook",
                        reason: "Meeting Runtime shutdown"
                    });
                    await current.handle.agent.whenIdle();
                    await current.handle.dispose();
                    handles.delete(id);
                } catch (error) {
                    errors.push(error);
                }
            }
            if (errors.length) throw new AggregateError(errors, "Meeting Agent shutdown failed");
        }
    };
};
