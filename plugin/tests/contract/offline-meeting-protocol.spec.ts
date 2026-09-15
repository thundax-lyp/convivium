import { describe, expect, it } from "vitest";
import { CreateMeetingInputSchema } from "@/protocol/index.js";
import { prepareMeetingCreation } from "@/runtime/meeting-runtime.js";
import { createOfflineMeetingInput } from "../fixtures/create-meeting-input.js";

describe("current offline meeting protocol", () => {
    it("requires a fixed evidence reviewer and creates contribution state without a Turn", () => {
        const input = createOfflineMeetingInput();
        expect(CreateMeetingInputSchema(structuredClone(input))).toEqual(input);
        expect(() =>
            CreateMeetingInputSchema({ ...input, evidenceReviewerKey: undefined })
        ).toThrow();

        const state = prepareMeetingCreation(
            input,
            "offline-meeting",
            {
                callerBinding: "session:offline-captain",
                capabilityId: "captain:offline-captain"
            },
            { now: 1700000000000 }
        ).state;
        expect(state.contributions).toMatchObject({
            reviewerId: "participant-b",
            tasks: {},
            managerNoticeSeq: 0
        });
        expect(state.currentTurn).toBeUndefined();
    });
});
