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

export function apply(ctx: Context, config: ConfigType): void {
    assertContinuableProvider(ctx, config.provider);
}
