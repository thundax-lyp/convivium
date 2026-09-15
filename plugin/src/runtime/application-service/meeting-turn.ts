import type {
    HandRaiseSubmissionV1,
    ManagerPlanSubmissionV1,
    TurnSubmissionV1
} from "@/protocol/index.js";
import { commandFailure as failure } from "@/runtime/services/command-result-service.js";
import type { MeetingRepositoryRuntime } from "@/runtime/meeting-runtime.js";
import type { MeetingRehydrationService } from "@/runtime/services/meeting-recovery-service.js";
import type { MeetingToolRuntime } from "./index.js";
import type { StoredMeeting } from "./types.js";

export { assignTurnAttempt } from "./initialize-meeting-turn.js";

type ManagerFallbackReasonCode =
    "manager_plan_invalid" | "manager_timeout" | "manager_delivery_retry_exhausted";

export interface ManagerFallbackInput {
    readonly repository: MeetingRepositoryRuntime;
    readonly meetingId: string;
    readonly attemptId: string;
    readonly reasonCode: ManagerFallbackReasonCode;
    readonly observedMeetingVersion: number;
    readonly now: number;
}

export interface MeetingTurnApplicationOptions {
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
}

export function createMeetingTurnApplication(dependencies: MeetingTurnApplicationOptions) {
    const { meetings, recovery } = dependencies;

    async function rejectRetiredWrite(
        input: HandRaiseSubmissionV1 | TurnSubmissionV1 | ManagerPlanSubmissionV1,
        caller: Parameters<MeetingToolRuntime["raiseHand"]>[1]
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
            "Turn-based meeting commands are not supported by this release."
        );
    }

    const application: Pick<
        MeetingToolRuntime,
        "raiseHand" | "submitTurn" | "submitManagerPlan"
    > & {
        fallbackManagerPlanning(input: ManagerFallbackInput): Promise<void>;
    } = {
        raiseHand: rejectRetiredWrite,
        submitTurn: rejectRetiredWrite,
        submitManagerPlan: rejectRetiredWrite,
        async fallbackManagerPlanning(_input) {
            // The contribution runtime owns its own retry and failure transitions.
        }
    };

    return application;
}
