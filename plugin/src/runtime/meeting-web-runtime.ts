import type {
    MeetingCommandResult,
    MeetingCommand,
    MeetingListResult,
    MeetingReadResult,
    RefreshNotice
} from "@/protocol/index.ts";

export interface LocalMeetingWebRuntime {
    list(signal: AbortSignal): Promise<MeetingListResult>;
    read(
        request: { readonly protocolVersion: 1; readonly meetingId: string },
        signal: AbortSignal
    ): Promise<MeetingReadResult>;
    control(command: MeetingCommand, signal: AbortSignal): Promise<MeetingCommandResult>;
    startFromSkill(command: MeetingCommand, signal: AbortSignal): Promise<MeetingCommandResult>;
    cancelFromSkill(command: MeetingCommand, signal: AbortSignal): Promise<MeetingCommandResult>;
    subscribeRefresh(signal: AbortSignal): AsyncIterable<RefreshNotice>;
}
