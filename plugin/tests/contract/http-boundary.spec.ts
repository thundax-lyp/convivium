import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebRoute } from "@deepseek-ai/dsh-host-webserver";
import { describe, expect, it, vi } from "vitest";
import { registerLocalMeetingHttpRoutes } from "../../src/http/index.js";
import { LocalMeetingRecoveryUnavailableError } from "../../src/tools/meeting-runtime.js";

const meetingId = "meeting-1";
const statusResult = {
    meetingId,
    meetingVersion: 2,
    topic: "Release",
    objective: "Decide scope",
    continuationMaterials: [],
    limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
    messages: [],
    questions: [],
    acceptedDecisions: [],
    blockingFacts: [],
    meetingTasks: [],
    status: "running",
    pendingHandRaises: [],
    pauseControl: { action: "pause" }
} as const;

function success<T>(result: T, meetingVersion = 2) {
    return { protocolVersion: 1 as const, ok: true as const, meetingId, meetingVersion, result };
}

function runtime() {
    return {
        listLocalMeetings: vi.fn(async () => ({
            protocolVersion: 1 as const,
            ok: true as const,
            result: {
                meetings: [
                    {
                        meetingId,
                        teamId: "team-1",
                        topic: "Release",
                        status: "running" as const,
                        meetingVersion: 2,
                        updatedAt: 10
                    }
                ]
            }
        })),
        getLocalMeetingStatus: vi.fn(async () => success(statusResult)),
        pauseLocalMeeting: vi.fn(async () =>
            success({ status: "paused" as const, changed: true }, 3)
        ),
        resumeLocalMeeting: vi.fn(async () =>
            success({ status: "running" as const, changed: true }, 4)
        )
    };
}

function registeredHandler(localRuntime = runtime()) {
    let route: WebRoute | undefined;
    const dispose = vi.fn();
    const register = vi.fn((value: WebRoute) => {
        route = value;
        return dispose;
    });
    const returned = registerLocalMeetingHttpRoutes({ register } as never, localRuntime);
    expect(register).toHaveBeenCalledTimes(1);
    expect(route).toMatchObject({ kind: "prefix", path: "/api/convivium/meetings" });
    expect(returned).toBe(dispose);
    return { handler: route!.handler, runtime: localRuntime };
}

async function invoke(
    handler: WebRoute["handler"],
    method: string,
    url: string,
    options: { body?: string; contentType?: string } = {}
) {
    const req = Readable.from(options.body === undefined ? [] : [Buffer.from(options.body)]);
    Object.assign(req, {
        method,
        url,
        headers: options.contentType === undefined ? {} : { "content-type": options.contentType }
    });
    const headers = new Map<string, string>();
    let body = "";
    const res = {
        statusCode: 200,
        setHeader(name: string, value: string | number | readonly string[]) {
            headers.set(name.toLowerCase(), String(value));
        },
        end(chunk?: string | Buffer) {
            if (chunk !== undefined) body += chunk.toString();
        }
    };
    await handler(req as IncomingMessage, res as unknown as ServerResponse);
    return {
        status: res.statusCode,
        headers,
        body,
        json: body === "" ? undefined : (JSON.parse(body) as unknown)
    };
}

function pauseBody(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: 2,
        requestId: "pause-1",
        reason: "local control",
        ...overrides
    });
}

