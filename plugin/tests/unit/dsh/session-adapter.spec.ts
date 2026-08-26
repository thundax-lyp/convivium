import { describe, expect, it } from "vitest";
import {
    followupParticipantSession,
    startManagerSession,
    startParticipantSession
} from "../../../src/dsh/session-adapter.js";

const participantOwnership = (overrides = {}) => ({
    sessionId: "participant-session",
    parentSessionId: "captain-session",
    sessionLabel: "convivium:meeting-participant:team-1:meeting-1:participant-a",
    provider: "spawn",
    role: "participant" as const,
    participantId: "participant-a",
    lifecycleStatus: "active" as const,
    capabilityStatus: "active" as const,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
});

const speakerAttempt = {
    attemptId: "attempt-1",
    deliveryId: "delivery-1",
    participantId: "participant-a"
};

describe("startManagerSession", () => {
    it("uses the reserved child identity and capability-free provisioning prompt", async () => {
        let received: unknown;
        const result = await startManagerSession({
            runtime: {
                startContinuable: async (spec) => {
                    received = spec;
                    return { childId: spec.childId!, messageId: "message-1" as never };
                }
            },
            provider: "spawn",
            parent: { id: "captain-1" } as never,
            childId: "manager-1" as never,
            teamId: "team-1",
            meetingId: "meeting-1",
            signal: new AbortController().signal
        });
        expect(result.childId).toBe("manager-1");
        expect(received).toMatchObject({
            provider: "spawn",
            childId: "manager-1",
            label: "convivium:meeting-manager:team-1:meeting-1",
            request: { prompt: [{ type: "text" }] }
        });
        const spec = received as { request: { prompt: Array<{ text: string }> } };
        expect(JSON.parse(spec.request.prompt[0]!.text)).toMatchObject({
            role: "manager",
            capability: "none"
        });
    });

    it("rejects a provider response that cannot match persisted ownership", async () => {
        await expect(
            startManagerSession({
                runtime: {
                    startContinuable: async () => ({
                        childId: "other" as never,
                        messageId: "m" as never
                    })
                },
                provider: "spawn",
                parent: {} as never,
                childId: "manager-1" as never,
                teamId: "team-1",
                meetingId: "meeting-1",
                signal: new AbortController().signal
            })
        ).rejects.toThrow(/different from ownership/);
    });
});

describe("startParticipantSession", () => {
    it("binds the reserved child identity to one participant without speaker capability", async () => {
        let received: unknown;
        const result = await startParticipantSession({
            runtime: {
                startContinuable: async (spec) => {
                    received = spec;
                    return { childId: spec.childId!, messageId: "message-2" as never };
                }
            },
            provider: "spawn",
            parent: { id: "captain-1" } as never,
            childId: "participant-1" as never,
            teamId: "team-1",
            meetingId: "meeting-1",
            participantId: "participant-a",
            signal: new AbortController().signal
        });

        expect(result.childId).toBe("participant-1");
        expect(received).toMatchObject({
            provider: "spawn",
            childId: "participant-1",
            label: "convivium:meeting-participant:team-1:meeting-1:participant-a",
            request: { prompt: [{ type: "text" }] }
        });
        const spec = received as { request: { prompt: Array<{ text: string }> } };
        expect(JSON.parse(spec.request.prompt[0]!.text)).toMatchObject({
            role: "participant",
            participantId: "participant-a",
            capability: "none"
        });
    });

    it("rejects a provider response that cannot match participant ownership", async () => {
        await expect(
            startParticipantSession({
                runtime: {
                    startContinuable: async () => ({
                        childId: "other" as never,
                        messageId: "m" as never
                    })
                },
                provider: "spawn",
                parent: {} as never,
                childId: "participant-1" as never,
                teamId: "team-1",
                meetingId: "meeting-1",
                participantId: "participant-a",
                signal: new AbortController().signal
            })
        ).rejects.toThrow(/different from ownership/);
    });
});

describe("followupParticipantSession", () => {
    it("uses the exact Captain parent and rechecks authorization around inbox acceptance", async () => {
        const authorizations: unknown[] = [];
        let received: unknown;
        const result = await followupParticipantSession({
            runtime: {
                followup: async (...args) => {
                    received = args;
                    return "message-3" as never;
                }
            },
            parent: { id: "captain-session" } as never,
            ownership: participantOwnership(),
            attempt: speakerAttempt,
            prompt: [{ type: "text", text: "speak" }],
            signal: new AbortController().signal,
            authorize: async (authorization) => {
                authorizations.push(authorization);
            }
        });

        expect(result).toBe("message-3");
        expect(authorizations).toHaveLength(2);
        expect(received).toMatchObject([
            { id: "captain-session" },
            "participant-session",
            [{ type: "text", text: "speak" }],
            {
                source: {
                    kind: "coordinator",
                    form: "relay",
                    senderSessionId: "captain-session"
                }
            }
        ]);
    });

    it.each([
        ["wrong Captain", { parentSessionId: "other-captain" }],
        ["revoked ownership", { capabilityStatus: "revoked" }],
        ["inactive ownership", { lifecycleStatus: "provisioning" }],
        ["other participant", { participantId: "participant-b" }]
    ])("does not deliver when %s", async (_name, overrides) => {
        let delivered = false;
        await expect(
            followupParticipantSession({
                runtime: {
                    followup: async () => {
                        delivered = true;
                        return "message-3" as never;
                    }
                },
                parent: { id: "captain-session" } as never,
                ownership: participantOwnership(overrides),
                attempt: speakerAttempt,
                prompt: [{ type: "text", text: "speak" }],
                signal: new AbortController().signal,
                authorize: async () => undefined
            })
        ).rejects.toThrow();
        expect(delivered).toBe(false);
    });

    it("does not deliver a stale attempt", async () => {
        let delivered = false;
        await expect(
            followupParticipantSession({
                runtime: {
                    followup: async () => {
                        delivered = true;
                        return "message-3" as never;
                    }
                },
                parent: { id: "captain-session" } as never,
                ownership: participantOwnership(),
                attempt: speakerAttempt,
                prompt: [{ type: "text", text: "speak" }],
                signal: new AbortController().signal,
                authorize: async () => {
                    throw new Error("STALE_ATTEMPT");
                }
            })
        ).rejects.toThrow("STALE_ATTEMPT");
        expect(delivered).toBe(false);
    });

    it("does not return a delivery that loses authorization after acceptance", async () => {
        let checks = 0;
        await expect(
            followupParticipantSession({
                runtime: { followup: async () => "message-3" as never },
                parent: { id: "captain-session" } as never,
                ownership: participantOwnership(),
                attempt: speakerAttempt,
                prompt: [{ type: "text", text: "speak" }],
                signal: new AbortController().signal,
                authorize: async () => {
                    checks += 1;
                    if (checks === 2) throw new Error("CAPABILITY_REVOKED");
                }
            })
        ).rejects.toThrow("CAPABILITY_REVOKED");
        expect(checks).toBe(2);
    });
});
