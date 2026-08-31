import { describe, expect, it } from "vitest";
import { addSubmittedQuestions } from "../../../../src/domain/index.js";
import { now, questionState } from "./fixtures.js";

describe("addSubmittedQuestions", () => {
    it("creates one canonical non-blocking question", () => {
        const state = questionState();
        const result = addSubmittedQuestions(state, "participant-1", "agenda-1", [
            { id: "question-1", text: "  What is the deadline? ", blocking: false, createdAt: now }
        ]);

        expect(result.state.openQuestions).toEqual([
            {
                id: "question-1",
                text: "What is the deadline?",
                askedBy: "participant-1",
                agendaItemId: "agenda-1",
                blocking: false,
                affectedOutputIds: [],
                affectedCriterionIds: [],
                violatedConstraintIds: [],
                status: "open",
                createdAt: now
            }
        ]);
        expect(result.effect.events).toHaveLength(1);
        expect(result.effect.events[0]?.type).toBe("question.added");
    });

    it("preserves input order for multiple questions and events", () => {
        const result = addSubmittedQuestions(questionState(), "participant-1", "agenda-1", [
            { id: "question-1", text: "First", blocking: false, createdAt: now },
            {
                id: "question-2",
                text: "Second",
                directedTo: "participant-2",
                blocking: false,
                createdAt: now
            }
        ]);

        expect(result.state.openQuestions.map(({ id }) => id)).toEqual([
            "question-1",
            "question-2"
        ]);
        expect(result.effect.events.map(({ type }) => type)).toEqual([
            "question.added",
            "question.added"
        ]);
    });

    it.each([
        [
            "unknown directedTo",
            {
                id: "question-1",
                text: "Question",
                directedTo: "unknown",
                blocking: false,
                createdAt: now
            }
        ],
        ["empty text", { id: "question-1", text: "   ", blocking: false, createdAt: now }],
        ["duplicate id", { id: "question-1", text: "Question", blocking: false, createdAt: now }]
    ] as const)("rejects %s", (_name, question) => {
        const state = questionState();
        if (_name === "duplicate id")
            state.openQuestions = [
                { ...question, askedBy: "participant-1", agendaItemId: "agenda-1", status: "open" }
            ];
        expect(() =>
            addSubmittedQuestions(state, "participant-1", "agenda-1", [question])
        ).toThrow();
    });

    it.each([
        ["unaccepted output", { affectedOutputIds: ["output-1"] }],
        ["unsatisfied criterion", { affectedCriterionIds: ["criterion-1"] }],
        ["hard constraint", { violatedConstraintIds: ["constraint-1"] }]
    ])("creates a blocking question for %s evidence", (_name, evidence) => {
        const state = questionState();
        state.objectiveContract.requiredOutputs = [
            { id: "output-1", description: "Output", status: "ready" }
        ];
        state.objectiveContract.acceptanceCriteria = [
            { id: "criterion-1", description: "Criterion", satisfied: false }
        ];
        state.objectiveContract.hardConstraints = [
            { id: "constraint-1", description: "Constraint" }
        ];

        const result = addSubmittedQuestions(state, "participant-1", "agenda-1", [
            { id: "question-1", text: "Question", blocking: true, createdAt: now, ...evidence }
        ]);

        expect(result.state.openQuestions[0]).toMatchObject({
            blocking: true,
            affectedOutputIds: evidence.affectedOutputIds ?? [],
            affectedCriterionIds: evidence.affectedCriterionIds ?? [],
            violatedConstraintIds: evidence.violatedConstraintIds ?? []
        });
    });

    it.each([
        ["empty", {}],
        ["unknown", { affectedOutputIds: ["unknown"] }],
        ["accepted output only", { affectedOutputIds: ["output-1"] }],
        ["satisfied criterion only", { affectedCriterionIds: ["criterion-1"] }]
    ])("rejects blocking question with %s evidence", (_name, evidence) => {
        const state = questionState();
        state.objectiveContract.requiredOutputs = [
            { id: "output-1", description: "Output", status: "accepted" }
        ];
        state.objectiveContract.acceptanceCriteria = [
            { id: "criterion-1", description: "Criterion", satisfied: true }
        ];

        expect(() =>
            addSubmittedQuestions(state, "participant-1", "agenda-1", [
                { id: "question-1", text: "Question", blocking: true, createdAt: now, ...evidence }
            ])
        ).toThrowError(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
        expect(state.openQuestions).toEqual([]);
    });

    it("validates all questions before writing any", () => {
        const state = questionState();
        expect(() =>
            addSubmittedQuestions(state, "participant-1", "agenda-1", [
                { id: "question-1", text: "Valid", blocking: false, createdAt: now },
                { id: "question-2", text: "   ", blocking: false, createdAt: now }
            ])
        ).toThrow();
        expect(state.openQuestions).toEqual([]);
    });

    it("atomically rejects a mixed batch with invalid evidence", () => {
        const state = questionState();
        state.objectiveContract.requiredOutputs = [
            { id: "output-1", description: "Output", status: "pending" }
        ];
        expect(() =>
            addSubmittedQuestions(state, "participant-1", "agenda-1", [
                {
                    id: "question-1",
                    text: "Valid",
                    blocking: true,
                    affectedOutputIds: ["output-1"],
                    createdAt: now
                },
                {
                    id: "question-2",
                    text: "Invalid",
                    blocking: false,
                    affectedCriterionIds: ["unknown"],
                    createdAt: now
                }
            ])
        ).toThrowError(expect.objectContaining({ code: "INVALID_ARGUMENT" }));
        expect(state.openQuestions).toEqual([]);
    });
});
