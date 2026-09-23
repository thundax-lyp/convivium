import { describe, expect, it, vi } from "vitest";
import type { ClientRemote } from "@deepseek-ai/dsh-api-gateway/client";
import { createMeetingClient, ProtocolFailure } from "@/client/meeting-client.js";

describe("MeetingClient target transport", () => {
    it("exposes the four target transport methods", async () => {
        const refreshSource = {
            async *[Symbol.asyncIterator]() {
                yield { kind: "refresh", meetingId: "meeting-1", committedVersion: 2 };
            }
        };
        const refreshStream = { dispose: vi.fn(async () => {}) };
        type StreamOptions = {
            name: string;
            open(signal: AbortSignal): unknown;
            ended(): Error;
            carrierFailed(): void;
        };
        const $stream = vi.fn((_options: StreamOptions) => refreshStream);
        const subscribeRefresh = vi.fn(() => refreshSource);
        const remote = {
            conviviumMeetings: {
                list: vi.fn(async () => ({ ok: true, value: { meetings: [] } })),
                read: vi.fn(),
                control: vi.fn(async () => ({
                    ok: true,
                    value: { kind: "rejected", error: { code: "UNAUTHORIZED", message: "no" } }
                })),
                subscribeRefresh
            },
            $stream,
            $host: { home: undefined, isLoopback: true }
        } as unknown as ClientRemote;
        const client = createMeetingClient(remote);
        expect(Object.keys(client)).toEqual(["list", "read", "control", "subscribeRefresh"]);
        await expect(client.list()).resolves.toEqual({ meetings: [] });
        await expect(
            client.control({
                protocolVersion: 1,
                meetingId: "meeting-1",
                expectedMeetingVersion: 1,
                requestId: "request-1",
                action: { kind: "open_round", agendaId: "agenda-1" }
            })
        ).resolves.toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });

        const callbacks = {
            carrierFailed: vi.fn(),
            generationReopened: vi.fn()
        };
        expect(client.subscribeRefresh(callbacks)).toBe(refreshStream);
        expect($stream).toHaveBeenCalledOnce();
        const options = $stream.mock.calls[0]?.[0];
        expect(options?.name).toBe("convivium-meetings-refresh");
        const signal = new AbortController().signal;
        expect(options?.open(signal)).toBe(refreshSource);
        expect(callbacks.generationReopened).not.toHaveBeenCalled();
        expect(options?.open(signal)).toBe(refreshSource);
        expect(callbacks.generationReopened).toHaveBeenCalledOnce();
        expect(subscribeRefresh).toHaveBeenCalledWith(signal);
        expect(options?.ended().message).toBe("Meeting refresh stream ended.");
        options?.carrierFailed();
        expect(callbacks.carrierFailed).toHaveBeenCalledOnce();
    });

    it("maps carrier invalid-request failures and forwards read input", async () => {
        const read = vi.fn(async () => ({
            ok: false,
            error: { code: "convivium/invalid-request", message: "invalid" }
        }));
        const remote = {
            conviviumMeetings: {
                list: vi.fn(),
                read,
                control: vi.fn(),
                subscribeRefresh: vi.fn()
            },
            $stream: vi.fn(),
            $host: { home: undefined, isLoopback: true }
        } as unknown as ClientRemote;
        const client = createMeetingClient(remote);
        await expect(
            client.read({ protocolVersion: 1, meetingId: "meeting-1" })
        ).rejects.toMatchObject({
            protocolError: { code: "INVALID_ARGUMENT" }
        } satisfies Partial<ProtocolFailure>);
        expect(read).toHaveBeenCalledWith(
            { protocolVersion: 1, meetingId: "meeting-1" },
            undefined
        );
    });
});
