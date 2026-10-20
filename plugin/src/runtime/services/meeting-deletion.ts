import type { MeetingState } from "@/domain/index.ts";
import type { RecoveryResult } from "@/repository/index.ts";
import { RepositoryError } from "@/repository/index.ts";
import type { StorageDomainRepositoryRegistry } from "@/repository/index.ts";
import type {
    DeleteMeetingRequest,
    DeleteMeetingResult,
    MeetingDeletionStatus
} from "@/protocol/index.ts";

export const meetingDeletionStatus = (
    recovery: Pick<RecoveryResult<MeetingState>, "snapshot" | "sessionOwnership" | "pendingOutbox">
): MeetingDeletionStatus => {
    const state = recovery.snapshot?.state;
    if (!state || !["paused", "terminal", "archived"].includes(state.lifecycle.status)) {
        return "active";
    }
    return "allowed";
};

/** Only the local Web adapter calls this operation; no Agent tool or Skill exposes it. */
export const deleteMeeting = async (
    registry: StorageDomainRepositoryRegistry<MeetingState>,
    request: DeleteMeetingRequest,
    signal: AbortSignal,
    quiesce?: () => void | Promise<void>
): Promise<DeleteMeetingResult> => {
    signal.throwIfAborted();
    try {
        await registry.deleteMeeting(
            request.meetingId,
            request.expectedMeetingVersion,
            (recovery) => {
                signal.throwIfAborted();
                if (meetingDeletionStatus(recovery) !== "allowed") {
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        request.meetingId,
                        "Meeting lifecycle does not allow deletion"
                    );
                }
                const snapshot = recovery.snapshot!;
                return {
                    objective: snapshot.state.objective.statement,
                    version: snapshot.version,
                    lifecycle: snapshot.state.lifecycle.status
                };
            },
            quiesce
        );
        return { kind: "deleted", meetingId: request.meetingId };
    } catch (error) {
        if (
            error instanceof RepositoryError &&
            ["VERSION_CONFLICT", "INVALID_STATE"].includes(error.code)
        ) {
            return {
                kind: "rejected",
                error: {
                    code:
                        error.code === "VERSION_CONFLICT"
                            ? "VERSION_CONFLICT"
                            : "PRECONDITION_FAILED",
                    message: "Meeting changed or its lifecycle does not allow deletion."
                }
            };
        }
        throw error;
    }
};
