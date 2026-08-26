import type { Context } from "@deepseek-ai/cordis";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import { Config, type Config as ConfigType } from "./config.js";
import { requireContinuableProvider } from "./dsh/session-adapter.js";

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
}
