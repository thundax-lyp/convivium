import { MessageId, ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent, AgentHandle, AgentSetup } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type {} from "@deepseek-ai/dsh-agent-preset-registry";
import type {} from "@deepseek-ai/dsh-session-persistence";
import type {} from "@deepseek-ai/dsh-tools";
import type { MeetingAgentDefinition, PreparedDescriptor } from "@/role-composition/index.ts";
import { definitionHash } from "@/role-composition/index.ts";
import { resolveResourceBinding, readRoleResource } from "@/role-composition/index.ts";
import { validateRoleSkills, matchesPreparedDescriptor } from "@/role-composition/index.ts";
import { isDeepStrictEqual } from "node:util";
import type { SessionOwnership } from "@/repository/index.ts";
import type { CodexAcpProviderPort } from "./acp-codex/index.ts";
import { meetingAgentDirectory } from "./meeting-agent-directory.ts";

declare module "@deepseek-ai/dsh-llm" {
    interface MessageSourceMap {
        convivium: { kind: "convivium" };
    }
}

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
    deliverObserved(input: {
        ownership: SessionOwnership;
        deliveryId: string;
        text: string;
        authorize: () => Promise<void>;
        signal: AbortSignal;
    }): Promise<{
        durable: boolean;
        outcome: "completed" | "failed";
        failureCode?: string;
        failureSummary?: string;
    }>;
    suspend(input: { ownership: SessionOwnership; reason: string }): Promise<void>;
    stop(input: {
        ownership: SessionOwnership;
        definition: MeetingAgentDefinition;
        reason: string;
        signal: AbortSignal;
    }): Promise<void>;
    disposeMeeting(meetingId: string): Promise<void>;
    disposeAll(): Promise<void>;
}

type DeliveryInput = Parameters<MeetingAgentOwner["deliver"]>[0];

const deliverToHandle = async ({
    ctx,
    handle,
    input,
    observe,
    acpCodex
}: {
    ctx: Context;
    handle: AgentHandle;
    input: DeliveryInput;
    observe: boolean;
    acpCodex?: CodexAcpProviderPort;
}): Promise<{
    durable: boolean;
    failure?: { code: string; summary: string };
}> => {
    let claimedTurn: number | undefined;
    let failure: { code: string; summary: string } | undefined;
    const disposeClaim = observe
        ? ctx.on("agent/inbox/claimed", ({ agent, message, turn }) => {
              if (agent === handle.agent && message.id === input.deliveryId) {
                  claimedTurn = turn;
              }
          })
        : undefined;
    const disposeError = observe
        ? ctx.on("agent/error", ({ agent, turn, error }) => {
              if (agent !== handle.agent || turn !== claimedTurn) {
                  return;
              }
              failure = {
                  code:
                      error && typeof error === "object" && "code" in error
                          ? String(error.code)
                          : "AGENT_TURN_FAILED",
                  summary: error instanceof Error ? error.message : "Agent turn failed"
              };
          })
        : undefined;
    try {
        handle.agent.followup({
            id: MessageId(input.deliveryId),
            role: "user",
            content: [{ type: "text", text: input.text }],
            source: { kind: "convivium" }
        });
        const durable = await ctx.sessions.flush(handle.agent.session);
        if (acpCodex) {
            await acpCodex.markDeliveryQueued(handle.agent.id, input.deliveryId);
        }
        await input.authorize();
        input.signal.throwIfAborted();
        if (observe) {
            await handle.agent.whenIdle();
            input.signal.throwIfAborted();
            if (claimedTurn === undefined && !acpCodex) {
                handle.agent.steer({
                    id: MessageId(`${input.deliveryId}:wake`),
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "继续处理同一批次中已经排队的会议通知；此消息只用于唤醒，不形成新的会议事实。"
                        }
                    ],
                    source: { kind: "convivium" }
                });
                await handle.agent.whenIdle();
                input.signal.throwIfAborted();
                if (claimedTurn === undefined) {
                    throw new Error("DELIVERY_NOT_CLAIMED");
                }
            }
        }
        if (acpCodex) {
            await acpCodex.checkpoint(handle.agent.id, input.signal);
            await acpCodex.finishDelivery(handle.agent.id, input.deliveryId, input.signal);
            return { durable: true };
        }
        return failure === undefined ? { durable } : { durable, failure };
    } finally {
        disposeClaim?.();
        disposeError?.();
    }
};

