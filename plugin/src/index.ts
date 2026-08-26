import type { Context } from "@deepseek-ai/cordis";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import { Config, type Config as ConfigType } from "./config.js";

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
    const provider = ctx.subagents.getProvider(providerName);

    if (provider === undefined) {
        throw new Error(
            `Convivium requires continuable subagent provider "${providerName}" ` +
                "from the host DSH 0.1.1-rc.2 profile; it is not registered."
        );
    }

    if (typeof provider.prepareContinuable !== "function") {
        throw new Error(
            `Convivium requires provider "${providerName}" to implement prepareContinuable() ` +
                "in the host DSH 0.1.1-rc.2 profile."
        );
    }

    return provider;
}

export function apply(ctx: Context, config: ConfigType): void {
    assertContinuableProvider(ctx, config.provider);
}
