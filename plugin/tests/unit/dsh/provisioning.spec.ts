import { describe, expect, it } from "vitest";

import {
    createMeetingIdentityProvisioningEnvelope,
    createSessionProvisioningEnvelope,
    serializeMeetingIdentityProvisioningEnvelope,
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
        expect(manager.instruction).toContain("no work capability");
        expect(manager.instruction).toContain("contribution planning notice with deliveryId");
        expect(manager.instruction).not.toContain("planningAttemptId");
        expect(participant.instruction).toContain(
            "contribution task with contributionId, generation and deliveryId"
        );
        expect(participant.instruction).toContain("no work capability");
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

describe("target meeting identity provisioning envelope", () => {
    it.each(["manager", "evidence_reviewer", "participant"] as const)(
        "round-trips the %s identity without legacy namespace fields",
        (role) => {
            const envelope = createMeetingIdentityProvisioningEnvelope({
                role,
                meetingId: "meeting-1",
                identityId: `${role}-1`
            });
            const serialized = serializeMeetingIdentityProvisioningEnvelope(envelope);
            expect(JSON.parse(serialized)).toEqual(envelope);
            expect(envelope).toMatchObject({
                role,
                meetingId: "meeting-1",
                identityId: `${role}-1`,
                capability: "none"
            });
            expect(envelope).not.toHaveProperty("teamId");
            expect(envelope).not.toHaveProperty("participantId");
        }
    );

    it("rejects ambiguous Meeting and identity segments", () => {
        expect(() =>
            createMeetingIdentityProvisioningEnvelope({
                role: "participant",
                meetingId: "meeting:1",
                identityId: "identity-1"
            })
        ).toThrow(TypeError);
        expect(() =>
            createMeetingIdentityProvisioningEnvelope({
                role: "participant",
                meetingId: "meeting-1",
                identityId: "identity/1"
            })
        ).toThrow(TypeError);
    });
});
