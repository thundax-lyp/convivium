import type { ProtocolError, ProtocolSuccess } from "@/protocol/index.js";

export function commandSuccess<T>(
    meetingId: string,
    meetingVersion: number,
    result: T
): ProtocolSuccess<T> {
    return { protocolVersion: 1, ok: true, meetingId, meetingVersion, result };
}

export function commandFailure(
    code: ProtocolError["code"],
    message: string,
    retryable = false
): ProtocolError {
    return { protocolVersion: 1, ok: false, code, message, retryable };
}

export function mapCommandError(
    error: unknown,
    fallback: ProtocolError["code"],
    message: string,
    context?: Partial<ProtocolError>,
    codeMap: Readonly<Record<string, ProtocolError["code"]>> = {}
): ProtocolError {
    const code =
        error && typeof error === "object" && "code" in error
            ? (error as { code?: unknown }).code
            : undefined;
    const mappedCode = typeof code === "string" ? (codeMap[code] ?? code) : fallback;
    return {
        ...commandFailure(mappedCode, message, mappedCode === "VERSION_CONFLICT"),
        ...context,
        ...(error && typeof error === "object" && "meetingId" in error
            ? { meetingId: String((error as { meetingId: unknown }).meetingId) }
            : {})
    };
}
