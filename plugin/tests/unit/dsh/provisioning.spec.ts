import { describe, expect, it } from "vitest";

import {
    createSessionProvisioningEnvelope,
    serializeSessionProvisioningEnvelope
} from "@/dsh/provisioning.js";

describe("session provisioning envelope", () => {
    it("creates deterministic capability-free manager and participant prompts", () => {
        const manager = createSessionProvisioningEnvelope({
            teamId: "team-1",
            meetingId: "meeting-1",
            role: "manager"
        });
        const participant = createSessionProvisioningEnvelope({
            teamId: "team-1",
            meetingId: "meeting-1",
            role: "participant",
            participantId: "participant-1"
        });

        expect(JSON.parse(serializeSessionProvisioningEnvelope(manager))).toMatchObject({
            kind: "convivium.session.provisioning",
            version: 1,
            teamId: "team-1",
            meetingId: "meeting-1",
            capability: "none",
            role: "manager"
        });
        expect(manager.participantId).toBeUndefined();
        expect(JSON.parse(serializeSessionProvisioningEnvelope(participant))).toMatchObject({
            teamId: "team-1",
            meetingId: "meeting-1",
            capability: "none",
            role: "participant",
            participantId: "participant-1"
        });
        expect(manager.instruction).toContain("no planning capability");
        expect(manager.instruction).toContain("planningAttemptId and deliveryId");
        expect(manager.instruction).not.toContain("includes attemptId and deliveryId");
        expect(participant.instruction).toContain("attemptId and deliveryId");
        expect(participant.instruction).toContain("no speaker capability");
    });

    it("rejects identity shapes that could grant the wrong role", () => {
        expect(() =>
            createSessionProvisioningEnvelope({
                teamId: "team-1",
                meetingId: "meeting-1",
                role: "manager",
                participantId: "participant-1"
            })
        ).toThrow(TypeError);
        expect(() =>
            createSessionProvisioningEnvelope({
                teamId: "team-1",
                meetingId: "meeting-1",
                role: "participant"
            })
        ).toThrow(TypeError);
    });
});
