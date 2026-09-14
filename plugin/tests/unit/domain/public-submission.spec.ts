import { describe, expect, it } from "vitest";
import { applyPublicSubmission, type PublicSubmissionContext } from "@/domain/index.js";
import { questionState, now } from "./transitions/fixtures.js";

function submission(): PublicSubmissionContext {
    return {
        agendaItemId: "agenda-1",
        now,
        message: {
            id: "public-message",
            kind: "statement",
            content: "Result",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            createdAt: now
        },
        claims: {
            questions: [
                { id: "public-question", text: "What remains?", blocking: false, createdAt: now }
            ],
            issues: [],
            proposals: [],
            positions: [],
            agendaCandidates: [],
            decisionCandidates: []
        },
        authorizedTaskIds: [],
        completionFactId: (kind, index) => `stable-${kind}-${index}`
    };
}

describe("public submission claims", () => {
    it("applies the formal claims structure without advancing or creating a Turn", () => {
        const state = questionState();
        const result = applyPublicSubmission(state, "participant-1", submission());
        expect(result.state.openQuestions).toContainEqual(
            expect.objectContaining({ id: "public-question" })
        );
        expect(result.effect.events.map(({ type }) => type)).toEqual(["question.added"]);
        expect(result.state.currentTurn).toBeUndefined();
        expect(result.state.transcript).toEqual(state.transcript);
        expect(result.state.version).toBe(state.version);
    });

    it("preserves completion fact IDs and rejects unauthorized task evidence atomically", () => {
        const state = questionState();
        state.objectiveContract.requiredOutputs = [
            { id: "output", description: "Result", status: "pending" }
        ];
        const context = submission();
        context.claims.completion = {
            outputClaims: [
                { subjectId: "output", evidenceMessageIds: [], taskIds: ["task-evidence"] }
            ]
        };
        const before = structuredClone(state);
        expect(() => applyPublicSubmission(state, "participant-1", context)).toThrow(
            "unauthorized task evidence"
        );
        expect(state).toEqual(before);
        context.authorizedTaskIds = ["task-evidence"];
        const result = applyPublicSubmission(state, "participant-1", context);
        expect(result.state.completionFacts).toContainEqual(
            expect.objectContaining({
                id: "stable-output_evidence-0",
                kind: "output_evidence",
                taskIds: ["task-evidence"]
            })
        );
        expect(result.effect.events.map(({ type }) => type)).toEqual([
            "question.added",
            "completion_fact.added"
        ]);
        expect(state).toEqual(before);
    });
});
