export type JsonlStorageErrorCode =
    | "invalid-json-value"
    | "record-too-large"
    | "capacity-exceeded"
    | "short-write"
    | "already-open";

export class JsonlStorageError extends Error {
    readonly name = "JsonlStorageError";

    constructor(
        readonly code: JsonlStorageErrorCode,
        message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
    }
}
