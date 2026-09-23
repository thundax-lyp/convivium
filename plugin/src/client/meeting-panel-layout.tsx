import * as React from "react";
import {
    useEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type ReactElement
} from "react";
import type { MeetingReadResult, MeetingSummary } from "@/protocol/index.js";
import { Button, Pill } from "@deepseek-ai/dsh-client-ui-primitives";
import type { MeetingTranslate } from "./locales.js";
import { lifecycleLabel } from "./meeting-panel-sections.js";
import { MeetingPanelOverview } from "./meeting-panel-overview.js";
import { MeetingPanelTimeline } from "./meeting-panel-timeline.js";
import {
    INITIAL_TIMELINE_FILTERS,
    type MeetingFocusTarget,
    type MeetingMode,
    type TimelineFilterState
} from "./meeting-workspace-state.js";

export interface MeetingPanelLayoutProps {
    locale?: string;
    meetings: readonly MeetingSummary[];
    selectedId?: string;
    detail?: MeetingReadResult;
    listCached: boolean;
    detailCached: boolean;
    listError?: string;
    detailError?: string;
    writePending: boolean;
    activeMode?: MeetingMode;
    setMode?(mode: MeetingMode): void;
    timelineFilters?: TimelineFilterState;
    viewportRevision?: number;
    onTimelineFiltersChange?(filters: TimelineFilterState): void;
    focusTarget?: MeetingFocusTarget;
    onFocusConsumed?(): void;
    onLocateInTimeline?(target: MeetingFocusTarget): void;
    onLocateInOverview?(target: MeetingFocusTarget): void;
    requestRefresh(): void;
    selectMeeting(meetingId: string): void;
    pauseMeeting(): Promise<void>;
    resumeMeeting(): Promise<void>;
    endMeeting(): Promise<void>;
}

const renderNavigator = (
    ctx: MeetingPanelLayoutProps,
    t: MeetingTranslate,
    selectMeeting: (meetingId: string) => void
): ReactElement => {
    return (
        <nav data-testid="meeting-navigator" aria-label={t("panel.navigator.title")}>
            <h3>{t("panel.navigator.title")}</h3>
            {ctx.listCached ? <p>{t("panel.navigator.stale")}</p> : null}
            {ctx.listError === undefined ? null : <p role="alert">{ctx.listError}</p>}
            {ctx.meetings.length === 0 ? <p>{t("panel.navigator.empty")}</p> : null}
            <ul aria-label={t("panel.list.aria")}>
                {ctx.meetings.map((meeting) => (
                    <li key={meeting.meetingId}>
                        <Button
                            type="button"
                            variant={meeting.meetingId === ctx.selectedId ? "primary" : "outline"}
                            size="sm"
                            onClick={() => selectMeeting(meeting.meetingId)}
                        >{`${meeting.objective} (${lifecycleLabel(meeting.lifecycle, t)})`}</Button>
                    </li>
                ))}
            </ul>
        </nav>
    );
};

