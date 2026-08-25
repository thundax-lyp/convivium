import type { Context } from "@deepseek-ai/cordis";

export const name = "convivium-client";

export const inject = [
    "@deepseek-ai/dsh-client-runtime",
    "@deepseek-ai/dsh-client-locale",
    "@deepseek-ai/dsh-client-ui-layout",
    "@deepseek-ai/dsh-client-ui-conversation",
    "@deepseek-ai/dsh-client-ui-primitives",
    "@deepseek-ai/dsh-client-ui-slots"
] as const;

export function apply(_ctx: Context): void {
    // Meeting UI registration will be added with its implementation.
}
