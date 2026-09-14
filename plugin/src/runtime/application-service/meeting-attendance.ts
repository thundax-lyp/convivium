import { commandFailure } from "@/runtime/services/command-result-service.js";
import type { MeetingRehydrationService } from "@/runtime/services/meeting-recovery-service.js";
import type { CreateStatusRuntimeOptions, MeetingToolRuntime } from "./index.js";
import type { StoredMeeting } from "./types.js";

export interface MeetingAttendanceApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
}

export function createMeetingAttendanceApplication({
    meetings,
    recovery
}: MeetingAttendanceApplicationOptions): Pick<
    MeetingToolRuntime,
    "disposeAttendanceRecommendation"
> {
    return {
        async disposeAttendanceRecommendation(input, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) {
                return commandFailure("MEETING_NOT_FOUND", "Meeting not found.");
            }
            if (
                caller.kind !== "captain" ||
                caller.sessionId !== stored.captainSessionId ||
                (caller.meetingId !== undefined && caller.meetingId !== input.meetingId)
            ) {
                return commandFailure(
                    "UNAUTHORIZED_CALLER",
                    "Only the meeting Captain can use this command."
                );
            }
            return commandFailure(
                "UNSUPPORTED_CAPABILITY",
                "Attendance recommendations are not supported by this release."
            );
        }
    };
}
