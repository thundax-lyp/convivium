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
    currentTurn: undefined,
    manager: {
        status: "planning",
        currentPlanningAttempt: {
            id: "planning-1",
            deliveryId: "delivery-1"
        }
    },
    outbox: { leaseToken: "secret" }
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
        expect(projected).not.toHaveProperty("currentTurn");
        expect(projected).not.toHaveProperty("currentSpeakerId");
        expect(JSON.stringify(projected)).not.toContain("planning-1");
        expect(JSON.stringify(projected)).not.toContain("leaseToken");
    });

    it("keeps pause available while an active meeting is waiting", () => {
        const projected = projectMeetingStatus({ ...state, status: "waiting" } as MeetingState, {
            kind: "captain",
            sessionId: "captain-1"
        });

        expect(projected).toMatchObject({
            status: "waiting",
            pauseControl: { action: "pause" }
        });
    });
});
