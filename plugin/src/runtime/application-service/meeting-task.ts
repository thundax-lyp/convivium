import type {
    MeetingTaskFinishInputV1,
    MeetingTaskRequestV1,
    MeetingTaskStartInputV1,
    MeetingTaskStatusInputV1
} from "@/protocol/index.js";
import { commandFailure as failure } from "@/runtime/services/command-result-service.js";
import type { MeetingRehydrationService } from "@/runtime/services/meeting-recovery-service.js";
import type { MeetingToolCaller, MeetingToolRuntime } from "./index.js";
import type { StoredMeeting } from "./types.js";

export interface MeetingTaskApplicationOptions {
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
}

export function createMeetingTaskApplication(dependencies: MeetingTaskApplicationOptions) {
    const { meetings, recovery } = dependencies;

    async function rejectRetiredTask(
        input:
            | MeetingTaskRequestV1
            | MeetingTaskStatusInputV1
            | MeetingTaskStartInputV1
            | MeetingTaskFinishInputV1,
        caller: MeetingToolCaller
    ) {
        await recovery.rehydrate();
        if (!meetings.has(input.meetingId)) {
            return failure("MEETING_NOT_FOUND", "Meeting not found.");
        }
        if (caller.meetingId !== input.meetingId) {
            return failure("UNAUTHORIZED_CALLER", "Caller is not bound to this meeting.");
        }
        return failure(
            "UNSUPPORTED_CAPABILITY",
            "MeetingTask commands are not supported by this release."
        );
    }

    const application: Pick<
        MeetingToolRuntime,
        "createMeetingTask" | "meetingTaskStatus" | "startMeetingTask" | "finishMeetingTask"
    > = {
        createMeetingTask: rejectRetiredTask,
        meetingTaskStatus: rejectRetiredTask,
        startMeetingTask: rejectRetiredTask,
        finishMeetingTask: rejectRetiredTask
    };

    return application;
}
