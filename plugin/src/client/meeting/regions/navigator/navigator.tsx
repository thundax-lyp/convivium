import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingSummary } from "@/protocol/index.ts";
import {
    Button,
    IconCloseFill14,
    IconSearchOutline16
} from "@deepseek-ai/dsh-client-ui-primitives";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { Empty } from "@/client/meeting/components/index.ts";
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
        <nav
            data-testid="meeting-navigator"
            aria-label={t("panel.navigator.title")}
            className={styles.navigator}
        >
            <div className={styles.sectionHeader} data-search-open={searchOpen}>
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
                        <IconSearchOutline16 size={searchOpen ? 11 : 14} />
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
                            <IconCloseFill14 />
                        </Button>
                    ) : null}
                </div>
            </div>
            {listCached ? <p className={styles.notice}>{t("panel.navigator.stale")}</p> : null}
            {listError === undefined ? null : (
                <p className={styles.notice} role="alert">
                    {listError}
                </p>
            )}
            <div data-slot="listArea" className={styles.listArea}>
                {meetings.length === 0 && listLoading ? (
                    <p className={styles.notice}>{t("panel.navigator.loading")}</p>
                ) : null}
                {visibleMeetings.length === 0 && !listLoading && listError === undefined ? (
                    <Empty
                        message={t(
                            normalizedQuery ? "panel.navigator.noMatches" : "panel.navigator.empty"
                        )}
                    />
                ) : null}
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
            </div>
        </nav>
    );
};
