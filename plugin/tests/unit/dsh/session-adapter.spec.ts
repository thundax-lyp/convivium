import { describe, expect, it } from "vitest";
import {
    followupParticipantSession,
    followupMeetingTaskSession,
    followupManagerSession,
    inspectOwnedSessions,
    interruptAndDrainOwnedSessions,
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

describe("followupMeetingTaskSession", () => {
    it("authorizes queued delivery before followup and running delivery after followup", async () => {
        const phases: string[] = [];
        await followupMeetingTaskSession({
            runtime: { followup: async () => "task-message" as never },
            parent: { id: "captain-session" } as never,
            ownership: participantOwnership(),
            meetingTaskId: "task-1",
            deliveryId: "delivery-1",
            prompt: [{ type: "text", text: "task" }],
            signal: new AbortController().signal,
            authorize: async (phase) => phases.push(phase)
        });
        expect(phases).toEqual(["before", "after"]);
    });
});

describe("followupManagerSession", () => {
    const ownership = {
        ...participantOwnership(),
        sessionId: "manager-session",
        sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
        role: "manager" as const,
        participantId: undefined
    };

    it("keeps the exact parent, delivery identity and authorization checks", async () => {
        const calls: unknown[] = [];
        const result = await followupManagerSession({
            runtime: {
                followup: async (...args) => {
                    calls.push(args);
                    return "manager-message" as never;
                }
            },
            parent: { id: "captain-session" } as never,
            ownership,
            attempt: { planningAttemptId: "planning-1", deliveryId: "delivery-1" },
            prompt: [{ type: "text", text: "plan" }],
            signal: new AbortController().signal,
            authorize: async () => undefined
        });
        expect(result).toBe("manager-message");
        expect((calls[0] as unknown[])[0]).toMatchObject({ id: "captain-session" });
        expect((calls[0] as unknown[])[1]).toBe("manager-session");
    });

    it.each([
        ["wrong parent", { parentSessionId: "other-captain" }],
        ["participant ownership", { role: "participant" as const, participantId: "participant-a" }],
        ["revoked capability", { capabilityStatus: "revoked" as const }]
    ])("fails closed for %s", async (_name, overrides) => {
        let delivered = false;
        await expect(
            followupManagerSession({
                runtime: {
                    followup: async () => {
                        delivered = true;
                        return "message" as never;
                    }
                },
                parent: { id: "captain-session" } as never,
                ownership: { ...ownership, ...overrides },
                attempt: { planningAttemptId: "planning-1", deliveryId: "delivery-1" },
                prompt: [{ type: "text", text: "plan" }],
                signal: new AbortController().signal,
                authorize: async () => undefined
            })
        ).rejects.toThrow();
        expect(delivered).toBe(false);
    });
});

describe("interruptAndDrainOwnedSessions", () => {
    it("interrupts and drains only the selected direct children of the exact Captain", async () => {
        const interrupted: unknown[] = [];
        let drained: unknown;
        await interruptAndDrainOwnedSessions({
            runtime: {
                interrupt: (...args) => interrupted.push(args),
                drainContinuableChildren: async (...args) => {
                    drained = args;
                }
            },
            parent: { id: "captain-session" } as never,
            ownerships: [
                participantOwnership(),
                participantOwnership({ sessionId: "participant-session-2" })
            ]
        });

        expect(interrupted).toEqual([
            ["participant-session", { kind: "ancestor", agent: { id: "captain-session" } }],
            ["participant-session-2", { kind: "ancestor", agent: { id: "captain-session" } }]
        ]);
        expect(drained).toEqual([
            { id: "captain-session" },
            ["participant-session", "participant-session-2"]
        ]);
    });

    it("does not interrupt or drain a child whose persisted parent differs", async () => {
        let interrupted = false;
        let drained = false;
        await expect(
            interruptAndDrainOwnedSessions({
                runtime: {
                    interrupt: () => {
                        interrupted = true;
                    },
                    drainContinuableChildren: async () => {
                        drained = true;
                    }
                },
                parent: { id: "captain-session" } as never,
                ownerships: [participantOwnership({ parentSessionId: "other-captain" })]
            })
        ).rejects.toThrow(/exact owned Captain parent/);
        expect(interrupted).toBe(false);
        expect(drained).toBe(false);
    });

    it("does not let duplicate ownership broaden the cleanup target", async () => {
        let interrupted = false;
        await expect(
            interruptAndDrainOwnedSessions({
                runtime: {
                    interrupt: () => {
                        interrupted = true;
                    },
                    drainContinuableChildren: async () => undefined
                },
                parent: { id: "captain-session" } as never,
                ownerships: [participantOwnership(), participantOwnership()]
            })
        ).rejects.toThrow(/twice/);
        expect(interrupted).toBe(false);
    });
});

describe("inspectOwnedSessions", () => {
    it("returns only fully matched continuable ownerships and records diagnostics", async () => {
        const ownership = participantOwnership();
        const result = await inspectOwnedSessions({
            runtime: {
                listDescendants: async () =>
                    [
                        {
                            kind: "child",
                            id: "participant-session" as never,
                            activity: "inactive",
                            mode: "continuable",
                            label: ownership.sessionLabel,
                            hasChildren: false,
                            parentId: "captain-session" as never,
                            depth: 1
                        },
                        {
                            kind: "child",
                            id: "foreign-session" as never,
                            activity: "inactive",
                            mode: "continuable",
                            label: "convivium:meeting-participant:team-1:other-meeting:foreign",
                            hasChildren: false,
                            parentId: "captain-session" as never,
                            depth: 1
                        },
                        {
                            kind: "child",
                            id: "one-shot" as never,
                            activity: "inactive",
                            mode: "one-shot",
                            label: "unrelated",
                            hasChildren: false,
                            parentId: "captain-session" as never,
                            depth: 1
                        }
                    ] as never
            },
            parentSessionId: "captain-session" as never,
            meetingId: "meeting-1",
            ownerships: [ownership],
            signal: new AbortController().signal
        });

        expect(result.observations).toEqual([
            expect.objectContaining({
                sessionId: "participant-session",
                meetingId: "meeting-1",
                provider: "spawn"
            })
        ]);
        expect(result.diagnostics).toEqual([
            { kind: "diagnostic", sessionId: "foreign-session", reason: "unowned-dsh-child" },
            { kind: "diagnostic", sessionId: "one-shot", reason: "not-continuable" }
        ]);
    });

    it("diagnoses wrong parent and missing DSH entries without returning them as operable", async () => {
        const ownership = participantOwnership();
        const result = await inspectOwnedSessions({
            runtime: {
                listDescendants: async () =>
                    [
                        {
                            kind: "child",
                            id: ownership.sessionId as never,
                            activity: "running",
                            mode: "continuable",
                            label: ownership.sessionLabel,
                            hasChildren: false,
                            parentId: "other-captain" as never,
                            depth: 2
                        }
                    ] as never
            },
            parentSessionId: "captain-session" as never,
            meetingId: "meeting-1",
            ownerships: [ownership, participantOwnership({ sessionId: "missing-session" })],
            signal: new AbortController().signal
        });

        expect(result.observations).toEqual([]);
        expect(result.diagnostics).toEqual([
            { kind: "diagnostic", sessionId: "participant-session", reason: "wrong-parent" },
            { kind: "diagnostic", sessionId: "missing-session", reason: "missing-dsh-entry" }
        ]);
    });
});
