import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebServer } from "@deepseek-ai/dsh-host-webserver";
import {
    LocalMeetingListResponseSchema,
    MeetingControlResultSchema,
    MeetingStatusInputSchema,
    MeetingStatusResultSchema,
    PauseMeetingInputSchema,
    ResumeMeetingInputSchema,
    validateProtocolError,
    validateProtocolSuccessEnvelope,
    type ProtocolErrorV1
} from "../protocol/index.js";
import {
    LocalMeetingRecoveryUnavailableError,
    type LocalMeetingWebRuntime
} from "../runtime/index.js";

const routePrefix = "/api/convivium/meetings";
const maxBodyBytes = 16_384;
const jsonContentType = "application/json; charset=utf-8";

class InvalidMeetingRequestError extends Error {}

const invalidArgument = {
    protocolVersion: 1 as const,
    ok: false as const,
    code: "INVALID_ARGUMENT" as const,
    message: "Invalid meeting request.",
    retryable: false
};

function writeJson(res: ServerResponse, statusCode: number, value: unknown): void {
    res.statusCode = statusCode;
    res.setHeader("content-type", jsonContentType);
    res.end(JSON.stringify(value));
}

function writeEmpty(res: ServerResponse, statusCode: number): void {
    res.statusCode = statusCode;
    res.end();
}

function writeInvalid(res: ServerResponse): void {
    writeJson(res, 400, invalidArgument);
}

function assertExactBodyKeys(value: unknown, expected: readonly string[]): asserts value is object {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new InvalidMeetingRequestError("Meeting request body must be an object.");
    }
    const actual = Object.keys(value).sort();
    const allowed = [...expected].sort();
    if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
        throw new InvalidMeetingRequestError("Meeting request body has unexpected fields.");
    }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
    const contentType = req.headers["content-type"];
    const mediaType =
        typeof contentType === "string"
            ? contentType.split(";", 1)[0]?.trim().toLowerCase()
            : undefined;
    if (mediaType !== "application/json")
        throw new InvalidMeetingRequestError("JSON media type is required.");
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += buffer.byteLength;
        if (length > maxBodyBytes) {
            req.resume();
            throw new InvalidMeetingRequestError("Meeting request body is too large.");
        }
        chunks.push(buffer);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
        throw new InvalidMeetingRequestError("Meeting request body is invalid.", {
            cause: error
        });
    }
}

function errorStatus(error: ProtocolErrorV1): number {
    if (error.code === "VERSION_CONFLICT" || error.code === "IDEMPOTENCY_CONFLICT") return 409;
    if (error.code === "MEETING_NOT_FOUND") return 404;
    return 400;
}

export function registerLocalMeetingHttpRoutes(
    webServer: Pick<WebServer, "register">,
    runtime: LocalMeetingWebRuntime
): () => void {
    return webServer.register({
        kind: "prefix",
        path: routePrefix,
        handler: async (req, res) => {
            try {
                const rawUrl = req.url ?? "";
                const queryIndex = rawUrl.indexOf("?");
                const hasQuery = queryIndex >= 0;
                const rawPath = hasQuery ? rawUrl.slice(0, queryIndex) : rawUrl;
                try {
                    decodeURI(rawPath);
                } catch {
                    writeInvalid(res);
                    return;
                }

                const listRoute = rawPath === routePrefix && req.method === "GET";
                const detailMatch = rawPath.match(/^\/api\/convivium\/meetings\/([^/]+)$/);
                const controlMatch = rawPath.match(
                    /^\/api\/convivium\/meetings\/([^/]+)\/(pause|resume)$/
                );
                const detailRoute = detailMatch !== null && req.method === "GET";
                const controlRoute = controlMatch !== null && req.method === "POST";
                if (!listRoute && !detailRoute && !controlRoute) {
                    writeEmpty(res, 404);
                    return;
                }
                if (hasQuery) {
                    writeInvalid(res);
                    return;
                }

                if (listRoute) {
                    writeJson(
                        res,
                        200,
                        LocalMeetingListResponseSchema(await runtime.listLocalMeetings())
                    );
                    return;
                }

                let meetingId: string;
                try {
                    meetingId = decodeURIComponent((detailMatch ?? controlMatch)![1]!);
                } catch {
                    writeInvalid(res);
                    return;
                }

                if (detailRoute) {
                    try {
                        MeetingStatusInputSchema({ protocolVersion: 1, meetingId });
                    } catch (error) {
                        throw new InvalidMeetingRequestError("Meeting request is invalid.", {
                            cause: error
                        });
                    }
                    const value = await runtime.getLocalMeetingStatus({
                        protocolVersion: 1,
                        meetingId
                    });
                    if (!value.ok) {
                        const error = validateProtocolError(value);
                        writeJson(res, errorStatus(error), error);
                        return;
                    }
                    writeJson(
                        res,
                        200,
                        validateProtocolSuccessEnvelope(MeetingStatusResultSchema, value as never)
                    );
                    return;
                }

                const body = await readJsonBody(req);
                const action = controlMatch![2]!;
                if (action === "pause") {
                    assertExactBodyKeys(body, [
                        "protocolVersion",
                        "meetingId",
                        "expectedMeetingVersion",
                        "requestId",
                        "reason"
                    ]);
                    let input;
                    try {
                        input = PauseMeetingInputSchema(body);
                    } catch (error) {
                        throw new InvalidMeetingRequestError("Meeting request is invalid.", {
                            cause: error
                        });
                    }
                    if (input.meetingId !== meetingId)
                        throw new InvalidMeetingRequestError("Meeting ID mismatch.");
                    const value = await runtime.pauseLocalMeeting(input);
                    if (!value.ok) {
                        const error = validateProtocolError(value);
                        writeJson(res, errorStatus(error), error);
                        return;
                    }
                    writeJson(
                        res,
                        200,
                        validateProtocolSuccessEnvelope(MeetingControlResultSchema, value as never)
                    );
                    return;
                }

                assertExactBodyKeys(body, [
                    "protocolVersion",
                    "meetingId",
                    "expectedMeetingVersion",
                    "requestId"
                ]);
                let input;
                try {
                    input = ResumeMeetingInputSchema(body);
                } catch (error) {
                    throw new InvalidMeetingRequestError("Meeting request is invalid.", {
                        cause: error
                    });
                }
                if (input.meetingId !== meetingId)
                    throw new InvalidMeetingRequestError("Meeting ID mismatch.");
                const value = await runtime.resumeLocalMeeting(input);
                if (!value.ok) {
                    const error = validateProtocolError(value);
                    writeJson(res, errorStatus(error), error);
                    return;
                }
                writeJson(
                    res,
                    200,
                    validateProtocolSuccessEnvelope(MeetingControlResultSchema, value as never)
                );
            } catch (error) {
                if (error instanceof LocalMeetingRecoveryUnavailableError) {
                    res.setHeader("Retry-After", "1");
                    writeEmpty(res, 503);
                    return;
                }
                if (error instanceof InvalidMeetingRequestError) {
                    writeInvalid(res);
                    return;
                }
                writeEmpty(res, 500);
            }
        }
    });
}
