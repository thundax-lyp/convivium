import type { ProtocolErrorV1, ProtocolSuccessV1 } from "../../protocol/index.js";

export function commandSuccess<T>(
    meetingId: string,
    meetingVersion: number,
    result: T
): ProtocolSuccessV1<T> {
    return { protocolVersion: 1, ok: true, meetingId, meetingVersion, result };
}

export function commandFailure(
    code: ProtocolErrorV1["code"],
    message: string,
    retryable = false
): ProtocolErrorV1 {
    return { protocolVersion: 1, ok: false, code, message, retryable };
}

export function mapCommandError(
    error: unknown,
    fallback: ProtocolErrorV1["code"],
    message: string,
    context?: Partial<ProtocolErrorV1>,
    codeMap: Readonly<Record<string, ProtocolErrorV1["code"]>> = {}
): ProtocolErrorV1 {
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
