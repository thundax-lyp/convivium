export class UnsupportedMeetingStateFormatError extends Error {
    constructor(readonly formatVersion: unknown) {
        super(`Unsupported MeetingState format: ${String(formatVersion)}`);
        this.name = "UnsupportedMeetingStateFormatError";
    }
}
