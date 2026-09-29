import type { Context } from "@deepseek-ai/cordis";
import * as React from "react";
// Load the client Context and conversation slot augmentations without runtime imports.
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import contribution from "@convivium/dsh-plugin/remote";
import { en, MEETING_LOCALE_NS, zh } from "./meeting/index.ts";
import { createMeetingClient } from "./meeting/index.ts";
import { ConviviumMeetingPanel } from "./meeting/index.ts";
import { MeetingTranslationProvider } from "./meeting/index.ts";

export const name = "convivium-client";

export const inject = ["remote", "locale"] as const;

export const apply = async (ctx: Context): Promise<void> => {
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
                (props) => (
                    <MeetingTranslationProvider t={props.t}>
                        <ConviviumMeetingPanel api={api} locale={ctx.locale.getLocale().active} />
                    </MeetingTranslationProvider>
                )
            )
        );
    });
};
