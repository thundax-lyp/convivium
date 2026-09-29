import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingSummary } from "@/protocol/index.ts";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { lifecycleLabel } from "@/client/meeting/shared/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";

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
    return (
        <nav data-testid="meeting-navigator" aria-label={t("panel.navigator.title")}>
            <h3>{t("panel.navigator.title")}</h3>
            {listCached ? <p>{t("panel.navigator.stale")}</p> : null}
            {listError === undefined ? null : <p role="alert">{listError}</p>}
            {meetings.length === 0 && listLoading ? (
                <p>{t("panel.navigator.loading")}</p>
            ) : meetings.length === 0 && listError === undefined ? (
                <p>{t("panel.navigator.empty")}</p>
            ) : null}
            <ul aria-label={t("panel.list.aria")}>
                {meetings.map((meeting) => (
                    <li key={meeting.meetingId}>
                        <Button
                            type="button"
                            variant={meeting.meetingId === selectedId ? "primary" : "outline"}
                            size="sm"
                            onClick={() => selectMeeting(meeting.meetingId)}
                        >{`${meeting.objective} (${lifecycleLabel(meeting.lifecycle, t)})`}</Button>
                    </li>
                ))}
            </ul>
        </nav>
    );
};
