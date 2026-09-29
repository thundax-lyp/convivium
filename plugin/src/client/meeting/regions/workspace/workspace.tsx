import * as React from "react";
import type { ReactElement } from "react";
import { Button, Pill } from "@deepseek-ai/dsh-client-ui-primitives";
import {
    INITIAL_TIMELINE_FILTERS,
    lifecycleLabel,
    type MeetingMode,
    type MeetingPanelLayoutProps
} from "@/client/meeting/shared/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { MeetingPanelOverview } from "./overview/index.ts";
import { MeetingPanelTimeline } from "./timeline/index.ts";
import styles from "./workspace.module.css";

export const MeetingWorkspace = (props: MeetingPanelLayoutProps): ReactElement => {
    const t = useMeetingTranslate();
    const selected = props.meetings.find((item) => item.meetingId === props.selectedId);
    const mode = props.activeMode ?? "overview";
    const selectMode = (next: MeetingMode) => props.setMode?.(next);
    const moveMode = (event: React.KeyboardEvent, next: MeetingMode) => {
        event.preventDefault();
        selectMode(next);
        const tablist = event.currentTarget.parentElement;
        const target = tablist?.querySelector<HTMLButtonElement>(`#meeting-mode-${next}`);
        target?.focus();
    };
    return (
        <main data-testid="meeting-workspace" className={styles.main}>
            <Button type="button" variant="outline" size="sm" onClick={props.requestRefresh}>
                {t("panel.actions.refresh")}
            </Button>
            {selected === undefined ? (
                <p>{t("panel.selection.prompt")}</p>
            ) : props.detail === undefined ? (
                props.detailError === undefined ? (
                    <p>
                        {props.detailCached
                            ? t("panel.detail.loading")
                            : t("panel.detail.unavailable")}
                    </p>
                ) : (
                    <p role="alert">{props.detailError}</p>
                )
            ) : (
                <div>
                    <header data-testid="meeting-header">
                        <h3>{props.detail.objective.statement}</h3>
                        <Pill>{`${t("panel.header.status")}: ${lifecycleLabel(props.detail.lifecycle.status, t)}`}</Pill>
                        <p>{`${t("panel.header.version")}: ${props.detail.version}`}</p>
                        {props.detail.controls.includes("pause_meeting") ? (
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={props.writePending || props.detailCached}
                                onClick={() => void props.pauseMeeting()}
                            >
                                {t("panel.actions.pause")}
                            </Button>
                        ) : null}
                        {props.detail.controls.includes("resume_meeting") ? (
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={props.writePending || props.detailCached}
                                onClick={() => void props.resumeMeeting()}
                            >
                                {t("panel.actions.resume")}
                            </Button>
                        ) : null}
                        {props.detail.controls.includes("end_meeting") ? (
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={props.writePending || props.detailCached}
                                onClick={() => void props.endMeeting()}
                            >
                                {t("panel.actions.end")}
                            </Button>
                        ) : null}
                        {props.localFeedback}
                    </header>
                    {props.detailError === undefined ? null : (
                        <p role="alert">{props.detailError}</p>
                    )}
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
                                detail={props.detail}
                                focusTarget={props.focusTarget}
                                onFocusConsumed={props.onFocusConsumed}
                                onLocateInTimeline={props.onLocateInTimeline}
                            />
                        ) : (
                            <MeetingPanelTimeline
                                detail={props.detail}
                                filters={props.timelineFilters ?? INITIAL_TIMELINE_FILTERS}
                                viewportRevision={props.viewportRevision ?? 0}
                                locale={props.locale}
                                onFiltersChange={props.onTimelineFiltersChange ?? (() => undefined)}
                                focusTarget={props.focusTarget}
                                onFocusConsumed={props.onFocusConsumed}
                                onLocateInOverview={props.onLocateInOverview}
                            />
                        )}
                    </article>
                </div>
            )}
        </main>
    );
};
