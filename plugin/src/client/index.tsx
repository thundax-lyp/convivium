import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import contribution from "@convivium/dsh-plugin/remote";
import { createMeetingClient } from "./meeting-client.js";
import { ConviviumMeetingPanel } from "./meeting-panel.js";

export const name = "convivium-client";

export const inject = ["remote"] as const;

export function apply(ctx: Context): void {
    ctx.inject(["slots", "remote", "remote.conviviumMeetings"], (remoteContext) => {
        void remoteContext.remote.$mount(contribution);
        remoteContext.slots.inject("conversation.view", () =>
            remoteContext.slots.register(
                {
                    name: "conversation.view",
                    id: "convivium-meetings",
                    label: "Meetings",
                    order: 100
                },
                (props) =>
                    ConviviumMeetingPanel({
                        ...props,
                        api: createMeetingClient(remoteContext.remote)
                    })
            )
        );
    });
}