describe("local Meeting HTTP boundary", () => {
    it("registers one prefix and serves all four successful routes", async () => {
        const { handler, runtime } = registeredHandler();
        const list = await invoke(handler, "GET", "/api/convivium/meetings");
        const status = await invoke(handler, "GET", `/api/convivium/meetings/${meetingId}`);
        const pause = await invoke(handler, "POST", `/api/convivium/meetings/${meetingId}/pause`, {
            body: pauseBody(),
            contentType: "application/json; charset=utf-8"
        });
        const resume = await invoke(
            handler,
            "POST",
            `/api/convivium/meetings/${meetingId}/resume`,
            {
                body: JSON.stringify({
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: 3,
                    requestId: "resume-1"
                }),
                contentType: "application/json"
            }
        );

        for (const response of [list, status, pause, resume]) {
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        }
        expect(list.json).toMatchObject({ result: { meetings: [{ meetingId }] } });
        expect(status.json).toMatchObject({ result: { status: "running" } });
        expect(pause.json).toMatchObject({ result: { status: "paused" } });
        expect(resume.json).toMatchObject({ result: { status: "running" } });
        expect(runtime.pauseLocalMeeting).toHaveBeenCalledWith(JSON.parse(pauseBody()));
    });

    it.each([
        ["GET", "/api/convivium/meetings/"],
        ["GET", "/api/convivium/meetings/meeting-1/../pause"],
        ["DELETE", `/api/convivium/meetings/${meetingId}`]
    ])("returns an empty 404 for unsupported %s %s", async (method, url) => {
        const { handler } = registeredHandler();
        const response = await invoke(handler, method, url);
        expect(response).toMatchObject({ status: 404, body: "" });
        expect(response.headers.has("content-type")).toBe(false);
    });

    it.each([
        ["GET", "/api/convivium/meetings?team=1", undefined, undefined],
        ["GET", "/api/convivium/meetings?", undefined, undefined],
        ["GET", "/api/convivium/meetings/%", undefined, undefined],
        ["POST", `/api/convivium/meetings/${meetingId}/pause`, pauseBody(), undefined],
        ["POST", `/api/convivium/meetings/${meetingId}/pause`, "{", "application/json"],
        [
            "POST",
            `/api/convivium/meetings/${meetingId}/pause`,
            pauseBody({ userId: "user-1" }),
            "application/json"
        ],
        [
            "POST",
            `/api/convivium/meetings/${meetingId}/pause`,
            pauseBody({ meetingId: "meeting-2" }),
            "application/json"
        ],
        [
            "POST",
            `/api/convivium/meetings/${meetingId}/pause`,
            pauseBody({ protocolVersion: 2 }),
            "application/json"
        ],
        [
            "POST",
            `/api/convivium/meetings/${meetingId}/pause`,
            JSON.stringify({ authority: "captain" }).padEnd(16_385, "x"),
            "application/json"
        ]
    ])("maps malformed request %# to the fixed 400 envelope", async (method, url, body, type) => {
        const { handler, runtime } = registeredHandler();
        const response = await invoke(handler, method, url, {
            ...(body === undefined ? {} : { body }),
            ...(type === undefined ? {} : { contentType: type })
        });
        expect(response.status).toBe(400);
        expect(response.json).toEqual({
            protocolVersion: 1,
            ok: false,
            code: "INVALID_ARGUMENT",
            message: "Invalid meeting request.",
            retryable: false
        });
        expect(runtime.pauseLocalMeeting).not.toHaveBeenCalled();
    });

    it.each([
        ["VERSION_CONFLICT", 409],
        ["IDEMPOTENCY_CONFLICT", 409],
        ["MEETING_NOT_FOUND", 404],
        ["INVALID_STATE_TRANSITION", 400]
    ])("maps %s to HTTP %i", async (code, expectedStatus) => {
        const localRuntime = runtime();
        localRuntime.pauseLocalMeeting.mockResolvedValueOnce({
            protocolVersion: 1,
            ok: false,
            code,
            message: "safe failure",
            retryable: code === "VERSION_CONFLICT"
        } as never);
        const { handler } = registeredHandler(localRuntime);
        const response = await invoke(
            handler,
            "POST",
            `/api/convivium/meetings/${meetingId}/pause`,
            {
                body: pauseBody(),
                contentType: "application/json"
            }
        );
        expect(response.status).toBe(expectedStatus);
        expect(response.json).toMatchObject({ ok: false, code });
    });

    it("maps recovery failure to empty 503 and unknown or invalid response to empty 500", async () => {
        const unavailableRuntime = runtime();
        unavailableRuntime.listLocalMeetings.mockRejectedValueOnce(
            new LocalMeetingRecoveryUnavailableError("unavailable")
        );
        const unavailable = await invoke(
            registeredHandler(unavailableRuntime).handler,
            "GET",
            "/api/convivium/meetings"
        );
        expect(unavailable).toMatchObject({ status: 503, body: "" });
        expect(unavailable.headers.get("retry-after")).toBe("1");
        expect(unavailable.headers.has("content-type")).toBe(false);

        const unknownRuntime = runtime();
        unknownRuntime.listLocalMeetings.mockRejectedValueOnce(new Error("boom"));
        const unknown = await invoke(
            registeredHandler(unknownRuntime).handler,
            "GET",
            "/api/convivium/meetings"
        );
        expect(unknown).toMatchObject({ status: 500, body: "" });
        expect(unknown.headers.has("content-type")).toBe(false);

        const invalidRuntime = runtime();
        invalidRuntime.listLocalMeetings.mockResolvedValueOnce({ ok: true } as never);
        const invalid = await invoke(
            registeredHandler(invalidRuntime).handler,
            "GET",
            "/api/convivium/meetings"
        );
        expect(invalid).toMatchObject({ status: 500, body: "" });
    });
});
