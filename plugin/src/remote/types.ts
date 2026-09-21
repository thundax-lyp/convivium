import type {
    MeetingCommand,
    MeetingCommandResult,
    MeetingListResult,
    MeetingReadResult,
    RefreshNotice
} from "@/protocol/index.js";

export type RemoteJsonValue =
    | null
    | boolean
    | number
    | string
    | readonly RemoteJsonValue[]
    | { readonly [key: string]: RemoteJsonValue };

export type RemoteMeetingListResult = MeetingListResult & Record<string, RemoteJsonValue>;
export type RemoteMeetingReadResult = MeetingReadResult & Record<string, RemoteJsonValue>;
export type RemoteMeetingCommand = MeetingCommand & Record<string, RemoteJsonValue>;
export type RemoteMeetingCommandResult = MeetingCommandResult & Record<string, RemoteJsonValue>;
export type RemoteReadMeetingRequest = {
    readonly protocolVersion: 1;
    readonly meetingId: string;
} & Record<string, RemoteJsonValue>;
export type RemoteRefreshNotice = RefreshNotice & Record<string, RemoteJsonValue>;

declare module "@deepseek-ai/dsh-typert-protocol" {
    interface RemoteErrorDetailsMap {
        "convivium/invalid-request": { readonly retryable: false };
        "convivium/recovery-unavailable": { readonly retryable: true };
        "convivium/internal": { readonly retryable: false };
    }
}
