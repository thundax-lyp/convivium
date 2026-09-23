import {
    createElement,
    useEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type ReactElement
} from "react";
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

function renderNavigator(
    ctx: MeetingPanelLayoutProps,
    t: MeetingTranslate,
    selectMeeting: (meetingId: string) => void
): ReactElement {
    return createElement(
        "nav",
        { "data-testid": "meeting-navigator", "aria-label": t("panel.navigator.title") },
        createElement("h3", null, t("panel.navigator.title")),
        ctx.listCached ? createElement("p", null, t("panel.navigator.stale")) : null,
        ctx.listError === undefined ? null : createElement("p", { role: "alert" }, ctx.listError),
        ctx.meetings.length === 0 ? createElement("p", null, t("panel.navigator.empty")) : null,
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
                            onClick: () => selectMeeting(meeting.meetingId)
                        },
                        `${meeting.objective} (${lifecycleLabel(meeting.lifecycle, t)})`
                    )
                )
            )
        )
    );
}

function renderWorkspace(ctx: MeetingPanelLayoutProps, t: MeetingTranslate): ReactElement {
    const selected = ctx.meetings.find((item) => item.meetingId === ctx.selectedId);
    return createElement(
        "main",
        { "data-testid": "meeting-workspace" },
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

function MeetingPanelLayout({
    ctx,
    t
}: {
    ctx: MeetingPanelLayoutProps;
    t: MeetingTranslate;
}): ReactElement {
    const [narrow, setNarrow] = useState(
        () => window.matchMedia?.("(max-width: 760px)").matches ?? false
    );
    const [drawerOpen, setDrawerOpen] = useState(false);
    const openerRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        const query = window.matchMedia?.("(max-width: 760px)");
        if (query === undefined) return;
        const update = (event: MediaQueryListEvent) => {
            setNarrow(event.matches);
            if (!event.matches) setDrawerOpen(false);
        };
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    const closeDrawer = () => {
        setDrawerOpen(false);
        openerRef.current?.focus();
    };

    useEffect(() => {
        if (!drawerOpen) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeDrawer();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [drawerOpen]);

    const selectMeeting = (meetingId: string) => {
        ctx.selectMeeting(meetingId);
        if (narrow) closeDrawer();
    };
    const selected = ctx.meetings.find((meeting) => meeting.meetingId === ctx.selectedId);
    const navigator = renderNavigator(ctx, t, selectMeeting);

    return createElement(
        "section",
        { "data-testid": "convivium-meeting-panel", "aria-label": t("panel.aria") },
        createElement("h2", null, t("panel.title")),
        narrow
            ? createElement(
                  Button,
                  {
                      type: "button",
                      variant: "outline",
                      size: "sm",
                      "aria-label": t("panel.navigator.open"),
                      onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
                          openerRef.current = event.currentTarget;
                          setDrawerOpen(true);
                      }
                  },
                  selected?.objective ?? t("panel.navigator.current")
              )
            : null,
        createElement(
            "div",
            {
                "data-testid": "meeting-workspace-shell",
                style: narrow
                    ? { display: "block" }
                    : {
                          display: "grid",
                          gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
                          gap: 16
                      }
            },
            narrow ? null : createElement("aside", null, navigator),
            renderWorkspace(ctx, t)
        ),
        narrow && drawerOpen
            ? createElement(
                  "div",
                  null,
                  createElement("button", {
                      type: "button",
                      "aria-label": t("panel.navigator.close"),
                      onClick: closeDrawer,
                      style: {
                          position: "fixed",
                          inset: 0,
                          border: 0,
                          background: "rgba(0, 0, 0, 0.45)",
                          zIndex: 1
                      }
                  }),
                  createElement(
                      "aside",
                      {
                          role: "dialog",
                          "aria-modal": true,
                          "aria-label": t("panel.navigator.title"),
                          style: {
                              position: "fixed",
                              inset: "0 auto 0 0",
                              width: "min(86vw, 320px)",
                              background: "Canvas",
                              zIndex: 2,
                              overflowY: "auto"
                          }
                      },
                      navigator
                  )
              )
            : null
    );
}

export function renderMeetingPanelLayout(
    ctx: MeetingPanelLayoutProps,
    t: MeetingTranslate
): ReactElement {
    return createElement(MeetingPanelLayout, { ctx, t });
}
