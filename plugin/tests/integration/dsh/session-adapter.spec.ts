import { describe, expect, it } from "vitest";
import type { ContinuableStart, ContinuableStartSpec } from "@deepseek-ai/dsh-subagent";
import {
    followupParticipantSession,
    inspectOwnedSessions,
    interruptAndDrainOwnedSessions,
    requireContinuableProvider,
    startManagerSession,
    startParticipantSession
} from "../../../src/dsh/index.js";

const signal = new AbortController().signal;

function ownership(overrides: Record<string, unknown> = {}) {
    return {
        sessionId: "participant-a-session",
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
    };
}

describe("DSH session adapter composition", () => {
    it("provisions one manager and three participants with reserved ids and no capability", async () => {
        const starts: ContinuableStartSpec[] = [];
        const runtime = {
            startContinuable: async (spec: ContinuableStartSpec): Promise<ContinuableStart> => {
                starts.push(spec);
                return {
                    childId: spec.childId!,
                    messageId: `message-${starts.length}` as never
                };
            }
        };

        await startManagerSession({
            runtime,
            provider: "spawn",
            parent: { id: "captain-session" } as never,
            childId: "manager-session" as never,
            teamId: "team-1",
            meetingId: "meeting-1",
            signal
        });
        for (const participant of ["participant-a", "participant-b", "participant-c"]) {
            await startParticipantSession({
                runtime,
                provider: "spawn",
                parent: { id: "captain-session" } as never,
                childId: `${participant}-session` as never,
                teamId: "team-1",
                meetingId: "meeting-1",
                participantId: participant,
                signal
            });
        }

        expect(starts).toHaveLength(4);
        expect(starts.map((start) => start.childId)).toEqual([
            "manager-session",
            "participant-a-session",
            "participant-b-session",
            "participant-c-session"
        ]);
        expect(
            starts.every((start) => {
                const envelope = JSON.parse(
                    (start.request.prompt[0] as { type: "text"; text: string }).text
                );
                return (
                    envelope.kind === "convivium.session.provisioning" &&
                    envelope.capability === "none"
                );
            })
        ).toBe(true);
    });

    it("keeps followup, cleanup, and inspection bound to the exact Captain parent", async () => {
        const calls: unknown[][] = [];
        const participant = ownership();
        const messageId = await followupParticipantSession({
            runtime: {
                followup: async (...args) => {
                    calls.push(args);
                    return "accepted-message" as never;
                }
            },
            parent: { id: "captain-session" } as never,
            ownership: participant,
            attempt: {
                attemptId: "attempt-1",
                deliveryId: "delivery-1",
                participantId: "participant-a"
            },
            prompt: [{ type: "text", text: "speak" }],
            signal,
            authorize: async () => undefined
        });
        expect(messageId).toBe("accepted-message");
        expect(calls[0]?.[0]).toMatchObject({ id: "captain-session" });

        const interrupted: unknown[][] = [];
        await interruptAndDrainOwnedSessions({
            runtime: {
                interrupt: (...args) => interrupted.push(args),
                drainContinuableChildren: async (...args) => calls.push(args)
            },
            parent: { id: "captain-session" } as never,
            ownerships: [participant]
        });
        expect(interrupted).toEqual([
            ["participant-a-session", { kind: "ancestor", agent: { id: "captain-session" } }]
        ]);

        const inspection = await inspectOwnedSessions({
            runtime: {
                listDescendants: async () => [
                    {
                        kind: "child",
                        id: "participant-a-session" as never,
                        parentId: "captain-session" as never,
                        mode: "continuable",
                        activity: "inactive",
                        label: participant.sessionLabel
                    }
                ]
            },
            parentSessionId: "captain-session" as never,
            meetingId: "meeting-1",
            ownerships: [participant],
            signal
        });
        expect(inspection.observations).toHaveLength(1);
        expect(inspection.diagnostics).toEqual([]);
    });

    it("fails closed for unavailable providers, wrong parents, labels, and revoked ownership", async () => {
        expect(() => requireContinuableProvider({ getProvider: () => undefined }, "spawn")).toThrow(
            /not registered/
        );
        expect(() => requireContinuableProvider({ getProvider: () => ({}) }, "spawn")).toThrow(
            /prepareContinuable/
        );

        await expect(
            followupParticipantSession({
                runtime: { followup: async () => "must-not-run" as never },
                parent: { id: "other-captain" } as never,
                ownership: ownership({ capabilityStatus: "revoked" }),
                attempt: {
                    attemptId: "attempt-1",
                    deliveryId: "delivery-1",
                    participantId: "participant-a"
                },
                prompt: [],
                signal,
                authorize: async () => undefined
            })
        ).rejects.toThrow();

        const inspection = await inspectOwnedSessions({
            runtime: {
                listDescendants: async () => [
                    {
                        kind: "child",
                        id: "participant-a-session" as never,
                        parentId: "other-captain" as never,
                        mode: "continuable",
                        activity: "inactive",
                        label: "wrong-label"
                    }
                ]
            },
            parentSessionId: "captain-session" as never,
            meetingId: "meeting-1",
            ownerships: [ownership()],
            signal
        });
        expect(inspection.diagnostics.map((diagnostic) => diagnostic.reason)).toEqual([
            "wrong-parent",
            "missing-dsh-entry"
        ]);
    });
});
