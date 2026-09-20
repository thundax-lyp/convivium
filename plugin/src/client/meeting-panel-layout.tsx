import { createElement, type ReactElement } from "react";
import type { MeetingReadResultV1, MeetingSummaryV1 } from "@/protocol/index.js";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { renderObservabilitySections } from "./meeting-panel-sections.js";

export interface MeetingPanelLayoutProps {
    meetings: readonly MeetingSummaryV1[];
    selectedId?: string;
    detail?: MeetingReadResultV1;
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

export function renderMeetingPanelLayout(ctx: MeetingPanelLayoutProps): ReactElement {
    const selected = ctx.meetings.find((item) => item.meetingId === ctx.selectedId);
    return createElement(
        "section",
        { "data-testid": "convivium-meeting-panel", "aria-label": "Convivium meetings" },
        createElement("h2", null, "Meetings"),
        createElement(
            Button,
            { type: "button", variant: "outline", size: "sm", onClick: ctx.requestRefresh },
            "Refresh"
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
                  "Pause meeting"
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
                  "Resume meeting"
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
                  "End meeting"
              )
            : null,
        ctx.listError === undefined ? null : createElement("p", { role: "alert" }, ctx.listError),
        createElement(
            "ul",
            { "aria-label": "Meeting list" },
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
                        `${meeting.objective} (${meeting.lifecycle})`
                    )
                )
            )
        ),
        selected === undefined
            ? createElement("p", null, "Select a meeting.")
            : ctx.detail === undefined
              ? createElement("p", null, ctx.detailCached ? "Loading meeting." : "No detail.")
              : createElement(
                    "article",
                    { "aria-label": `Meeting ${selected.meetingId}` },
                    ctx.detailError === undefined
                        ? null
                        : createElement("p", { role: "alert" }, ctx.detailError),
                    renderObservabilitySections(ctx.detail)
                )
    );
}
