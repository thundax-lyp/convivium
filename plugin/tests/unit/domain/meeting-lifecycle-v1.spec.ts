import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { createMeetingV1 } from "@/domain/transitions/meeting-create-v1.js";
import { endMeetingV1 } from "@/domain/transitions/meeting-end-v1.js";

describe("meeting lifecycle", () => {
    it("creates an isolated target aggregate", () => {
        const state = makeRunningMeetingStateV1();
        expect(createMeetingV1(state)).toEqual(state);
        expect(createMeetingV1(state)).not.toBe(state);
    });
    it("ends a running meeting without mutating the source", () => {
        const state = makeRunningMeetingStateV1();
        const ended = endMeetingV1(state, 10, "manager-v1");
        expect(ended.lifecycle.status).toBe("terminal");
        expect(state.lifecycle.status).toBe("running");
    });
});
