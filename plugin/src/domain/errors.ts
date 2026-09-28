export type DomainErrorCode =
    | "INVALID_ARGUMENT"
    | "INVALID_STATE_TRANSITION"
    | "MISSING_TERMINATION"
    | "MISSING_ARCHIVE"
    | "INVALID_ENTITY_STATE"
    | "INVALID_CREATE_INPUT"
    | "IMMUTABLE_MEETING"
    | "ARCHIVED_MEETING"
    | "UNAUTHORIZED_CALLER"
    | "STALE_ATTEMPT"
    | "STALE_MANAGER_ATTEMPT"
    | "UNSUPPORTED_CAPABILITY"
    | "REQUIRED_SPEAKER_UNAVAILABLE"
    | "MANAGER_PLAN_INVALID"
    | "AGENT_CATALOG_UNAVAILABLE"
    | "AGENT_CANDIDATE_NOT_FOUND"
    | "AGENT_CANDIDATE_UNAVAILABLE"
    | "ATTENDANCE_RECOMMENDATION_INVALID"
    | "ATTENDANCE_RECOMMENDATION_NOT_PENDING";

export class DomainError extends Error {
    readonly name = "DomainError";

    constructor(
        readonly code: DomainErrorCode,
        message: string,
        readonly details: Readonly<Record<string, string | number | undefined>> = {},
        readonly retryable = false
    ) {
        super(message);
    }
}
