import { describe, expect, it } from "vitest";
import {
    pauseMeetingRuntime,
    rebindCaptainParent,
    type PauseRecoveryDependencies
} from "../../src/runtime/recovery.js";

const ownership = {
    sessionId: "participant-session",
    parentSessionId: "captain-session",
    sessionLabel: "convivium:meeting-participant:team-1:meeting-1:participant-a",
    provider: "spawn",
    role: "participant" as const,
    participantId: "participant-a",
    lifecycleStatus: "active" as const,
    capabilityStatus: "active" as const,
    createdAt: 1,
    updatedAt: 1
};

function pauseDependencies(overrides: Partial<PauseRecoveryDependencies> = {}) {
    const recorded: unknown[] = [];
    const interrupted: unknown[] = [];
    const dependencies: PauseRecoveryDependencies = {
        repository: {
            execute: async (command) => ({
                requestId: command.requestId,
                meetingId: "meeting-1",
                meetingVersion: 1,
                result: { status: "paused", changed: true },
                eventSeqs: [1]
            }),
            recordSessionOwnership: async (value) => {
                recorded.push(value);
                return value as never;
            }
        },
        authorization: { callerBinding: "session:captain", capabilityId: "captain:captain" },
        requestId: "pause-1",
        expectedMeetingVersion: 0,
        reason: "operator request",
        ownerships: [ownership],
        parent: { id: "captain-session" } as never,
        lifecycle: {
            interrupt: (...args) => interrupted.push(args),
            drainContinuableChildren: async (...args) => interrupted.push(args)
        },
        signal: new AbortController().signal,
        now: () => 10,
        ...overrides
    };
    return { dependencies, recorded, interrupted };
}

describe("recovery controls", () => {
    it("revokes ownership before interrupting and closes after exact drain", async () => {
        const { dependencies, recorded, interrupted } = pauseDependencies();
        await pauseMeetingRuntime(dependencies);
        expect(recorded).toEqual([
            expect.objectContaining({ capabilityStatus: "revoked", lifecycleStatus: "active" }),
            expect.objectContaining({ capabilityStatus: "revoked", lifecycleStatus: "closed" })
        ]);
        expect(interrupted).toHaveLength(2);
    });

    it("revokes without touching DSH when the Captain parent is absent", async () => {
        const { dependencies, recorded, interrupted } = pauseDependencies({ parent: undefined });
        const result = await pauseMeetingRuntime(dependencies);
        expect(result).toMatchObject({ revokedOwnerships: 1 });
        expect(recorded).toHaveLength(1);
        expect(interrupted).toEqual([]);
    });

    it("does not rebind an Agent with a different persisted parent id", async () => {
        await expect(
            rebindCaptainParent({
                parent: { id: "wrong-captain" } as never,
                expectedParentSessionId: "captain-session",
                meetingId: "meeting-1",
                ownerships: [ownership],
                inspection: { listDescendants: async () => [] },
                signal: new AbortController().signal
            })
        ).rejects.toThrow(/exact persisted parent/);
    });
});
