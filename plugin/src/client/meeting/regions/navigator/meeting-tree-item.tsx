import * as React from "react";
import { useState, type ReactElement } from "react";
import type { MeetingSummary } from "@/protocol/index.ts";
import {
    Button,
    IconBrowseOutlineMedium,
    IconEllipsisOutlineMedium,
    IconTrashOutlineMedium,
    Menu,
    Tooltip,
    relativeTime
} from "@deepseek-ai/dsh-client-ui-primitives";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { lifecycleLabel } from "@/client/meeting/shared/index.ts";
import { MeetingStatusIcon } from "./status-icon.tsx";
import styles from "./navigator.module.css";

export const MeetingTreeItem = ({
    meeting,
    now,
    selected,
    selectMeeting,
    deleteDisabled = true,
    requestDelete
}: {
    meeting: MeetingSummary;
    now: number;
    selected: boolean;
    selectMeeting(meetingId: string): void;
    deleteDisabled?: boolean;
    requestDelete?(meeting: MeetingSummary): void;
}): ReactElement => {
    const t = useMeetingTranslate();
    const [menuOpen, setMenuOpen] = useState(false);
    const status = lifecycleLabel(meeting.lifecycle, t);
    const time = relativeTime(meeting.updatedAt, now);
    const deleteReason =
        deleteDisabled || !requestDelete || !meeting.deletionStatus
            ? t("panel.delete.unavailable")
            : meeting.deletionStatus === "allowed" || meeting.deletionStatus === "deleting"
              ? undefined
              : t(`panel.delete.${meeting.deletionStatus}`);

    const activate = () => {
        setMenuOpen(false);
        selectMeeting(meeting.meetingId);
    };

    return (
        <div
            role="treeitem"
            tabIndex={0}
            aria-selected={selected}
            aria-label={`${meeting.objective} (${status})`}
            className={styles.row}
            data-selected={selected}
            data-menu-open={menuOpen}
            onClick={(event) => {
                if (
                    event.currentTarget.contains(event.target as Node) &&
                    !(event.target as Element).closest("[data-meeting-row-actions]")
                ) {
                    activate();
                }
            }}
            onKeyDown={(event) => {
                if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) {
                    event.preventDefault();
                    activate();
                }
            }}
        >
            <span className={styles.status} aria-hidden="true">
                <MeetingStatusIcon status={meeting.lifecycle} />
            </span>
            <Tooltip label={meeting.objective} side="right" maxWidth={320} disabled={menuOpen}>
                <span className={styles.title}>{meeting.objective}</span>
            </Tooltip>
            <time className={styles.time} dateTime={new Date(meeting.updatedAt).toISOString()}>
                {t(`panel.navigator.time.${time.unit}`, { n: time.n })}
            </time>
            <span className={styles.rowActions} data-meeting-row-actions="">
                <Menu
                    open={menuOpen}
                    portal
                    anchor={
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={styles.actionButton}
                            aria-label={t("panel.navigator.actions", {
                                objective: meeting.objective
                            })}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={(event) => {
                                event.stopPropagation();
                                setMenuOpen(true);
                            }}
                        >
                            <IconEllipsisOutlineMedium />
                        </Button>
                    }
                    items={[
                        { type: "label", id: "status", text: status },
                        {
                            id: "open",
                            label: t("panel.navigator.openMeeting"),
                            icon: <IconBrowseOutlineMedium />
                        },
                        { type: "separator", id: "delete-separator" },
                        ...(meeting.deletionStatus === "deleting"
                            ? [
                                  {
                                      type: "label" as const,
                                      id: "deletion-pending",
                                      text: t("panel.delete.deleting")
                                  }
                              ]
                            : []),
                        ...(deleteReason
                            ? [{ type: "label" as const, id: "delete-reason", text: deleteReason }]
                            : []),
                        {
                            id: "delete",
                            label: t("panel.delete.action"),
                            icon: <IconTrashOutlineMedium />,
                            danger: true,
                            disabled: deleteReason !== undefined
                        }
                    ]}
                    onSelect={(id) => {
                        if (id === "open") {
                            activate();
                        }
                        if (id === "delete" && deleteReason === undefined) {
                            setMenuOpen(false);
                            requestDelete?.(meeting);
                        }
                    }}
                    onClose={() => setMenuOpen(false)}
                />
            </span>
        </div>
    );
};
