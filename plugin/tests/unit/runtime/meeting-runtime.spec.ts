import { describe, expect, it } from "vitest";
import { createMeetingRuntime } from "../../../src/runtime/meeting-runtime.js";
import { rejectUnsupportedTaskEvidence } from "../../../src/runtime/task-evidence.js";
import type { CreateMeetingInputV1 } from "../../../src/protocol/index.js";
import { LocalMeetingRecoveryUnavailableError } from "../../../src/runtime/application-service.js";

const input: CreateMeetingInputV1 = {
    protocolVersion: 1,
    requestId: "create-1",
    teamId: "team-1",
    topic: "Topic",
    objective: "Objective",
    objectiveContract: {
        requiredOutputs: [],
        acceptanceCriteria: [],
        hardConstraints: [],
        requiredReviewerKeys: [],
        riskAcceptanceAuthorityKeys: [],
        acceptableRiskLevel: "low"
    },
    agenda: [
        {
            key: "agenda-1",
            title: "Agenda",
            objective: "Discuss",
            inScope: [],
            outOfScope: [],
            completionCriteria: [],
            requiredParticipantKeys: ["p-1", "p-2", "p-3"]
        }
    ],
    participants: [
        { participantKey: "p-1", displayName: "One" },
        { participantKey: "p-2", displayName: "Two" },
        { participantKey: "p-3", displayName: "Three" }
    ],
    selectionMode: "round_robin"
};

function dependencies(overrides: Record<string, unknown> = {}) {
    const calls: string[] = [];
    const repository = {
        meetingId: "meeting-1",
        create: async () => {
            calls.push("bootstrap");
            return {};
        },
        recordSessionOwnership: async (ownership: { lifecycleStatus: string }) => {
            calls.push(`ownership:${ownership.lifecycleStatus}`);
            return ownership;
        },
        completeCreate: async () => {
            calls.push("complete");
            return { requestId: "create-1", meetingId: "meeting-1", meetingVersion: 0, result: {} };
        },
        updateBootstrap: async () => {
            calls.push("failed");
            return {};
        }
    };
    return {
        calls,
        repository,
        continuable: {
            startContinuable: async (spec: { childId?: string }) => ({
                childId: spec.childId!,
                messageId: "message-1" as never
            })
        },
        parent: { id: "captain-1" } as never,
        provider: "spawn",
        authorization: { callerBinding: "captain-1", capabilityId: "capability-1" },
        allocateSessionId: (role: string, key: string) => `${role}-${key}` as never,
        signal: new AbortController().signal,
        now: () => 100,
        ...overrides
    };
}

describe("createMeetingRuntime", () => {
    it("creates bootstrap, four owned Sessions, and the public Meeting in order", async () => {
        const deps = dependencies();
        await createMeetingRuntime(input, deps as never);

        expect(deps.calls).toEqual([
            "bootstrap",
            "ownership:provisioning",
            "ownership:active",
            "ownership:provisioning",
            "ownership:active",
            "ownership:provisioning",
            "ownership:active",
            "ownership:provisioning",
            "ownership:active",
            "complete"
        ]);
    });

    it("marks bootstrap failed and invokes cleanup when Session creation fails", async () => {
        const deps = dependencies({
            continuable: {
                startContinuable: async () => {
                    throw new Error("provider unavailable");
                }
            },
            cleanup: async (ownerships: readonly { sessionId: string }[]) => {
                deps.calls.push(`cleanup:${ownerships.length}`);
            }
        });

        await expect(createMeetingRuntime(input, deps as never)).rejects.toThrow(
            "provider unavailable"
        );
        expect(deps.calls).toEqual(["bootstrap", "ownership:provisioning", "failed", "cleanup:1"]);
    });
});

describe("rejectUnsupportedTaskEvidence", () => {
    const resolverInput = {
        state: { id: "meeting-1", version: 1 } as never,
        meetingId: "meeting-1",
        participantId: "participant-1"
    };

    it("accepts no task evidence and rejects non-empty task IDs", () => {
        expect(rejectUnsupportedTaskEvidence.resolve({ ...resolverInput, taskIds: [] })).toEqual(
            []
        );
        expect(() =>
            rejectUnsupportedTaskEvidence.resolve({ ...resolverInput, taskIds: ["task-1"] })
        ).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CAPABILITY" }));
    });
});

describe("LocalMeetingRecoveryUnavailableError", () => {
    it("keeps recovery unavailability outside the public protocol code space", () => {
        const cause = new Error("storage unavailable");
        const error = new LocalMeetingRecoveryUnavailableError("recovery unavailable", { cause });

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("LocalMeetingRecoveryUnavailableError");
        expect(error.cause).toBe(cause);
        expect(error).not.toHaveProperty("code");
    });
});
