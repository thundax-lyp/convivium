import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebRoute } from "@deepseek-ai/dsh-host-webserver";
import { describe, expect, it, vi } from "vitest";
import { registerLocalMeetingHttpRoutes } from "../../src/http/index.js";
import { LocalMeetingRecoveryUnavailableError } from "../../src/runtime/application-service/index.js";

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
    proposals: [],
    pendingDecisionCandidates: [],
    acceptedDecisions: [],
    decisionHistory: [],
    risks: [],
    blockingFacts: [],
    parkingLot: [],
    meetingTasks: [],
    attendanceRecommendations: [],
    status: "running",
    stallCount: 0,
    maxStalls: 3,
    replanCount: 0,
    maxReplans: 1,
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
        acceptLocalDecision: vi.fn(async () =>
            success({
                requestId: "local-accept",
                decisionCandidateId: "candidate-1",
                decisionId: "decision-candidate-1",
                proposalId: "proposal-1",
                proposalRevision: 1,
                completionFactId: "completion-candidate-1-acceptance"
            })
        ),
        disposeLocalDecision: vi.fn(async () =>
            success({
                requestId: "local-revoke",
                decisionId: "decision-candidate-1",
                action: "revoke" as const,
                completionFactId: "completion-local-revoke-decision-revocation"
            })
        ),
        disposeLocalRisk: vi.fn(async () =>
            success({
                requestId: "local-risk-accept",
                issueId: "risk-1",
                disposition: "accepted" as const,
                completionFactId: "completion-local-risk-accept-risk-0",
                meetingStatus: "running" as const
            })
        ),
        getLocalMeetingStatus: vi.fn(async () => success(statusResult)),
        pauseLocalMeeting: vi.fn(async () =>
            success({ status: "paused" as const, changed: true }, 3)
        ),
        resumeLocalMeeting: vi.fn(async () =>
            success({ status: "running" as const, changed: true }, 4)
        ),
        reassignLocalTurn: vi.fn(async () =>
            success({ revokedAttemptId: "attempt-1", action: "skip" as const }, 5)
        ),
        endLocalMeeting: vi.fn(async () =>
            success({ status: "cancelled" as const, terminationCode: "user_cancelled" }, 6)
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

function skipBody(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: 2,
        currentAttemptId: "attempt-1",
        action: "skip",
        reason: "local skip",
        requestId: "skip-1",
        ...overrides
    });
}

function endBody(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: 2,
        outcome: "cancelled",
        reason: "local end",
        acceptedDecisionIds: [],
        deferredAgendaItemIds: [],
        waivers: [],
        requestId: "end-1",
        ...overrides
    });
}

