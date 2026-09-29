import * as React from "react";
import type { ReactElement } from "react";
import { Button, Pill } from "@deepseek-ai/dsh-client-ui-primitives";
import {
    INITIAL_TIMELINE_FILTERS,
    lifecycleLabel,
    type MeetingMode,
    type MeetingPanelLayoutProps,
    type MeetingTranslate
} from "@/client/meeting/shared/index.ts";
import { MeetingPanelOverview } from "./overview/index.ts";
import { MeetingPanelTimeline } from "./timeline/index.ts";

export const MeetingWorkspace = ({
    ctx,
    t
}: {
    ctx: MeetingPanelLayoutProps;
    t: MeetingTranslate;
}): ReactElement => {
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
                        {ctx.localFeedback}
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
                                if (event.key === "ArrowRight") {
                                    moveMode(event, "timeline");
                                }
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
                                if (event.key === "ArrowLeft") {
                                    moveMode(event, "overview");
                                }
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
