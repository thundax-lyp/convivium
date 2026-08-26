import type { Context } from "@deepseek-ai/cordis";
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

export function apply(_ctx: Context, _config: ConfigType): void {
    // Meeting runtime registration will be added with its implementation.
}
