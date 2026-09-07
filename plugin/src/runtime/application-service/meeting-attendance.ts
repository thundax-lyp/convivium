import {
    DomainError,
    isMeetingStateV2,
    rejectAttendanceRecommendation
} from "../../domain/index.js";
import type { CaptainAttendanceDispositionResultV1 } from "../../protocol/index.js";
import { serializeValidatedRequestV1 } from "../../protocol/request-idempotency.js";
import type { CreateStatusRuntimeOptions, MeetingToolRuntime } from "./index.js";
import type { StoredMeeting } from "./types.js";
import type { MeetingRehydrationService } from "../services/meeting-recovery-service.js";
import {
    commandFailure,
    commandSuccess,
    mapCommandError
} from "../services/command-result-service.js";
import type { DomainEventInput, JsonObject } from "../meeting-runtime.js";

export interface MeetingAttendanceApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
}

export function createMeetingAttendanceApplication({
    options,
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
            if (
                !stored ||
                caller.kind !== "captain" ||
                caller.sessionId !== stored.captainSessionId ||
                (caller.meetingId !== undefined && caller.meetingId !== input.meetingId)
            ) {
                return commandFailure(
                    "UNAUTHORIZED_CALLER",
                    "Only the meeting Captain can reject an attendance recommendation."
                );
            }
            if (input.decision !== "reject" || !input.reason.trim()) {
                return commandFailure(
                    "INVALID_ARGUMENT",
                    "The attendance recommendation could not be rejected."
                );
            }
            try {
                const now = options.now?.() ?? Date.now();
                const committed =
                    await stored.repository.execute<CaptainAttendanceDispositionResultV1>({
                        requestId: input.requestId,
                        commandKind: "dispose_attendance_recommendation",
                        authorization: {
                            callerBinding: `session:${caller.sessionId}`,
                            capabilityId: `captain:${caller.sessionId}`
                        },
                        requestHash: serializeValidatedRequestV1(input),
                        expectedMeetingVersion: input.expectedMeetingVersion,
                        transition: (snapshot) => {
                            if (!isMeetingStateV2(snapshot.state))
                                throw new DomainError(
                                    "INVALID_ARGUMENT",
                                    "Attendance rejection requires a V2 Meeting."
                                );
                            const transition = rejectAttendanceRecommendation(snapshot.state, {
                                meetingId: input.meetingId,
                                requestId: input.requestId,
                                recommendationId: input.recommendationId,
                                actorBinding: `captain:${caller.sessionId}`,
                                reason: input.reason,
                                now
                            });
                            return {
                                state: transition.state as unknown as JsonObject,
                                result: {
                                    requestId: input.requestId,
                                    recommendationId: input.recommendationId,
                                    disposition: "rejected"
                                } satisfies CaptainAttendanceDispositionResultV1,
                                events: transition.effect.events as unknown as DomainEventInput[],
                                outbox: []
                            };
                        }
                    });
                return commandSuccess(input.meetingId, committed.meetingVersion, committed.result);
            } catch (error) {
                return mapCommandError(
                    error,
                    "INTERNAL_ERROR",
                    error instanceof DomainError &&
                        error.code === "ATTENDANCE_RECOMMENDATION_NOT_PENDING"
                        ? "Attendance recommendation is not pending."
                        : "The attendance recommendation could not be rejected.",
                    { meetingId: input.meetingId }
                );
            }
        }
    };
}