const renderWorkspace = (ctx: MeetingPanelLayoutProps, t: MeetingTranslate): ReactElement => {
    const selected = ctx.meetings.find((item) => item.meetingId === ctx.selectedId);
    const mode = ctx.activeMode ?? "overview";
    const selectMode = (next: MeetingMode) => ctx.setMode?.(next);
    const moveMode = (event: React.KeyboardEvent, next: MeetingMode) => {
        event.preventDefault();
        selectMode(next);
        const tablist = event.currentTarget.parentElement;
        const target = tablist?.querySelector<HTMLButtonElement>(`#meeting-mode-${next}`);
        target?.focus();
    };
    return (
        <main data-testid="meeting-workspace">
            <Button type="button" variant="outline" size="sm" onClick={ctx.requestRefresh}>
                {t("panel.actions.refresh")}
            </Button>
            {selected === undefined ? (
                <p>{t("panel.selection.prompt")}</p>
            ) : ctx.detail === undefined ? (
                ctx.detailError === undefined ? (
                    <p>
                        {ctx.detailCached
                            ? t("panel.detail.loading")
                            : t("panel.detail.unavailable")}
                    </p>
                ) : (
                    <p role="alert">{ctx.detailError}</p>
                )
            ) : (
                <div>
                    <header data-testid="meeting-header">
                        <h3>{ctx.detail.objective.statement}</h3>
                        <Pill>{`${t("panel.header.status")}: ${lifecycleLabel(ctx.detail.lifecycle.status, t)}`}</Pill>
                        <p>{`${t("panel.header.version")}: ${ctx.detail.version}`}</p>
                        {ctx.detail.controls.includes("pause_meeting") ? (
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={ctx.writePending || ctx.detailCached}
                                onClick={() => void ctx.pauseMeeting()}
                            >
                                {t("panel.actions.pause")}
                            </Button>
                        ) : null}
                        {ctx.detail.controls.includes("resume_meeting") ? (
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={ctx.writePending || ctx.detailCached}
                                onClick={() => void ctx.resumeMeeting()}
                            >
                                {t("panel.actions.resume")}
                            </Button>
                        ) : null}
                        {ctx.detail.controls.includes("end_meeting") ? (
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={ctx.writePending || ctx.detailCached}
                                onClick={() => void ctx.endMeeting()}
                            >
                                {t("panel.actions.end")}
                            </Button>
                        ) : null}
                    </header>
                    {ctx.detailError === undefined ? null : <p role="alert">{ctx.detailError}</p>}
                    <div role="tablist">
                        <Button
                            id="meeting-mode-overview"
                            type="button"
                            role="tab"
                            aria-selected={mode === "overview"}
                            tabIndex={mode === "overview" ? 0 : -1}
                            variant={mode === "overview" ? "primary" : "outline"}
                            size="sm"
                            onClick={() => selectMode("overview")}
                            onKeyDown={(event: React.KeyboardEvent) => {
                                if (event.key === "ArrowRight") moveMode(event, "timeline");
                            }}
                        >
                            {t("panel.mode.overview")}
                        </Button>
                        <Button
                            id="meeting-mode-timeline"
                            type="button"
                            role="tab"
                            aria-selected={mode === "timeline"}
                            tabIndex={mode === "timeline" ? 0 : -1}
                            variant={mode === "timeline" ? "primary" : "outline"}
                            size="sm"
                            onClick={() => selectMode("timeline")}
                            onKeyDown={(event: React.KeyboardEvent) => {
                                if (event.key === "ArrowLeft") moveMode(event, "overview");
                            }}
                        >
                            {t("panel.mode.timeline")}
                        </Button>
                    </div>
                    <article
                        role="tabpanel"
                        aria-labelledby={`meeting-mode-${mode}`}
                        aria-label={t("panel.detail.aria", { id: selected.meetingId })}
                    >
                        {mode === "overview" ? (
                            <MeetingPanelOverview
                                detail={ctx.detail}
                                t={t}
                                focusTarget={ctx.focusTarget}
                                onFocusConsumed={ctx.onFocusConsumed}
                                onLocateInTimeline={ctx.onLocateInTimeline}
                            />
                        ) : (
                            <MeetingPanelTimeline
                                detail={ctx.detail}
                                filters={ctx.timelineFilters ?? INITIAL_TIMELINE_FILTERS}
                                viewportRevision={ctx.viewportRevision ?? 0}
                                locale={ctx.locale}
                                t={t}
                                onFiltersChange={ctx.onTimelineFiltersChange ?? (() => undefined)}
                                focusTarget={ctx.focusTarget}
                                onFocusConsumed={ctx.onFocusConsumed}
                                onLocateInOverview={ctx.onLocateInOverview}
                            />
                        )}
                    </article>
                </div>
            )}
        </main>
    );
};

const MeetingPanelLayout = ({
    ctx,
    t
}: {
    ctx: MeetingPanelLayoutProps;
    t: MeetingTranslate;
}): ReactElement => {
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
    return (
        <section data-testid="convivium-meeting-panel" aria-label={t("panel.aria")}>
            <h2>{t("panel.title")}</h2>
            {narrow ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={t("panel.navigator.open")}
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                        openerRef.current = event.currentTarget;
                        setDrawerOpen(true);
                    }}
                >
                    {selected?.objective ?? t("panel.navigator.current")}
                </Button>
            ) : null}
            <div
                data-testid="meeting-workspace-shell"
                style={
                    narrow
                        ? { display: "block" }
                        : {
                              display: "grid",
                              gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
                              gap: 16
                          }
                }
            >
                {narrow ? null : <aside>{navigator}</aside>}
                {renderWorkspace(ctx, t)}
            </div>
            {narrow && drawerOpen ? (
                <div>
                    <button
                        type="button"
                        aria-label={t("panel.navigator.close")}
                        onClick={closeDrawer}
                        style={{
                            position: "fixed",
                            inset: 0,
                            border: 0,
                            background: "rgba(0, 0, 0, 0.45)",
                            zIndex: 1
                        }}
                    />
                    <aside
                        role="dialog"
                        aria-modal={true}
                        aria-label={t("panel.navigator.title")}
                        style={{
                            position: "fixed",
                            inset: "0 auto 0 0",
                            width: "min(86vw, 320px)",
                            background: "Canvas",
                            zIndex: 2,
                            overflowY: "auto"
                        }}
                    >
                        {navigator}
                    </aside>
                </div>
            ) : null}
        </section>
    );
};

export const renderMeetingPanelLayout = (
    ctx: MeetingPanelLayoutProps,
    t: MeetingTranslate
): ReactElement => {
    return <MeetingPanelLayout ctx={ctx} t={t} />;
};
