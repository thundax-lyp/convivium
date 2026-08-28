import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import { ConviviumMeetingPanel } from "./meeting-panel.js";

export const name = "convivium-client";

export const inject = ["slots"] as const;

export function apply(ctx: Context): void {
    ctx.slots.inject("conversation.view", () =>
        ctx.slots.register(
            {
                name: "conversation.view",
                id: "convivium-meetings",
                label: "Meetings",
                order: 100
            },
            ConviviumMeetingPanel
        )
    );
}
