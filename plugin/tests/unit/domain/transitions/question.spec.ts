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

    it("rejects blocking questions", () => {
        expect(() =>
            addSubmittedQuestions(questionState(), "participant-1", "agenda-1", [
                { id: "question-1", text: "Question", blocking: true, createdAt: now }
            ])
        ).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CAPABILITY" }));
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
});
