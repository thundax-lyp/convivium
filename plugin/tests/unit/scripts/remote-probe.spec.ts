import { afterEach, describe, expect, it, vi } from "vitest";
import { createRemoteProbe } from "../../../scripts/smoke-profile/probe/support.js";
import { openMeetingStream } from "../../../scripts/smoke-profile/probe/remote-stream.js";
import { WebSocketServer } from "ws";
import { once } from "node:events";

afterEach(() => vi.unstubAllGlobals());

describe("Remote smoke probe", () => {
    it("opens and reopens actual sockets with the same authenticated session", async () => {
        const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
        await once(server, "listening");
        const address = server.address();
        if (typeof address === "string") throw new Error("Expected TCP socket");
        const origin = `http://127.0.0.1:${address.port}`;
        const requests: unknown[] = [];
        const cookies: (string | undefined)[] = [];
        server.on("connection", (socket, request) => {
            cookies.push(request.headers.cookie);
            socket.on("message", (data) => {
                const message = JSON.parse(data.toString());
                requests.push(message);
                socket.send(
                    JSON.stringify({
                        type: "item",
                        streamId: message.streamId,
                        value: { kind: "refresh" }
                    })
                );
            });
        });
        let stream;
        try {
            for (let i = 0; i < 2; i++) {
                stream = await openMeetingStream(origin, "session=test");
                await expect(stream.next()).resolves.toEqual({ kind: "refresh" });
                await stream.close();
            }
            expect(cookies).toEqual(["session=test", "session=test"]);
            expect(requests).toEqual(
                Array(2).fill({
                    type: "open",
                    streamId: "convivium-smoke-updates",
                    endpoint: "conviviumMeetings/watchUpdates",
                    payload: { args: {} }
                })
            );
        } finally {
            await stream?.close();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
    it("authenticates once and preserves the RPC and domain envelopes", async () => {
        const domain = { protocolVersion: 1, ok: false, code: "VERSION_CONFLICT" };
        const requests: { url: string; options?: RequestInit }[] = [];
        const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
            requests.push({ url, options });
            if (requests.length === 1)
                return new Response(null, {
                    status: 303,
                    headers: { "set-cookie": "session=test; HttpOnly; Path=/" }
                });
            const request = JSON.parse(String(options?.body));
            return Response.json({
                type: "server-response",
                rpcId: request.rpcId,
                result: { ok: true, value: domain }
            });
        });
        vi.stubGlobal("fetch", fetchMock);
        const connection = { authenticatedUrl: vi.fn((url: string) => url + "?token=test") };
        const probe = await createRemoteProbe(connection, "http://127.0.0.1:1234");
        await expect(probe.callRemote("list")).resolves.toEqual(domain);
        const input = { protocolVersion: 1, meetingId: "meeting-1", requestId: "business-request" };
        await expect(probe.callRemote("pause", input)).resolves.toEqual(domain);
        expect(connection.authenticatedUrl).toHaveBeenCalledOnce();
        expect(requests[0]?.options).toEqual({ redirect: "manual" });
        expect(requests[1]?.url).toBe("http://127.0.0.1:1234/api/conviviumMeetings/list");
        expect(requests[1]?.options?.headers).toEqual({
            "content-type": "application/json",
            cookie: "session=test",
            origin: "http://127.0.0.1:1234"
        });
        expect(JSON.parse(String(requests[1]?.options?.body))).toMatchObject({
            type: "client-request",
            payload: { args: {} }
        });
        expect(JSON.parse(String(requests[2]?.options?.body))).toMatchObject({
            method: "conviviumMeetings/pause",
            payload: { args: { input } }
        });
        expect(JSON.parse(String(requests[1]?.options?.body)).rpcId).not.toBe(
            JSON.parse(String(requests[2]?.options?.body)).rpcId
        );
    });

    it.each(["http", "type", "id", "failure"])("rejects a broken %s response", async (fault) => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce(
                    new Response(null, { status: 303, headers: { "set-cookie": "session=test" } })
                )
                .mockImplementationOnce(async (_url, options) => {
                    const request = JSON.parse(options.body);
                    return Response.json(
                        {
                            type: fault === "type" ? "wrong" : "server-response",
                            rpcId: fault === "id" ? "wrong" : request.rpcId,
                            result: { ok: fault !== "failure", value: {} }
                        },
                        { status: fault === "http" ? 503 : 200 }
                    );
                })
        );
        const probe = await createRemoteProbe(
            { authenticatedUrl: (url: string) => url },
            "http://127.0.0.1:1234"
        );
        await expect(probe.callRemote("list")).rejects.toThrow(/Remote probe/);
    });
});
