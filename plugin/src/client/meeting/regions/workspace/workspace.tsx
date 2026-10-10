import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingSummary } from "@/protocol/index.ts";
import {
    Button,
    IconBrowseOutlineMedium,
    IconRefreshOutlineMedium
} from "@deepseek-ai/dsh-client-ui-primitives";
import {
    INITIAL_TIMELINE_FILTERS,
    lifecycleLabel,
    type MeetingMode,
    type MeetingPanelLayoutProps
} from "@/client/meeting/shared/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { ButtonGroup, ConviviumMark, Empty } from "@/client/meeting/components/index.ts";
import { MeetingPanelOverview } from "./overview/index.ts";
import { MeetingPanelTimeline } from "./timeline/index.ts";
import { MeetingControls } from "./meeting-controls/index.ts";
import styles from "./workspace.module.css";

const EmptyMeeting = ({ message }: { message?: string }): ReactElement => {
    const t = useMeetingTranslate();
    return (
        <div className={styles.emptyMeeting}>
            <Empty
                icon={
                    message === undefined ? (
                        <ConviviumMark />
                    ) : (
                        <IconBrowseOutlineMedium size={32} aria-hidden="true" />
                    )
                }
                message={message ?? t("panel.selection.prompt")}
            />
        </div>
    );
};

const MeetingContent = ({
    meeting,
    ...props
}: MeetingPanelLayoutProps & { meeting: MeetingSummary }): ReactElement => {
    const t = useMeetingTranslate();
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
        <div
            data-refresh-visible={
                props.listCached || props.listError !== undefined || props.detailError !== undefined
            }
            data-placeholder={props.detail === undefined && props.detailError === undefined}
            className={styles.content}
        >
            <div className={styles.refreshSlot}>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={styles.refreshButton}
                    aria-label={t("panel.actions.refresh")}
                    onClick={props.requestRefresh}
                >
                    <IconRefreshOutlineMedium size={16} aria-hidden="true" />
                </Button>
            </div>
            {props.detail === undefined ? (
                props.detailError === undefined ? (
                    <EmptyMeeting
                        message={
                            props.detailCached
                                ? t("panel.detail.loading")
                                : t("panel.detail.unavailable")
                        }
                    />
                ) : (
                    <p role="alert">{props.detailError}</p>
                )
            ) : (
                <div>
                    <header className={styles.meetingHeader}>
                        <h3>{props.detail.objective.statement}</h3>
                        <div className={styles.statusRow}>
                            <p className={styles.metadata}>
                                {t("panel.header.status")}:{" "}
                                {lifecycleLabel(props.detail.lifecycle.status, t)}
                            </p>
                            <MeetingControls {...props} controls={props.detail.controls} />
                        </div>
                        <p className={styles.metadata}>
                            {t("panel.header.version")}: {props.detail.version}
                        </p>
                        {props.localFeedback}
                    </header>
                    {props.detailError === undefined ? null : (
                        <p role="alert">{props.detailError}</p>
                    )}
                    <ButtonGroup role="tablist">
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
                    </ButtonGroup>
                    <article
                        role="tabpanel"
                        aria-labelledby={`meeting-mode-${mode}`}
                        aria-label={t("panel.detail.aria", { id: meeting.meetingId })}
                    >
                        {mode === "overview" ? (
                            <MeetingPanelOverview
                                detail={props.detail}
                                focusTarget={props.focusTarget}
                                onFocusConsumed={props.onFocusConsumed}
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
        </div>
    );
};

export const MeetingWorkspace = (props: MeetingPanelLayoutProps): ReactElement => {
    const meeting = props.meetings.find((item) => item.meetingId === props.selectedId);
    return (
        <main className={styles.main}>
            {meeting === undefined ? (
                <EmptyMeeting />
            ) : (
                <MeetingContent {...props} meeting={meeting} />
            )}
        </main>
    );
};
