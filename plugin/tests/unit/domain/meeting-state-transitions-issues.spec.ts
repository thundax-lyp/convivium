import { describe, expect, it } from "vitest";
import { transitionMeetingStateV1 } from "@/domain/meeting-state-transitions.js";
import { state, captain, terminalState } from "./meeting-state-transitions-fixtures.js";

describe("dispose_issue completion boundary", () => {
    it.each(["paused", "preparing", "converging", "ending"] as const)("rejects in %s", (status) => {
        const current = state(status);
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_issue",
                issueId: "issue-1",
                status: "resolved",
                rationale: "done",
                evidenceIds: ["version-1"]
            },
            captain,
            4,
            "fact-1"
        );
        expect(result).toMatchObject({
            kind: "rejected",
            state: current,
            code: "INVALID_STATE",
            facts: []
        });
        expect(result.state).toBe(current);
    });
    it.each(["terminal", "archiving", "archived"] as const)("rejects terminal %s", (status) => {
        const current = terminalState(status);
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_issue",
                issueId: "issue-1",
                status: "resolved",
                rationale: "done",
                evidenceIds: ["version-1"]
            },
            captain,
            4,
            "fact-1"
        );
        expect(result).toMatchObject({
            kind: "rejected",
            state: current,
            code: "MEETING_TERMINAL",
            facts: []
        });
        expect(result.state).toBe(current);
    });
});
