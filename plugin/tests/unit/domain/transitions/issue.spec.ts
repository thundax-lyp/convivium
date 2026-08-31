import { describe, expect, it } from "vitest";
import { addSubmittedIssues } from "../../../../src/domain/index.js";
import { questionState } from "./fixtures.js";

const issue = {
    id: "issue-1",
    title: "Output is incomplete",
    description: "The required output lacks evidence.",
    affectedOutputIds: ["output-1"],
    affectedCriterionIds: [],
    violatedConstraintIds: [],
    impact: "high",
    urgency: "now" as const,
    safeDefaultAvailable: false
};

describe("addSubmittedIssues", () => {
    it("creates a blocking issue linked to the submitted message", () => {
        const state = questionState();
        state.transcript = [{ id: "message-1" } as (typeof state.transcript)[number]];
        state.objectiveContract.requiredOutputs = [
            { id: "output-1", description: "Output", status: "pending" }
        ];
        const result = addSubmittedIssues(state, "participant-1", "agenda-1", [issue]);
        expect(result.state.issues[0]).toMatchObject({
            id: "issue-1",
            sourceMessageId: "message-1",
            blocking: true,
            disposition: "blocking",
            status: "open"
        });
        expect(result.effect.events[0]?.type).toBe("issue.added");
    });

    it("creates a non-blocking follow-up when no protected subject is cited", () => {
        const state = questionState();
        state.transcript = [{ id: "message-1" } as (typeof state.transcript)[number]];
        const result = addSubmittedIssues(state, "participant-1", "agenda-1", [
            { ...issue, affectedOutputIds: [] }
        ]);
        expect(result.state.issues[0]).toMatchObject({ blocking: false, disposition: "follow_up" });
    });

    it("rejects unknown blocking evidence without mutation", () => {
        const state = questionState();
        state.transcript = [{ id: "message-1" } as (typeof state.transcript)[number]];
        expect(() => addSubmittedIssues(state, "participant-1", "agenda-1", [issue])).toThrow();
        expect(state.issues).toEqual([]);
    });
});
