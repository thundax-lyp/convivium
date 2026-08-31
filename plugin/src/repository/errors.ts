export type RepositoryErrorCode =
    | "MEETING_NOT_FOUND"
    | "MEETING_EXISTS"
    | "VERSION_CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
    | "CONSTRAINT_VIOLATION"
    | "INVALID_INPUT"
    | "UNSUPPORTED_CAPABILITY"
    | "SQLITE_BUSY"
    | "SCHEMA_VERSION_UNSUPPORTED"
    | "CORRUPT_DATABASE"
    | "LEASE_LOST"
    | "OUTBOX_NOT_FOUND"
    | "INVALID_STATE"
    | "CLOSED";

export class RepositoryError extends Error {
    readonly name = "RepositoryError";

    constructor(
        readonly code: RepositoryErrorCode,
        readonly retryable: boolean,
        readonly meetingId: string,
        message: string
    ) {
        super(message);
    }
}
