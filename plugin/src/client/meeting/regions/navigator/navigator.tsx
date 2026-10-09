import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingSummary } from "@/protocol/index.ts";
import {
    Button,
    IconCloseFillMedium,
    IconSearchOutlineMedium
} from "@deepseek-ai/dsh-client-ui-primitives";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { ConviviumMark, Empty } from "@/client/meeting/components/index.ts";
import { MeetingTreeItem } from "./meeting-tree-item.tsx";
import styles from "./navigator.module.css";

export const MeetingNavigator = ({
    meetings,
    selectedId,
    listLoading,
    listCached,
    listError,
    selectMeeting
}: {
    meetings: readonly MeetingSummary[];
    selectedId?: string;
    listLoading: boolean;
    listCached: boolean;
    listError?: string;
    selectMeeting(meetingId: string): void;
}): ReactElement => {
    const t = useMeetingTranslate();
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [now, setNow] = React.useState(() => Date.now());
    const inputRef = React.useRef<HTMLInputElement>(null);
    const searchSlotRef = React.useRef<HTMLDivElement>(null);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visibleMeetings = meetings
        .filter((meeting) => meeting.objective.toLocaleLowerCase().includes(normalizedQuery))
        .sort(
            (left, right) =>
                right.updatedAt - left.updatedAt || left.meetingId.localeCompare(right.meetingId)
        );

    React.useEffect(() => {
        if (searchOpen) {
            inputRef.current?.focus();
        }
    }, [searchOpen]);
    React.useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const onTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if ((event.target as HTMLElement).getAttribute("role") !== "treeitem") {
            return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            return;
        }
        const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]')
        );
        if (items.length === 0) {
            return;
        }
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next =
            event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : event.key === "ArrowDown"
                    ? Math.min(index + 1, items.length - 1)
                    : Math.max(index - 1, 0);
        items[next]?.focus();
        event.preventDefault();
    };

    return (
        <nav aria-label={t("panel.navigator.title")} className={styles.navigator}>
            <div
                className={styles.sectionHeader}
                data-search-open={searchOpen}
                hidden={meetings.length === 0}
            >
                <h3 className={styles.sectionLabel} aria-hidden={searchOpen}>
                    {t("panel.navigator.section")}
                </h3>
                <div className={styles.searchSlot} data-expanded={searchOpen} ref={searchSlotRef}>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={styles.searchButton}
                        aria-label={t("panel.navigator.search")}
                        aria-expanded={searchOpen}
                        onClick={() => {
                            setSearchOpen(true);
                            inputRef.current?.focus();
                        }}
                    >
                        <IconSearchOutlineMedium size={searchOpen ? 11 : 14} />
                    </Button>
                    {searchOpen ? (
                        <input
                            ref={inputRef}
                            type="text"
                            role="searchbox"
                            maxLength={500}
                            aria-label={t("panel.navigator.search")}
                            placeholder={t("panel.navigator.searchPlaceholder")}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                    setQuery("");
                                    setSearchOpen(false);
                                    searchSlotRef.current?.querySelector("button")?.focus();
                                }
                            }}
                            className={styles.searchInput}
                        />
                    ) : null}
                    {searchOpen ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={styles.clearButton}
                            aria-label={t("panel.navigator.clearSearch")}
                            onClick={() => {
                                setQuery("");
                                setSearchOpen(false);
                                searchSlotRef.current?.querySelector("button")?.focus();
                            }}
                        >
                            <IconCloseFillMedium />
                        </Button>
                    ) : null}
                </div>
            </div>
            {meetings.length > 0 && (listCached || listError !== undefined) ? (
                <div className={styles.feedback}>
                    <div className={styles.feedbackText}>
                        {listCached ? (
                            <p className={styles.notice}>{t("panel.navigator.stale")}</p>
                        ) : null}
                        {listError === undefined ? null : (
                            <p className={styles.notice} role="alert">
                                {listError}
                            </p>
                        )}
                    </div>
                </div>
            ) : null}
            <div
                data-slot="listArea"
                data-page-state={meetings.length === 0}
                className={styles.listArea}
            >
                {meetings.length === 0 && listLoading ? (
                    <div role="status" aria-busy="true">
                        <Empty icon={<ConviviumMark />} message={t("panel.navigator.loading")} />
                    </div>
                ) : meetings.length === 0 && listError !== undefined ? (
                    <div role="alert">
                        <Empty icon={<ConviviumMark />} message={listError} />
                    </div>
                ) : meetings.length === 0 ? (
                    <Empty icon={<ConviviumMark />} message={t("panel.navigator.empty")} />
                ) : visibleMeetings.length === 0 ? (
                    <Empty
                        icon={<IconSearchOutlineMedium aria-hidden="true" />}
                        message={t("panel.navigator.noMatches")}
                    />
                ) : null}
                {meetings.length > 0 ? (
                    <div
                        role="tree"
                        aria-label={t("panel.list.aria")}
                        data-slot="sessionTree"
                        onKeyDown={onTreeKeyDown}
                    >
                        {visibleMeetings.map((meeting) => (
                            <MeetingTreeItem
                                key={meeting.meetingId}
                                meeting={meeting}
                                now={now}
                                selected={meeting.meetingId === selectedId}
                                selectMeeting={selectMeeting}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        </nav>
    );
};