export const createMeetingAgentOwner = ({
    ctx,
    packageRoot,
    workspaceRoot,
    acpCodex
}: {
    ctx: Context;
    packageRoot: string;
    workspaceRoot: string;
    acpCodex?: CodexAcpProviderPort;
}): MeetingAgentOwner => {
    const directory = (ownership: SessionOwnership, create = false) =>
        meetingAgentDirectory({
            workspaceRoot,
            meetingId: ownership.meetingId,
            identityId: ownership.identityId,
            create
        });
    const options = (ownership: SessionOwnership) => ({
        provider: ownership.agentOptions.provider,
        model: ownership.agentOptions.model,
        ...(ownership.agentOptions.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: ReasoningEffortId(ownership.agentOptions.reasoningEffort) })
    });
    const handles = new Map<
        string,
        {
            handle: AgentHandle;
            purpose: Purpose;
            sessionId: string;
            compositionHash: string;
            meetingId: string;
        }
    >();
    const provisioningRestrictions = new WeakMap<Agent, () => void>();
    const pending = new Map<string, Promise<unknown>>();
    let closing = false;
    const serial = <T>(key: string, run: () => Promise<T>): Promise<T> => {
        if (closing) {
            return Promise.reject(new Error("RECOVERY_UNAVAILABLE: owner is stopping"));
        }
        const result = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
        pending.set(key, result);
        void result
            .finally(() => {
                if (pending.get(key) === result) {
                    pending.delete(key);
                }
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
        ) {
            throw new Error("OWNERSHIP_CONFLICT");
        }
        return current;
    };
    const release = async (ownership: SessionOwnership, reason: string) => {
        const current = entry(ownership);
        if (!current) {
            return;
        }
        current.handle.agent.cancel({ kind: "hook", reason });
        if (ownership.agentOptions.provider === "acp-codex") {
            if (!acpCodex) {
                throw new Error("ACP_CODEX_CONFIG_INVALID: provider unavailable");
            }
            await acpCodex.stopSession(ownership.sessionId);
        }
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
            definition.agentDefinitionId !== ownership.definition.agentDefinitionId
        ) {
            throw new Error("RECOVERY_UNAVAILABLE: definition binding differs");
        }
        const resources = await resolveResourceBinding({
            packageRoot,
            definition,
            agentOptions: ownership.agentOptions
        });
        if (!isDeepStrictEqual(resources, ownership.resources)) {
            throw new Error("RECOVERY_UNAVAILABLE: resources differ");
        }
    };
    const setup =
        (
            ownership: SessionOwnership,
            definition: MeetingAgentDefinition,
            purpose: Purpose,
            signal: AbortSignal
        ): AgentSetup =>
        async (agentCtx, agent) => {
            signal.throwIfAborted();
            const header = agent.session.header;
            if (
                !header ||
                header.cwd !== (await directory(ownership)) ||
                header.agentPreset !== ownership.resources.presetId ||
                header.parentSession !== undefined
            ) {
                throw new Error("RECOVERY_UNAVAILABLE: Session header differs before publication");
            }
            await verifyResources(ownership, definition);
            await ctx.agentPresets.mount(agentCtx, definition.dshPresetId);
            const ref = definition.agentInstructions;
            const text = (
                await readRoleResource(packageRoot, `agents/${ref.roleDefinitionId}/AGENTS.md`)
            ).toString("utf8");
            agentCtx.systemPrompt.section({ name: "convivium:role-identity", order: 1, text });
            if (definition.toolFilter) {
                agentCtx.tools.restrict(definition.toolFilter);
            }
            if (purpose !== "delivery") {
                const releaseRestriction = agentCtx.tools.restrict({ allow: [] });
                if (purpose === "provisioning" && ownership.agentOptions.provider === "acp-codex") {
                    provisioningRestrictions.set(agent, releaseRestriction);
                }
            }
            await validateRoleSkills({
                skills: ctx.skills,
                definition,
                packageRoot,
                view: { scope: agent, cwd: agent.session.header.cwd, signal }
            });
            await verifyResources(ownership, definition);
            signal.throwIfAborted();
            if (ownership.agentOptions.provider === "acp-codex") {
                if (!acpCodex) {
                    throw new Error("ACP_CODEX_CONFIG_INVALID: provider unavailable");
                }
                await acpCodex.prepareSession(agent, purpose, signal);
            }
        };
    const remember = async (ownership: SessionOwnership, handle: AgentHandle, purpose: Purpose) => {
        if (
            handle.agent.id !== ownership.sessionId ||
            handle.agent.session.header.cwd !== (await directory(ownership)) ||
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
            compositionHash: ownership.resources.compositionHash,
            meetingId: ownership.meetingId
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
        ) {
            throw new Error("RECOVERY_UNAVAILABLE: invalid ownership purpose");
        }
        const current = entry(ownership);
        if (current?.purpose === purpose) {
            return;
        }
        if (
            current?.purpose === "provisioning" &&
            purpose === "delivery" &&
            ownership.agentOptions.provider === "acp-codex"
        ) {
            const agent = current.handle.agent;
            const header = agent.session.header;
            const releaseRestriction = provisioningRestrictions.get(agent);
            if (
                !acpCodex ||
                !releaseRestriction ||
                agent.id !== ownership.sessionId ||
                header.cwd !== (await directory(ownership)) ||
                header.agentPreset !== ownership.resources.presetId ||
                header.parentSession !== undefined ||
                agent.options.provider !== ownership.agentOptions.provider ||
                agent.options.model !== ownership.agentOptions.model ||
                agent.options.reasoningEffort !== ownership.agentOptions.reasoningEffort
            ) {
                throw new Error("RECOVERY_UNAVAILABLE: ACP warm activation binding differs");
            }
            await verifyResources(ownership, definition);
            await validateRoleSkills({
                skills: ctx.skills,
                definition,
                packageRoot,
                view: { scope: agent, cwd: header.cwd, signal }
            });
            signal.throwIfAborted();
            await acpCodex.prepareSession(agent, "delivery", signal);
            signal.throwIfAborted();
            releaseRestriction();
            provisioningRestrictions.delete(agent);
            current.purpose = "delivery";
            return;
        }
        if (current) {
            await release(ownership, "Change meeting Agent scope");
        }
        if (ctx.agents.get(SessionId(ownership.sessionId))) {
            throw new Error("RECOVERY_UNAVAILABLE: unowned live Agent");
        }
        await verifyResources(ownership, definition);
        const handle = await ctx.agents.resume({
            resumeSessionId: SessionId(ownership.sessionId),
            agentOptions: options(ownership),
            signal,
            setup: setup(ownership, definition, purpose, signal)
        });
        await remember(ownership, handle, purpose);
    };
    const deliver = async (input: DeliveryInput, observe: boolean) => {
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
        ) {
            throw new Error("RECOVERY_UNAVAILABLE: no authorized delivery handle");
        }
        if (input.ownership.agentOptions.provider !== "acp-codex") {
            return deliverToHandle({ ctx, handle: current.handle, input, observe });
        }
        if (!acpCodex) {
            throw new Error("ACP_CODEX_CONFIG_INVALID: provider unavailable");
        }
        const state = acpCodex.deliveryState(input.ownership.sessionId, input.deliveryId);
        await acpCodex.beginDelivery({
            sessionId: input.ownership.sessionId,
            deliveryId: input.deliveryId,
            text: input.text
        });
        if (state === "completed") {
            return { durable: true };
        }
        if (state !== "unseen") {
            await acpCodex.reconcileSession(input.ownership.sessionId, input.signal);
            if (
                acpCodex.deliveryState(input.ownership.sessionId, input.deliveryId) === "completed"
            ) {
                return { durable: true };
            }
            throw new Error(
                acpCodex.blockFor(input.ownership.sessionId)?.code ?? "ACP_CODEX_RECOVERY_REQUIRED"
            );
        }
        try {
            return await deliverToHandle({
                ctx,
                handle: current.handle,
                input,
                observe: true,
                acpCodex
            });
        } catch (cause) {
            // Reconcile durable receipts or persist a conservative block; never enqueue again.
            await acpCodex.reconcileSession(
                input.ownership.sessionId,
                new AbortController().signal
            );
            throw cause;
        }
    };
    return {
        create: (input) =>
            serial(input.ownership.id, async () => {
                const { ownership, descriptor, definition, signal } = input;
                signal.throwIfAborted();
                if (
                    ownership.lifecycleStatus !== "provisioning" ||
                    ownership.capabilityStatus !== "active" ||
                    !matchesPreparedDescriptor(descriptor, ownership, Date.now())
                ) {
                    throw new Error("PREFLIGHT_EXPIRED: invalid creation binding");
                }
                if (entry(ownership)) {
                    return;
                }
                if (ctx.agents.get(SessionId(ownership.sessionId))) {
                    throw new Error("RECOVERY_UNAVAILABLE: unowned live Agent");
                }
                await verifyResources(ownership, definition);
                const handle = await ctx.agents.create({
                    sessionId: SessionId(ownership.sessionId),
                    meta: {
                        agentPreset: definition.dshPresetId,
                        cwd: await directory(ownership, true)
                    },
                    agentOptions: options(ownership),
                    signal,
                    setup: setup(ownership, definition, "provisioning", signal)
                });
                try {
                    if (!(await ctx.sessions.flush(handle.agent.session))) {
                        throw new Error("RECOVERY_UNAVAILABLE: Session was not persisted");
                    }
                } catch (error) {
                    await handle.dispose();
                    throw error;
                }
                await remember(ownership, handle, "provisioning");
            }),
        resume: (input) => serial(input.ownership.id, () => resume(input)),
        deliver: (input) =>
            serial(input.ownership.id, async () => (await deliver(input, false)).durable),
        deliverObserved: (input) =>
            serial(input.ownership.id, async () => {
                const result = await deliver(input, true);
                return result.failure === undefined
                    ? { durable: result.durable, outcome: "completed" as const }
                    : {
                          durable: result.durable,
                          outcome: "failed" as const,
                          failureCode: result.failure.code,
                          failureSummary: result.failure.summary
                      };
            }),
        suspend: (input) =>
            serial(input.ownership.id, () => release(input.ownership, input.reason)),
        stop: (input) =>
            serial(input.ownership.id, async () => {
                if (input.ownership.capabilityStatus !== "revoked") {
                    throw new Error("RECOVERY_UNAVAILABLE: revoke before stop");
                }
                if (!entry(input.ownership) && input.ownership.lifecycleStatus !== "closed") {
                    await resume({ ...input, purpose: "cleanup" });
                }
                await release(input.ownership, input.reason);
            }),
        disposeMeeting: async (meetingId) => {
            const errors: unknown[] = [];
            for (const [id, current] of handles) {
                if (current.meetingId !== meetingId) {
                    continue;
                }
                try {
                    current.handle.agent.cancel({ kind: "hook", reason: "Meeting deleted" });
                    if (current.handle.agent.options.provider === "acp-codex") {
                        if (!acpCodex) {
                            throw new Error("ACP_CODEX_CONFIG_INVALID: provider unavailable");
                        }
                        await acpCodex.stopSession(current.sessionId);
                    }
                    await current.handle.agent.whenIdle();
                    await current.handle.dispose();
                    handles.delete(id);
                } catch (error) {
                    errors.push(error);
                }
            }
            if (errors.length) {
                throw new AggregateError(errors, "Meeting Session cleanup failed");
            }
        },
        disposeAll: async () => {
            closing = true;
            const errors: unknown[] = [];
            // Cancel ACP work before waiting for its pending delivery queue.
            for (const current of handles.values()) {
                if (current.handle.agent.options.provider !== "acp-codex") {
                    continue;
                }
                try {
                    current.handle.agent.cancel({
                        kind: "hook",
                        reason: "Meeting Runtime shutdown"
                    });
                    if (current.handle.agent.options.provider === "acp-codex") {
                        if (!acpCodex) {
                            throw new Error("ACP_CODEX_CONFIG_INVALID: provider unavailable");
                        }
                        await acpCodex.stopSession(current.sessionId);
                    }
                } catch (error) {
                    errors.push(error);
                }
            }
            await Promise.allSettled([...pending.values()]);
            for (const [id, current] of handles) {
                try {
                    current.handle.agent.cancel({
                        kind: "hook",
                        reason: "Meeting Runtime shutdown"
                    });
                    if (current.handle.agent.options.provider === "acp-codex") {
                        if (!acpCodex) {
                            throw new Error("ACP_CODEX_CONFIG_INVALID: provider unavailable");
                        }
                        await acpCodex.stopSession(current.sessionId);
                    }
                } catch (error) {
                    errors.push(error);
                }
                try {
                    await current.handle.agent.whenIdle();
                } catch (error) {
                    errors.push(error);
                }
                try {
                    await current.handle.dispose();
                    handles.delete(id);
                } catch (error) {
                    errors.push(error);
                }
            }
            if (errors.length) {
                throw new AggregateError(errors, "Meeting Agent shutdown failed");
            }
        }
    };
};
