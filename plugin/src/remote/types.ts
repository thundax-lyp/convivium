import type {
    MeetingCommandV1,
    MeetingCommandResultV1,
    MeetingListResultV1,
    MeetingReadResultV1,
    RefreshNoticeV1
} from "@/protocol/index.js";

export type RemoteJsonValue =
    | null
    | boolean
    | number
    | string
    | readonly RemoteJsonValue[]
    | { readonly [key: string]: RemoteJsonValue };

export type RemoteMeetingListResult = MeetingListResultV1 & Record<string, RemoteJsonValue>;
export type RemoteMeetingReadResult = MeetingReadResultV1 & Record<string, RemoteJsonValue>;
export type RemoteMeetingCommand = MeetingCommandV1 & Record<string, RemoteJsonValue>;
export type RemoteMeetingCommandResult = MeetingCommandResultV1 & Record<string, RemoteJsonValue>;
export type RemoteReadMeetingRequest = {
    readonly protocolVersion: 1;
    readonly meetingId: string;
} & Record<string, RemoteJsonValue>;
export type RemoteRefreshNotice = RefreshNoticeV1 & Record<string, RemoteJsonValue>;

declare module "@deepseek-ai/dsh-typert-protocol" {
    interface RemoteErrorDetailsMap {
        "convivium/invalid-request": { readonly retryable: false };
        "convivium/recovery-unavailable": { readonly retryable: true };
        "convivium/internal": { readonly retryable: false };
    }
}
