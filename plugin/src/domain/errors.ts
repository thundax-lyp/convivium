export type DomainErrorCode =
    | "INVALID_ARGUMENT"
    | "INVALID_STATE_TRANSITION"
    | "MISSING_TERMINATION"
    | "MISSING_ARCHIVE"
    | "INVALID_ENTITY_STATE"
    | "INVALID_CREATE_INPUT"
    | "IMMUTABLE_MEETING"
    | "ARCHIVED_MEETING"
    | "STALE_ATTEMPT"
    | "STALE_MANAGER_ATTEMPT"
    | "UNSUPPORTED_CAPABILITY"
    | "REQUIRED_SPEAKER_UNAVAILABLE"
    | "MANAGER_PLAN_INVALID"
    | "AGENT_CATALOG_UNAVAILABLE"
    | "AGENT_CANDIDATE_NOT_FOUND"
    | "AGENT_CANDIDATE_UNAVAILABLE"
    | "ATTENDANCE_RECOMMENDATION_INVALID";

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

export function invalidStateTransition(
    entityType: "meeting" | "turn" | "step" | "attempt" | "manager_attempt",
    entityId: string,
    from: string,
    to: string,
    meetingVersion: number
): DomainError {
    return new DomainError(
        "INVALID_STATE_TRANSITION",
        `${entityType} ${entityId} cannot transition from ${from} to ${to}`,
        { entityType, entityId, from, to, meetingVersion }
    );
}
