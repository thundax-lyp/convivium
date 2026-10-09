import { MessageId, ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import type { Context } from "@deepseek-ai/cordis";
import type { AgentHandle, AgentSetup } from "@deepseek-ai/dsh-agent";
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
    disposeAll(): Promise<void>;
}

type DeliveryInput = Parameters<MeetingAgentOwner["deliver"]>[0];

const deliverToHandle = async ({
    ctx,
    handle,
    input,
    observe
}: {
    ctx: Context;
    handle: AgentHandle;
    input: DeliveryInput;
    observe: boolean;
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
        await input.authorize();
        input.signal.throwIfAborted();
        if (observe) {
            await handle.agent.whenIdle();
            input.signal.throwIfAborted();
            if (claimedTurn === undefined) {
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
        return failure === undefined ? { durable } : { durable, failure };
    } finally {
        disposeClaim?.();
        disposeError?.();
    }
};

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
                agentCtx.tools.restrict({ allow: [] });
            }
            await validateRoleSkills({
                skills: ctx.skills,
                definition,
                packageRoot,
                view: { scope: agent, cwd: agent.session.header.cwd, signal }
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
        ) {
            throw new Error("RECOVERY_UNAVAILABLE: invalid ownership purpose");
        }
        const current = entry(ownership);
        if (current?.purpose === purpose) {
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
        return deliverToHandle({ ctx, handle: current.handle, input, observe });
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
                    meta: { agentPreset: definition.dshPresetId },
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
            if (errors.length) {
                throw new AggregateError(errors, "Meeting Agent shutdown failed");
            }
        }
    };
};