describe("local Meeting HTTP boundary", () => {
    it("registers one prefix and serves all nine successful routes", async () => {
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
        const reassign = await invoke(
            handler,
            "POST",
            `/api/convivium/meetings/${meetingId}/reassign`,
            { body: skipBody(), contentType: "application/json" }
        );
        const end = await invoke(handler, "POST", `/api/convivium/meetings/${meetingId}/end`, {
            body: endBody(),
            contentType: "application/json"
        });

        for (const [suffix, fields] of [
            ["accept-decision", { decisionCandidateId: "candidate-1" }],
            ["dispose-decision", { decisionId: "decision-1", action: "revoke" }],
            ["dispose-risk", { issueId: "risk-1", decision: "accept" }]
        ] as const) {
            expect(
                (
                    await invoke(
                        handler,
                        "POST",
                        `/api/convivium/meetings/${meetingId}/${suffix}`,
                        {
                            body: JSON.stringify({
                                protocolVersion: 1,
                                meetingId,
                                expectedMeetingVersion: 2,
                                requestId: "command-1",
                                reason: "Reviewed evidence",
                                evidenceMessageIds: ["message-1"],
                                ...fields
                            }),
                            contentType: "application/json"
                        }
                    )
                ).status
            ).toBe(200);
        }
        for (const response of [list, status, pause, resume, reassign, end]) {
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        }
        expect(list.json).toMatchObject({ result: { meetings: [{ meetingId }] } });
        expect(status.json).toMatchObject({ result: { status: "running" } });
        expect(pause.json).toMatchObject({ result: { status: "paused" } });
        expect(resume.json).toMatchObject({ result: { status: "running" } });
        expect(reassign.json).toMatchObject({ result: { action: "skip" } });
        expect(end.json).toMatchObject({ result: { status: "cancelled" } });
        expect(runtime.pauseLocalMeeting).toHaveBeenCalledWith(JSON.parse(pauseBody()));
        expect(runtime.reassignLocalTurn).toHaveBeenCalledWith(JSON.parse(skipBody()));
        expect(runtime.endLocalMeeting).toHaveBeenCalledWith(JSON.parse(endBody()));
    });

    it("accepts only the formal reassign replacement shape", async () => {
        const { handler, runtime } = registeredHandler();
        const replacement = JSON.stringify({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            currentAttemptId: "attempt-1",
            action: "reassign",
            replacementParticipantId: "participant-2",
            reason: "local reassign",
            requestId: "reassign-1"
        });
        const successResponse = await invoke(
            handler,
            "POST",
            `/api/convivium/meetings/${meetingId}/reassign`,
            { body: replacement, contentType: "application/json" }
        );
        expect(successResponse.status).toBe(200);
        expect(runtime.reassignLocalTurn).toHaveBeenCalledWith(JSON.parse(replacement));

        const invalid = await invoke(
            handler,
            "POST",
            `/api/convivium/meetings/${meetingId}/reassign`,
            {
                body: skipBody({ replacementParticipantId: "participant-2" }),
                contentType: "application/json"
            }
        );
        expect(invalid.json).toMatchObject({ code: "INVALID_ARGUMENT" });
    });

    it.each([
        ["GET", "/api/convivium/meetings/"],
        ["GET", "/api/convivium/meetings/meeting-1/../pause"],
        ["POST", `/api/convivium/meetings/${meetingId}/end/`],
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
            `/api/convivium/meetings/${meetingId}/reassign`,
            skipBody({ userId: "user-1" }),
            "application/json"
        ],
        [
            "POST",
            `/api/convivium/meetings/${meetingId}/end`,
            endBody({ captainSessionId: "captain-1" }),
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

describe("local decision risk routes preserve strict HTTP boundary", () => {
    const common = {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: 2,
        requestId: "local-command",
        reason: "Reviewed evidence",
        evidenceMessageIds: ["message-1"]
    };
    const cases = [
        {
            suffix: "accept-decision",
            method: "acceptLocalDecision" as const,
            input: { ...common, decisionCandidateId: "candidate-1" }
        },
        {
            suffix: "dispose-decision",
            method: "disposeLocalDecision" as const,
            input: {
                ...common,
                decisionId: "decision-1",
                action: "supersede",
                replacementCandidateId: "candidate-2"
            }
        },
        {
            suffix: "dispose-decision",
            method: "disposeLocalDecision" as const,
            input: { ...common, decisionId: "decision-1", action: "revoke" }
        },
        {
            suffix: "dispose-risk",
            method: "disposeLocalRisk" as const,
            input: { ...common, issueId: "risk-1", decision: "accept" }
        },
        {
            suffix: "dispose-risk",
            method: "disposeLocalRisk" as const,
            input: { ...common, issueId: "risk-1", decision: "reject" }
        }
    ];
    it.each(cases)(
        "dispatches $suffix $input.action $input.decision exactly",
        async ({ suffix, method, input }) => {
            const { handler, runtime: service } = registeredHandler();
            if ("action" in input && input.action === "supersede")
                service.disposeLocalDecision.mockResolvedValueOnce(
                    success({
                        requestId: input.requestId,
                        decisionId: input.decisionId,
                        action: "supersede",
                        replacementDecisionId: "decision-candidate-2",
                        completionFactId: "replace-fact"
                    }) as never
                );
            if ("decision" in input && input.decision === "reject")
                service.disposeLocalRisk.mockResolvedValueOnce(
                    success({
                        requestId: input.requestId,
                        issueId: input.issueId,
                        disposition: "rejected",
                        completionFactId: "reject-fact",
                        meetingStatus: "running"
                    }) as never
                );
            const result = await invoke(
                handler,
                "POST",
                `/api/convivium/meetings/${meetingId}/${suffix}`,
                { body: JSON.stringify(input), contentType: "application/json" }
            );
            expect(result.status).toBe(200);
            expect(result.headers.get("content-type")).toBe("application/json; charset=utf-8");
            expect(service[method]).toHaveBeenCalledExactlyOnceWith(input);
            for (const name of [
                "acceptLocalDecision",
                "disposeLocalDecision",
                "disposeLocalRisk"
            ] as const)
                if (name !== method) expect(service[name]).not.toHaveBeenCalled();
        }
    );
    it.each(cases)(
        "rejects invalid $suffix inputs before Runtime",
        async ({ suffix, method, input }) => {
            const { handler, runtime: service } = registeredHandler();
            const url = `/api/convivium/meetings/${meetingId}/${suffix}`;
            const malformed: unknown[] = [
                null,
                [],
                3,
                { ...input, actor: "captain" },
                { ...input, meetingId: "wrong" },
                { ...input, protocolVersion: 2 },
                { ...input, expectedMeetingVersion: "invalid" }
            ];
            for (const key of Object.keys(input)) {
                const value = { ...input } as Record<string, unknown>;
                delete value[key];
                malformed.push(value);
            }
            if (suffix === "dispose-decision")
                malformed.push(
                    { ...input, action: "invalid" },
                    {
                        ...common,
                        decisionId: "decision-1",
                        action: "revoke",
                        replacementCandidateId: "candidate-2"
                    }
                );
            if (suffix === "dispose-risk") malformed.push({ ...input, decision: "invalid" });
            for (const value of malformed) {
                const result = await invoke(handler, "POST", url, {
                    body: JSON.stringify(value),
                    contentType: "application/json"
                });
                expect(result.status).toBe(400);
                expect(result.json).toEqual({
                    protocolVersion: 1,
                    ok: false,
                    code: "INVALID_ARGUMENT",
                    message: "Invalid meeting request.",
                    retryable: false
                });
            }
            for (const [target, options] of [
                [url, { body: "{", contentType: "application/json" }],
                [url, { body: " ".repeat(16_385), contentType: "application/json" }],
                [url, { body: JSON.stringify(input) }],
                [url, { body: JSON.stringify(input), contentType: "text/plain" }],
                [url + "?x=1", { body: JSON.stringify(input), contentType: "application/json" }],
                [
                    `/api/convivium/meetings/%ZZ/${suffix}`,
                    { body: JSON.stringify(input), contentType: "application/json" }
                ]
            ] as const)
                expect((await invoke(handler, "POST", target, options)).status).toBe(400);
            for (const [verb, target] of [
                ["GET", url],
                ["POST", url + "/"],
                ["POST", url + "/other"]
            ]) {
                const result = await invoke(handler, verb!, target!);
                expect(result.status).toBe(404);
                expect(result.body).toBe("");
            }
            expect(service[method]).not.toHaveBeenCalled();
        }
    );
    it.each(cases)(
        "validates $suffix envelopes and error mappings",
        async ({ suffix, method, input }) => {
            const { handler, runtime: service } = registeredHandler();
            const run = () =>
                invoke(handler, "POST", `/api/convivium/meetings/${meetingId}/${suffix}`, {
                    body: JSON.stringify(input),
                    contentType: "application/json"
                });
            for (const [code, status] of [
                ["VERSION_CONFLICT", 409],
                ["IDEMPOTENCY_CONFLICT", 409],
                ["MEETING_NOT_FOUND", 404],
                ["INVALID_ARGUMENT", 400]
            ] as const) {
                const error = {
                    protocolVersion: 1,
                    ok: false,
                    code,
                    message: "rejected",
                    retryable: false
                };
                service[method].mockResolvedValueOnce(error as never);
                const response = await run();
                expect(response.status).toBe(status);
                expect(response.json).toEqual(error);
            }
            service[method].mockRejectedValueOnce(
                new LocalMeetingRecoveryUnavailableError("private recovery detail")
            );
            const unavailable = await run();
            expect(unavailable.status).toBe(503);
            expect(unavailable.headers.get("retry-after")).toBe("1");
            expect(unavailable.body).toBe("");
            service[method].mockRejectedValueOnce(new Error("private failure"));
            expect(await run()).toMatchObject({ status: 500, body: "" });
            service[method].mockResolvedValueOnce(success({ bad: "value" }) as never);
            expect(await run()).toMatchObject({ status: 500, body: "" });
        }
    );
});
