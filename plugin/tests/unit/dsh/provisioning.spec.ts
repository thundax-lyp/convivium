import { describe, expect, it } from "vitest";

import {
    createSessionProvisioningEnvelope,
    serializeSessionProvisioningEnvelope
} from "../../../src/dsh/provisioning.js";

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

        expect(manager).toMatchObject({
            kind: "convivium.session.provisioning",
            version: 1,
            capability: "none",
            role: "manager"
        });
        expect(manager.participantId).toBeUndefined();
        expect(participant).toMatchObject({
            capability: "none",
            role: "participant",
            participantId: "participant-1"
        });
        expect(manager.instruction).toContain("no planning or speaker capability");
        expect(manager.instruction).toContain("attemptId and deliveryId");
        expect(serializeSessionProvisioningEnvelope(participant)).toBe(
            serializeSessionProvisioningEnvelope(participant)
        );
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
