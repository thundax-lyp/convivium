import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { endMeeting } from "@/domain/transitions/meeting-end.js";

describe("meeting end", () => {
    it("ends a running meeting with a partial termination and archive effect", () => {
        const state = makeRunningMeetingStateV1();
        const ended = endMeeting(state, {
            terminationId: "termination-v1",
            outcome: "partial",
            reason: "未完成目标",
            decisionIds: [],
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            actorId: "local",
            now: 10
        });
        expect(ended.kind).toBe("accepted");
        if (ended.kind !== "accepted") return;
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
                decisionIds: [],
                completionFactIds: [],
                unresolvedQuestionIds: [],
                unresolvedIssueIds: [],
                actorId: "local",
                now: 10
            })
        ).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
    });
});
