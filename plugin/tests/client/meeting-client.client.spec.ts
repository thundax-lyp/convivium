import { describe, expect, it, vi } from "vitest";
import type { ClientRemote } from "@deepseek-ai/dsh-api-gateway/client";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import { createMeetingClient, ProtocolFailure } from "@/client/meeting-client.js";
import type { MeetingStatusResultV1 } from "@/protocol/index.js";
import { createRemoteClient } from "../fixtures/remote-client.js";

function status(): MeetingStatusResultV1 {
    return {
        meetingId: "meeting-1",
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
    };
}

describe("MeetingClient", () => {
    it("mounts the published Client namespace and removes it on unmount", async () => {
        const call = vi.fn(async () => ({
            ok: true as const,
            value: {
                protocolVersion: 1,
                ok: true,
                result: { meetings: [] }
            }
        }));
        const fixture = await createRemoteClient(call);
        try {
            await expect(createMeetingClient(fixture.ctx.remote).list()).resolves.toEqual({
                protocolVersion: 1,
                ok: true,
                result: { meetings: [] }
            });
            expect(call).toHaveBeenCalledWith(
                "/api",
                "conviviumMeetings/list",
                { args: {} },
                expect.any(AbortSignal)
            );
            await fixture.unmount();
            expect(fixture.ctx.get("remote.conviviumMeetings")).toBeUndefined();
        } finally {
            await fixture.dispose();
        }
    });

    it("forwards input and signal and validates the success envelope", async () => {
        const signal = new AbortController().signal;
        const getStatus = vi.fn(
            async () =>
                ({
                    ok: true as const,
                    value: {
                        protocolVersion: 1 as const,
                        ok: true as const,
                        meetingId: "meeting-1",
                        meetingVersion: 2,
                        result: status()
                    }
                }) satisfies RemoteResult<unknown>
        );
        const remote = {
            conviviumMeetings: {
                getStatus,
                list: vi.fn(),
                pause: vi.fn(),
                resume: vi.fn(),
                reassign: vi.fn(),
                end: vi.fn(),
                acceptDecision: vi.fn(),
                disposeDecision: vi.fn(),
                disposeRisk: vi.fn(),
                watchUpdates: vi.fn()
            },
            $stream: vi.fn(),
            $host: { home: undefined, isLoopback: true }
        } as unknown as ClientRemote;
        const client = createMeetingClient(remote);
        await expect(
            client.getStatus({ protocolVersion: 1, meetingId: "meeting-1" }, signal)
        ).resolves.toMatchObject({ result: { meetingId: "meeting-1" } });
        expect(getStatus).toHaveBeenCalledWith(
            { protocolVersion: 1, meetingId: "meeting-1" },
            signal
        );
    });

    it("maps invalid-request Remote failures to INVALID_ARGUMENT", async () => {
        const remote = {
            conviviumMeetings: {
                list: vi.fn(),
                getStatus: vi.fn(async () => ({
                    ok: false as const,
                    error: { code: "convivium/invalid-request", message: "invalid" }
                })),
                pause: vi.fn(),
                resume: vi.fn(),
                reassign: vi.fn(),
                end: vi.fn(),
                acceptDecision: vi.fn(),
                disposeDecision: vi.fn(),
                disposeRisk: vi.fn(),
                watchUpdates: vi.fn()
            },
            $stream: vi.fn(),
            $host: { home: undefined, isLoopback: true }
        } as unknown as ClientRemote;
        await expect(
            createMeetingClient(remote).getStatus({ protocolVersion: 1, meetingId: "meeting-1" })
        ).rejects.toMatchObject({
            protocolError: { code: "INVALID_ARGUMENT" }
        } satisfies Partial<ProtocolFailure>);
    });
});
