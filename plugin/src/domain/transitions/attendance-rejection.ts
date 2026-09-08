import { DomainError } from "@/domain/errors.js";
import { isMeetingStateV2 } from "@/domain/meeting-state-validation.js";
import type { ArchiveAttendanceRejection, MeetingState, TransitionResult } from "@/domain/model.js";

export interface RejectAttendanceRecommendationInput {
    readonly meetingId: string;
    readonly requestId: string;
    readonly recommendationId: string;
    readonly actorBinding: string;
    readonly reason: string;
    readonly now: number;
}

const invalid = () => new DomainError("INVALID_ARGUMENT", "Attendance rejection is invalid.");

export function rejectAttendanceRecommendation(
    state: MeetingState,
    input: RejectAttendanceRecommendationInput
): TransitionResult<MeetingState> {
    if (state.id !== input.meetingId) throw invalid();
    if (
        [
            "completed",
            "partial",
            "no_consensus",
            "cancelled",
            "failed",
            "archiving",
            "archived"
        ].includes(state.status)
    ) {
        throw new DomainError(
            state.status === "archived" ? "ARCHIVED_MEETING" : "IMMUTABLE_MEETING",
            "Meeting is immutable."
        );
    }
    if (!isMeetingStateV2(state)) throw invalid();
    if (
        !input.requestId.trim() ||
        !input.recommendationId.trim() ||
        !input.reason.trim() ||
        !input.actorBinding.startsWith("captain:") ||
        !input.actorBinding.slice(8).trim() ||
        !Number.isFinite(input.now) ||
        input.now < 0
    )
        throw invalid();
    const recommendation = state.attendanceRecommendations.find(
        (value) => value.id === input.recommendationId
    );
    if (!recommendation) throw invalid();
    if (recommendation.status !== "pending")
        throw new DomainError(
            "ATTENDANCE_RECOMMENDATION_NOT_PENDING",
            "Attendance recommendation is not pending."
        );
    const rejection = {
        requestId: input.requestId,
        actorBinding: input.actorBinding,
        reason: input.reason.trim(),
        rejectedAt: input.now
    };
    return {
        state: {
            ...state,
            attendanceRecommendations: state.attendanceRecommendations.map((value) =>
                value.id === recommendation.id ? { ...value, status: "rejected", rejection } : value
            ),
            eventSeq: state.eventSeq + 1
        },
        effect: {
            events: [
                {
                    type: "attendance_recommendation.rejected",
                    payload: { recommendationId: recommendation.id, ...rejection }
                }
            ]
        }
    };
}

export function projectAttendanceRejections(
    state: MeetingState
): readonly ArchiveAttendanceRejection[] {
    return [...(state.attendanceRecommendations ?? [])]
        .filter((value) => value.status === "rejected")
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
        .map((value) => {
            if (!value.rejection) throw invalid();
            return {
                recommendationId: value.id,
                candidateId: value.candidateId,
                roleDefinitionId: value.roleDefinitionId,
                displayName: value.displayName,
                agendaItemId: value.agendaItemId,
                reason: value.rejection.reason,
                rejectedAt: value.rejection.rejectedAt
            };
        });
}
