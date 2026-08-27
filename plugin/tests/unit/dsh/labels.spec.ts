import { describe, expect, it } from "vitest";

import { decodeMeetingSessionLabel, encodeMeetingSessionLabel } from "../../../src/dsh/labels.js";

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
