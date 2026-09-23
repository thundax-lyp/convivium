import type { Context } from "@deepseek-ai/cordis";
import { createElement } from "react";
// Load the client Context and conversation slot augmentations without runtime imports.
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import contribution from "@convivium/dsh-plugin/remote";
import { en, MEETING_LOCALE_NS, zh } from "./locales.js";
import { createMeetingClient } from "./meeting-client.js";
import { ConviviumMeetingPanel } from "./meeting-panel.js";

export const name = "convivium-client";

export const inject = ["remote", "locale"] as const;

export async function apply(ctx: Context): Promise<void> {
    await ctx.remote.$mount(contribution);
    ctx.effect(
        () => ctx.locale.register(MEETING_LOCALE_NS, { zh, en }),
        "convivium-client: dictionaries"
    );
    const t = ctx.locale.bind(MEETING_LOCALE_NS);
    ctx.inject(["slots", "remote", "remote.conviviumMeetings"], (remoteContext) => {
        const api = createMeetingClient(remoteContext.remote);
        remoteContext.slots.inject("conversation.view", () =>
            remoteContext.slots.register(
                {
                    name: "conversation.view",
                    id: "convivium-meetings",
                    label: () => t("tab.meetings"),
                    order: 100,
                    locale: MEETING_LOCALE_NS
                },
                (props) =>
                    createElement(ConviviumMeetingPanel, {
                        api,
                        t: props.t,
                        locale: ctx.locale.getLocale().active
                    })
            )
        );
    });
}
