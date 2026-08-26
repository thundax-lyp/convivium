export type DomainErrorCode =
    | "INVALID_STATE_TRANSITION"
    | "MISSING_TERMINATION"
    | "MISSING_ARCHIVE"
    | "INVALID_ENTITY_STATE"
    | "INVALID_CREATE_INPUT";

export class DomainError extends Error {
    readonly name = "DomainError";

    constructor(
        readonly code: DomainErrorCode,
        message: string,
        readonly details: Readonly<Record<string, string | number | undefined>> = {}
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
