import { describe, expect, it } from "vitest";

import {
    decodeMeetingIdentitySessionLabelV1,
    decodeMeetingSessionLabel,
    encodeMeetingIdentitySessionLabelV1,
    encodeMeetingSessionLabel
} from "@/dsh/labels.js";

describe("meeting session labels", () => {
    it("round-trips strict manager and participant identities", () => {
        const manager = { role: "manager" as const, teamId: "team_1", meetingId: "meeting-1" };
        const participant = {
            role: "participant" as const,
            teamId: "team_1",
            meetingId: "meeting-1",
            participantId: "participant.1"
        };

        expect(decodeMeetingSessionLabel(encodeMeetingSessionLabel(manager))).toEqual(manager);
        expect(decodeMeetingSessionLabel(encodeMeetingSessionLabel(participant))).toEqual(
            participant
        );
    });

    it("rejects prefixes, arity and identity segments that could be ambiguous", () => {
        expect(
            decodeMeetingSessionLabel("convivium:meeting-manager:team:meeting:extra")
        ).toBeUndefined();
        expect(decodeMeetingSessionLabel("other:meeting-manager:team:meeting")).toBeUndefined();
        expect(
            decodeMeetingSessionLabel("convivium:meeting-manager:team:meeting/other")
        ).toBeUndefined();
        expect(
            decodeMeetingSessionLabel("convivium:meeting-participant:team:meeting:")
        ).toBeUndefined();
        expect(() =>
            encodeMeetingSessionLabel({
                role: "manager",
                teamId: "team:other",
                meetingId: "meeting"
            })
        ).toThrow(TypeError);
    });
});

describe("target meeting identity session labels", () => {
    it.each(["manager", "evidence_reviewer", "participant"] as const)(
        "round-trips the %s identity without legacy namespace fields",
        (role) => {
            const value = { role, meetingId: "meeting-1", identityId: `${role}-1` };
            const encoded = encodeMeetingIdentitySessionLabelV1(value);
            expect(encoded).toBe(`convivium:meeting-identity:${role}:meeting-1:${role}-1`);
            expect(decodeMeetingIdentitySessionLabelV1(encoded)).toEqual(value);
            expect(decodedKeys(encoded)).toEqual(["identityId", "meetingId", "role"]);
        }
    );

    it("fails closed for arity, role and ambiguous identity segments", () => {
        expect(
            decodeMeetingIdentitySessionLabelV1(
                "convivium:meeting-identity:manager:meeting-1:identity-1:extra"
            )
        ).toBeUndefined();
        expect(
            decodeMeetingIdentitySessionLabelV1(
                "convivium:meeting-identity:scribe:meeting-1:identity-1"
            )
        ).toBeUndefined();
        expect(
            decodeMeetingIdentitySessionLabelV1(
                "convivium:meeting-identity:participant:meeting/1:identity-1"
            )
        ).toBeUndefined();
        expect(
            decodeMeetingIdentitySessionLabelV1(
                "convivium:meeting-identity:participant:meeting-1:identity:1"
            )
        ).toBeUndefined();
    });

    it("does not confuse labels from another Meeting or identity", () => {
        const decoded = decodeMeetingIdentitySessionLabelV1(
            encodeMeetingIdentitySessionLabelV1({
                role: "participant",
                meetingId: "meeting-2",
                identityId: "identity-2"
            })
        );
        expect(decoded).not.toMatchObject({ meetingId: "meeting-1" });
        expect(decoded).not.toMatchObject({ identityId: "identity-1" });
    });
});

function decodedKeys(label: string): string[] {
    return Object.keys(decodeMeetingIdentitySessionLabelV1(label) ?? {}).sort();
}
