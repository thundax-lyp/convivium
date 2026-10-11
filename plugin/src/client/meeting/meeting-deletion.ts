import type { MutableRefObject } from "react";
import type { MeetingSummary } from "@/protocol/index.ts";
import type { MeetingClient } from "./client.ts";
import { withMeetingWriteLock } from "./client.ts";

export const submitMeetingDeletion = async ({
    api,
    meeting,
    disabled,
    writeLock,
    setPending,
    onDeleted
}: {
    api: MeetingClient;
    meeting: MeetingSummary;
    disabled: boolean;
    writeLock: MutableRefObject<boolean>;
    setPending(pending: boolean): void;
    onDeleted(): void;
}): Promise<void> => {
    if (disabled) {
        throw new Error("Deletion is unavailable");
    }
    await withMeetingWriteLock(writeLock, setPending, async () => {
        const result = await api.deleteMeeting({
            protocolVersion: 1,
            meetingId: meeting.meetingId,
            expectedMeetingVersion: meeting.version
        });
        if (result.kind !== "deleted" || result.meetingId !== meeting.meetingId) {
            throw new Error("Deletion was not confirmed");
        }
        onDeleted();
    });
};
