import { describe, expect, it } from "vitest";
import type { LocalMeetingWebRuntime } from "@/runtime/index.js";
import { createRemoteGateway } from "../fixtures/remote-gateway.js";

function runtimeFixture() {
    const calls = {
        list: 0,
        read: 0,
        control: 0
    };
    const runtime = {
        async list() {
            calls.list += 1;
            return { meetings: [] };
        },
        async read() {
            calls.read += 1;
            throw new Error("read should not run for invalid input");
        },
        async control() {
            calls.control += 1;
            return {
                kind: "rejected" as const,
                error: { code: "UNAUTHORIZED" as const, message: "not allowed" }
            };
        },
        async *subscribeRefresh(signal: AbortSignal) {
            yield { kind: "refresh" as const, meetingId: "meeting-1", committedVersion: 3 };
            await new Promise<void>((resolve) =>
                signal.addEventListener("abort", () => resolve(), { once: true })
            );
        }
    } as unknown as LocalMeetingWebRuntime;
    return { runtime, calls };
}

describe("target Remote boundary", () => {
    it("exposes only list/read/control and the refresh stream", async () => {
        const fixture = runtimeFixture();
        const gateway = await createRemoteGateway(fixture.runtime);
        await expect(gateway.invoke("list", {})).resolves.toEqual({ meetings: [] });
        expect(fixture.calls.list).toBe(1);

        await expect(
            gateway.invoke("control", {
                command: {
                    protocolVersion: 1,
                    meetingId: "meeting-1",
                    expectedMeetingVersion: 1,
                    requestId: "request-1",
                    action: { kind: "open_round", agendaId: "agenda-1", planId: "plan-1" }
                }
            })
        ).resolves.toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(fixture.calls.control).toBe(1);

        await expect(
            gateway.invoke("read", { request: { protocolVersion: 1, meetingId: "" } })
        ).rejects.toMatchObject({ code: "convivium/invalid-request" });
        expect(fixture.calls.read).toBe(0);

        const stream = await gateway.stream("subscribeRefresh", {});
        await expect(stream[Symbol.asyncIterator]().next()).resolves.toEqual({
            done: false,
            value: { kind: "refresh", meetingId: "meeting-1", committedVersion: 3 }
        });
        await gateway.dispose();
    });

    it("maps an incomplete Meeting list to convivium/internal", async () => {
        const fixture = runtimeFixture();
        fixture.runtime.list = async () => {
            throw new Error("Meeting is not ready.");
        };
        const gateway = await createRemoteGateway(fixture.runtime);

        try {
            await expect(gateway.invoke("list", {})).rejects.toMatchObject({
                code: "convivium/internal"
            });
        } finally {
            await gateway.dispose();
        }
    });
});
