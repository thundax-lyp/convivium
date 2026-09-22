import { createElement, type ReactElement } from "react";
import type { MeetingReadResult, MeetingSummary } from "@/protocol/index.js";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { MeetingTranslate } from "./locales.js";
import { lifecycleLabel, renderObservabilitySections } from "./meeting-panel-sections.js";

export interface MeetingPanelLayoutProps {
    meetings: readonly MeetingSummary[];
    selectedId?: string;
    detail?: MeetingReadResult;
    listCached: boolean;
    detailCached: boolean;
    listError?: string;
    detailError?: string;
    writePending: boolean;
    requestRefresh(): void;
    selectMeeting(meetingId: string): void;
    pauseMeeting(): Promise<void>;
    resumeMeeting(): Promise<void>;
    endMeeting(): Promise<void>;
}

export function renderMeetingPanelLayout(
    ctx: MeetingPanelLayoutProps,
    t: MeetingTranslate
): ReactElement {
    const selected = ctx.meetings.find((item) => item.meetingId === ctx.selectedId);
    return createElement(
        "section",
        { "data-testid": "convivium-meeting-panel", "aria-label": t("panel.aria") },
        createElement("h2", null, t("panel.title")),
        createElement(
            Button,
            { type: "button", variant: "outline", size: "sm", onClick: ctx.requestRefresh },
            t("panel.actions.refresh")
        ),
        ctx.detail?.controls.includes("pause_meeting")
            ? createElement(
                  Button,
                  {
                      type: "button",
                      variant: "primary",
                      size: "sm",
                      disabled: ctx.writePending || ctx.detailCached,
                      onClick: () => void ctx.pauseMeeting()
                  },
                  t("panel.actions.pause")
              )
            : null,
        ctx.detail?.controls.includes("resume_meeting")
            ? createElement(
                  Button,
                  {
                      type: "button",
                      variant: "primary",
                      size: "sm",
                      disabled: ctx.writePending || ctx.detailCached,
                      onClick: () => void ctx.resumeMeeting()
                  },
                  t("panel.actions.resume")
              )
            : null,
        ctx.detail?.controls.includes("end_meeting")
            ? createElement(
                  Button,
                  {
                      type: "button",
                      variant: "primary",
                      size: "sm",
                      disabled: ctx.writePending || ctx.detailCached,
                      onClick: () => void ctx.endMeeting()
                  },
                  t("panel.actions.end")
              )
            : null,
        ctx.listError === undefined ? null : createElement("p", { role: "alert" }, ctx.listError),
        createElement(
            "ul",
            { "aria-label": t("panel.list.aria") },
            ctx.meetings.map((meeting) =>
                createElement(
                    "li",
                    { key: meeting.meetingId },
                    createElement(
                        Button,
                        {
                            type: "button",
                            variant: meeting.meetingId === ctx.selectedId ? "primary" : "outline",
                            size: "sm",
                            onClick: () => ctx.selectMeeting(meeting.meetingId)
                        },
                        `${meeting.objective} (${lifecycleLabel(meeting.lifecycle, t)})`
                    )
                )
            )
        ),
        selected === undefined
            ? createElement("p", null, t("panel.selection.prompt"))
            : ctx.detail === undefined
              ? ctx.detailError === undefined
                  ? createElement(
                        "p",
                        null,
                        ctx.detailCached ? t("panel.detail.loading") : t("panel.detail.unavailable")
                    )
                  : createElement("p", { role: "alert" }, ctx.detailError)
              : createElement(
                    "article",
                    { "aria-label": t("panel.detail.aria", { id: selected.meetingId }) },
                    ctx.detailError === undefined
                        ? null
                        : createElement("p", { role: "alert" }, ctx.detailError),
                    renderObservabilitySections(ctx.detail, t)
                )
    );
}
