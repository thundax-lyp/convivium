import { describe, expect, it } from "vitest";
import {
    projectAttendanceRejections,
    rejectAttendanceRecommendation
} from "../../../../src/domain/index.js";
import { meeting } from "./fixtures.js";

function pending() {
    const state = meeting("running");
    state.attendanceRecommendations = [
        {
            id: "recommendation-1",
            candidateId: "candidate-1",
            roleDefinitionId: "domain_architect",
            roleDefinitionVersion: "1",
            displayName: "Architect",
            agentDefinitionId: "private-definition",
            agendaItemId: "agenda-1",
            rationale: "Review",
            expectedContribution: "Review scope",
            evidenceGapIds: [],
            urgency: "current_agenda",
            recommendedByManagerSessionId: "manager-session",
            catalogId: "catalog-1",
            catalogVersion: "1",
            planningAttemptId: "planning-1",
            status: "pending",
            createdAt: 1
        }
    ];
    return state;
}
const input = {
    meetingId: "meeting-1",
    requestId: "reject-1",
    recommendationId: "recommendation-1",
    actorBinding: "captain:captain-1",
    reason: " Not needed ",
    now: 100
};

describe("Captain attendance rejection transition", () => {
    it("changes only the selected recommendation and eventSeq, without mutating frozen input", () => {
        const state = pending();
        const before = structuredClone(state);
        Object.freeze(state.attendanceRecommendations[0]);
        Object.freeze(state.attendanceRecommendations);
        Object.freeze(state);
        const result = rejectAttendanceRecommendation(state, Object.freeze(input));
        expect(state).toEqual(before);
        expect(result.state).toEqual({
            ...before,
            eventSeq: before.eventSeq + 1,
            attendanceRecommendations: [
                {
                    ...before.attendanceRecommendations[0],
                    status: "rejected",
                    rejection: {
                        requestId: "reject-1",
                        actorBinding: "captain:captain-1",
                        reason: "Not needed",
                        rejectedAt: 100
                    }
                }
            ]
        });
        expect(result.effect.events).toEqual([
            {
                type: "attendance_recommendation.rejected",
                payload: {
                    recommendationId: "recommendation-1",
                    requestId: "reject-1",
                    actorBinding: "captain:captain-1",
                    reason: "Not needed",
                    rejectedAt: 100
                }
            }
        ]);
        expect(projectAttendanceRejections(result.state)).toEqual([
            {
                recommendationId: "recommendation-1",
                candidateId: "candidate-1",
                roleDefinitionId: "domain_architect",
                displayName: "Architect",
                agendaItemId: "agenda-1",
                reason: "Not needed",
                rejectedAt: 100
            }
        ]);
        expect(projectAttendanceRejections(before)).toEqual([]);
    });
    it.each([
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed",
        "archiving",
        "archived"
    ] as const)("rejects immutable %s", (status) => {
        const state = { ...pending(), status };
        expect(() => rejectAttendanceRecommendation(state, input)).toThrow(
            expect.objectContaining({
                code: status === "archived" ? "ARCHIVED_MEETING" : "IMMUTABLE_MEETING"
            })
        );
    });
    it.each([
        { meetingId: "other" },
        { requestId: " " },
        { recommendationId: "missing" },
        { reason: " " },
        { actorBinding: "manager:x" },
        { actorBinding: "captain: " },
        { now: -1 },
        { now: Infinity },
        { now: NaN }
    ])("rejects invalid input %j without mutation", (change) => {
        const state = pending(),
            before = structuredClone(state);
        expect(() => rejectAttendanceRecommendation(state, { ...input, ...change })).toThrow(
            expect.objectContaining({ code: "INVALID_ARGUMENT" })
        );
        expect(state).toEqual(before);
    });
    it("rejects legacy and already disposed state", () => {
        const legacy = pending();
        Reflect.deleteProperty(legacy, "formatVersion");
        expect(() => rejectAttendanceRecommendation(legacy, input)).toThrow(
            expect.objectContaining({ code: "INVALID_ARGUMENT" })
        );
        const rejected = rejectAttendanceRecommendation(pending(), input).state;
        expect(() =>
            rejectAttendanceRecommendation(rejected, { ...input, requestId: "reject-2" })
        ).toThrow(expect.objectContaining({ code: "ATTENDANCE_RECOMMENDATION_NOT_PENDING" }));
    });
    it("keeps other recommendations and orders the archive projection deterministically", () => {
        const state = pending();
        state.attendanceRecommendations.push({
            ...state.attendanceRecommendations[0]!,
            id: "recommendation-0"
        });
        const first = rejectAttendanceRecommendation(state, input).state;
        expect(first.attendanceRecommendations[1]).toEqual(state.attendanceRecommendations[1]);
        const both = rejectAttendanceRecommendation(first, {
            ...input,
            recommendationId: "recommendation-0",
            requestId: "reject-0"
        }).state;
        expect(projectAttendanceRejections(both).map((value) => value.recommendationId)).toEqual([
            "recommendation-0",
            "recommendation-1"
        ]);
    });
});
