import { describe, expect, it } from "vitest";
import { startManagerSession, startParticipantSession } from "../../../src/dsh/session-adapter.js";

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
