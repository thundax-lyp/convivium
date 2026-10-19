import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { endMeeting } from "@/domain/transitions/meeting-end.ts";

describe("meeting end", () => {
    it("ends a running meeting with a partial termination and archive effect", () => {
        const state = makeRunningMeetingStateV1();
        const ended = endMeeting(state, {
            terminationId: "termination-v1",
            outcome: "partial",
            reason: "未完成目标",
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            actorId: "local",
            now: 10
        });
        expect(ended.kind).toBe("accepted");
        if (ended.kind !== "accepted") {
            return;
        }
        expect(ended.state.lifecycle.status).toBe("terminal");
        expect(ended.effectRequests).toEqual([
            { kind: "materialize_archive", terminationId: "termination-v1" }
        ]);
        expect(state.lifecycle.status).toBe("running");
    });

    it("requires completion facts before a completed termination", () => {
        const state = makeRunningMeetingStateV1();
        expect(
            endMeeting(state, {
                terminationId: "termination-v1",
                outcome: "completed",
                reason: "完成",
                completionFactIds: [],
                unresolvedQuestionIds: [],
                unresolvedIssueIds: [],
                actorId: "local",
                now: 10
            })
        ).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
    });
});

it("does not treat an empty pending research plan as a completed objective", () => {
    const state = makeRunningMeetingStateV1();
    state.objective = {
        statement: "原问题",
        requiredOutputs: [],
        acceptanceCriteria: [],
        hardConstraints: [],
        acceptableRiskLevel: "low",
        researchPlanning: { status: "pending" }
    };
    state.agenda = state.agenda.map((a) => ({ ...a, requiredOutputIds: [] }));
    expect(
        endMeeting(state, {
            terminationId: "termination-planning",
            outcome: "completed",
            reason: "空数组不能表示完成",
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            actorId: "local",
            now: 10
        })
    ).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
});
