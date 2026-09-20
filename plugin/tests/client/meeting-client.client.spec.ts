import { describe, expect, it, vi } from "vitest";
import type { ClientRemote } from "@deepseek-ai/dsh-api-gateway/client";
import { createMeetingClient, ProtocolFailure } from "@/client/meeting-client.js";

describe("MeetingClient target transport", () => {
    it("exposes the four target transport methods", async () => {
        const remote = {
            conviviumMeetings: {
                list: vi.fn(async () => ({ ok: true, value: { meetings: [] } })),
                read: vi.fn(),
                control: vi.fn(async () => ({
                    ok: true,
                    value: { kind: "rejected", error: { code: "UNAUTHORIZED", message: "no" } }
                })),
                subscribeRefresh: vi.fn()
            },
            $stream: vi.fn(),
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
