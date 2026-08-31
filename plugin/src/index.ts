import { resolve } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import { Config, type Config as ConfigType } from "./config.js";
import { requireContinuableProvider, resolveMeetingCaller } from "./dsh/index.js";
import { registerLocalMeetingHttpRoutes } from "./http/index.js";
import { createCreateStatusRuntime } from "./runtime/index.js";
import { registerCreateAndStatusTools, registerSubmitAndControlTools } from "./tools/index.js";

export { Config };
export type { Config as ConfigType } from "./config.js";

export const name = "convivium";

export const inject = [
    "agents",
    "sessions",
    "subagents",
    "systemPrompt",
    "tools",
    "workspaceRegistry",
    "webServer"
] as const;

export function assertContinuableProvider(
    ctx: Pick<Context, "subagents">,
    providerName: string
): SubagentProvider {
    return requireContinuableProvider(ctx.subagents, providerName);
}

export interface PluginDisposerRegistry {
    add(disposer: () => void | Promise<void>): void;
    dispose(): Promise<void>;
}

export function createPluginDisposerRegistry(): PluginDisposerRegistry {
    const disposers: Array<() => void | Promise<void>> = [];
    let disposed = false;
    let disposal: Promise<void> | undefined;

    return {
        add(disposer) {
            if (disposed) {
                throw new Error("Convivium plugin lifecycle is already disposed.");
            }
            disposers.push(disposer);
        },
        async dispose() {
            if (disposal !== undefined) return disposal;
            disposed = true;
            const pending = disposers
                .splice(0)
                .reverse()
                .map((disposer) => {
                    try {
                        return Promise.resolve(disposer());
                    } catch (error) {
                        return Promise.reject(error);
                    }
                });
            disposal = Promise.allSettled(pending).then((results) => {
                const errors = results.flatMap((result) =>
                    result.status === "rejected" ? [result.reason] : []
                );
                if (errors.length > 0) {
                    throw new AggregateError(errors, "Convivium plugin disposal failed.");
                }
            });
            return disposal;
        }
    };
}

export function apply(ctx: Context, config: ConfigType): void {
    assertContinuableProvider(ctx, config.provider);

    const lifecycle = createPluginDisposerRegistry();
    if (typeof ctx.effect === "function") {
        ctx.effect(() => lifecycle.dispose, "convivium:lifecycle");
    }

    if (
        typeof ctx.tools?.register !== "function" ||
        typeof ctx.subagents?.startContinuable !== "function" ||
        typeof ctx.subagents?.listChildren !== "function" ||
        typeof ctx.subagents?.interrupt !== "function" ||
        typeof ctx.subagents?.drainContinuableChildren !== "function"
    ) {
        return;
    }

    const runtime = createCreateStatusRuntime({
        dataRoot: resolve(process.cwd(), config.dataRoot ?? ".convivium"),
        provider: config.provider,
        continuable: ctx.subagents,
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        },
        maxParticipants: config.maxParticipants,
        outboxPollMs: config.outboxPollMs,
        speakerAttemptTimeoutMs: config.speakerTimeoutMs
    });
    lifecycle.add(() => runtime.dispose());
    if (ctx.webServer.host === "127.0.0.1") {
        lifecycle.add(registerLocalMeetingHttpRoutes(ctx.webServer, runtime));
    }
    const callers = {
        async resolve(agent: Parameters<typeof resolveMeetingCaller>[0], signal: AbortSignal) {
            const meetingCaller = await resolveMeetingCaller(agent, runtime, signal);
            if (!("ok" in meetingCaller)) return { ...meetingCaller, agent };
            // DSH's Agent registry is the host-verified boundary for a top-level
            // caller. An ownership lookup failure must never grant Captain access.
            if (
                ctx.agents.get(String(agent.id) as never) === agent &&
                agent.session.header.parentSession === undefined
            ) {
                return { kind: "captain" as const, sessionId: String(agent.id), agent };
            }
            return meetingCaller;
        }
    };
    for (const dispose of [
        ...registerCreateAndStatusTools({ registry: ctx.tools, runtime, callers }),
        ...registerSubmitAndControlTools({ registry: ctx.tools, runtime, callers })
    ]) {
        lifecycle.add(dispose);
    }
}
