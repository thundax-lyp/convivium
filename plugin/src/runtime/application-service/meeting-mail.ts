import type {
    FinishMeetingMailInputV1,
    MeetingMailResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1,
    SendMeetingMessageInputV1
} from "@/protocol/index.js";
import { commandFailure } from "@/runtime/services/command-result-service.js";
import type { MeetingRehydrationService } from "@/runtime/services/meeting-recovery-service.js";
import type { MeetingDeliveryWorkerService } from "@/runtime/services/types.js";
import type { CreateStatusRuntimeOptions, MeetingToolCaller } from "./index.js";
import type { StoredMeeting } from "./types.js";

export function createMeetingMailApplication(dependencies: {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
    readonly deliveryWorkers: MeetingDeliveryWorkerService;
    readonly ensureWorker: (stored: StoredMeeting) => void;
}) {
    async function rejectRetiredMail(
        input: SendMeetingMessageInputV1 | FinishMeetingMailInputV1,
        caller: MeetingToolCaller
    ): Promise<ProtocolSuccessV1<MeetingMailResultV1> | ProtocolErrorV1> {
        await dependencies.recovery.rehydrate();
        if (!dependencies.meetings.has(input.meetingId)) {
            return commandFailure("MEETING_NOT_FOUND", "Meeting not found.");
        }
        if (caller.meetingId !== input.meetingId) {
            return commandFailure("UNAUTHORIZED_CALLER", "Caller is not bound to this meeting.");
        }
        return commandFailure(
            "UNSUPPORTED_CAPABILITY",
            "Meeting mail is not supported by this release."
        );
    }

    return {
        sendMeetingMessage: rejectRetiredMail,
        finishMeetingMail: rejectRetiredMail
    };
}
