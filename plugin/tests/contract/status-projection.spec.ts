import type { MeetingState } from "../../src/domain/model.js";
import { projectMeetingStatus } from "../../src/projection/index.js";
import { describe, expect, it } from "vitest";

const state = {
    id: "meeting-1",
    teamId: "team-1",
    status: "running",
    topic: "Release",
    objective: "Decide scope",
    objectiveContract: {},
    continuationMaterials: [],
    limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 8 },
    version: 2,
    agenda: [],
    transcript: [],
    decisions: [],
    issues: [],
    handRaises: [],
    currentTurn: undefined
} as unknown as MeetingState;

describe("meeting status projection", () => {
    it("maps only public canonical meeting facts", () => {
        const projected = projectMeetingStatus(state, {
            kind: "participant",
            sessionId: "session-1",
            participantId: "participant-1"
        });

        expect(projected).toMatchObject({
            meetingId: "meeting-1",
            meetingVersion: 2,
            status: "running",
            limits: { maxTurns: 3 }
        });
        expect(JSON.stringify(projected)).not.toContain("session-1");
        expect(JSON.stringify(projected)).not.toContain("capability");
        expect(JSON.stringify(projected)).not.toContain("prompt");
    });
});
