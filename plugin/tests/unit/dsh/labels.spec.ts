import { describe, expect, it } from "vitest";

import {
    decodeMeetingIdentitySessionLabel,
    encodeMeetingIdentitySessionLabel
} from "@/dsh/labels.js";

describe("target meeting identity session labels", () => {
    it.each(["manager", "evidence_reviewer", "participant"] as const)(
        "round-trips the %s identity without legacy namespace fields",
        (role) => {
            const value = { role, meetingId: "meeting-1", identityId: `${role}-1` };
            const encoded = encodeMeetingIdentitySessionLabel(value);
            expect(encoded).toBe(`convivium:meeting-identity:${role}:meeting-1:${role}-1`);
            expect(decodeMeetingIdentitySessionLabel(encoded)).toEqual(value);
            expect(decodedKeys(encoded)).toEqual(["identityId", "meetingId", "role"]);
        }
    );

    it("fails closed for arity, role and ambiguous identity segments", () => {
        expect(
            decodeMeetingIdentitySessionLabel(
                "convivium:meeting-identity:manager:meeting-1:identity-1:extra"
            )
        ).toBeUndefined();
        expect(
            decodeMeetingIdentitySessionLabel(
                "convivium:meeting-identity:scribe:meeting-1:identity-1"
            )
        ).toBeUndefined();
        expect(
            decodeMeetingIdentitySessionLabel(
                "convivium:meeting-identity:participant:meeting/1:identity-1"
            )
        ).toBeUndefined();
        expect(
            decodeMeetingIdentitySessionLabel(
                "convivium:meeting-identity:participant:meeting-1:identity:1"
            )
        ).toBeUndefined();
    });
});

function decodedKeys(label: string): string[] {
    return Object.keys(decodeMeetingIdentitySessionLabel(label) ?? {}).sort();
}
