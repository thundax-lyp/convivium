import { describe, expect, it } from "vitest";
import { z } from "zod";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state-v1.js";
import {
    MeetingCommandV1Schema,
    decodeMeetingStateV1,
    encodeMeetingStateV1
} from "@/protocol/meeting-command-v1.js";
import { projectMeetingViewV1 } from "@/projection/meeting-view-v1.js";

describe("target Meeting command core", () => {
    it("round-trips a complete target state without loss", () => {
        const state = makeRunningMeetingStateV1();
        expect(decodeMeetingStateV1(encodeMeetingStateV1(state))).toEqual(state);
    });

    it("rejects a state with a missing required field", () => {
        const state = makeRunningMeetingStateV1();
        const missing = { ...state } as Record<string, unknown>;
        delete missing.identities;
        expect(() => decodeMeetingStateV1(encodeMeetingStateV1(missing))).toThrow(
            "INCOMPATIBLE_VERSION"
        );
    });

    it("rejects unknown command kinds and invalid envelopes", () => {
        expect(MeetingCommandV1Schema.safeParse({ kind: "unknown" }).success).toBe(false);
    });

    it("projects only a committed snapshot", () => {
        const state = makeRunningMeetingStateV1();
        const result = projectMeetingViewV1({
            teamId: "team-v1",
            meetingId: state.id,
            version: state.version,
            state,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt
        });
        expect(result).toEqual({ meetingId: state.id, meetingVersion: state.version, state });
        expect(result.state).not.toBe(state);
    });
});
