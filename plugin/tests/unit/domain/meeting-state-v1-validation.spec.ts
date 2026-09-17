import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-v1-validation.js";

describe("canonical MeetingState validation", () => {
    it("accepts the target fixture", () => {
        const state = makeRunningMeetingStateV1();
        expect(validateMeetingStateV1(state)).toEqual({ kind: "valid", state });
    });
    it("requires exactly one evidence reviewer", () => {
        const state = makeRunningMeetingStateV1();
        expect(validateMeetingStateV1({ ...state, evidenceReviewerId: "missing" })).toMatchObject({
            kind: "invalid",
            path: "$.evidenceReviewerId"
        });
    });
    it("accepts the compatibility projection field", () => {
        const state = makeRunningMeetingStateV1();
        expect(validateMeetingStateV1({ ...state, formatApprovals: [] })).toMatchObject({
            kind: "valid"
        });
    });
    it("enforces round abort pair", () => {
        const state = makeRunningMeetingStateV1();
        const round = {
            id: "round-1",
            agendaId: "agenda-v1",
            publicBaselinePublicationIds: [],
            openedAt: 0,
            status: "aborted" as const,
            contributionIds: [],
            abortReason: "x",
            abortedAt: 1
        };
        expect(validateMeetingStateV1({ ...state, rounds: [round] })).toMatchObject({
            kind: "valid"
        });
        expect(
            validateMeetingStateV1({ ...state, rounds: [{ ...round, abortedAt: undefined }] })
        ).toMatchObject({ kind: "invalid" });
    });
});
