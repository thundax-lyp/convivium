import { describe, expect, it } from "vitest";
import { addSubmittedDecisionCandidates } from "../../../../src/domain/index.js";
import { now, questionState } from "./fixtures.js";

function stateWithProposal() {
    const state = questionState();
    state.transcript = [
        {
            id: "message-1",
            seq: 1,
            turnSeq: 1,
            turnId: "turn-1",
            stepId: "step-1",
            attemptId: "attempt-1",
            speaker: "participant-1",
            agendaItemId: "agenda-1",
            agendaRelation: "on_topic",
            content: "proposal",
            kind: "agent",
            mentions: [],
            taskIds: [],
            createdAt: now
        }
    ];
    state.proposals = [
        {
            id: "proposal-1",
            title: "Use SQLite",
            description: "Persist facts",
            proposedBy: "participant-1",
            revision: 1,
            status: "under_review",
            agendaItemId: "agenda-1",
            positions: [],
            createdAt: now,
            updatedAt: now
        }
    ];
    return state;
}

const candidate = (id: string, revision = 1) => ({
    id,
    proposalId: "proposal-1",
    proposalRevision: revision,
    statement: "Accept",
    rationale: "Supported",
    sourceMessageId: "message-1",
    agendaItemId: "agenda-1",
    createdAt: now
});

describe("addSubmittedDecisionCandidates", () => {
    it("binds candidate fields to the participant and source message", () => {
        const result = addSubmittedDecisionCandidates(
            stateWithProposal(),
            "participant-1",
            "agenda-1",
            "message-1",
            [candidate("candidate-1")]
        );
        expect(result.state.decisionCandidates).toEqual([
            { ...candidate("candidate-1"), proposedBy: "participant-1" }
        ]);
        expect(result.effect.events).toEqual([]);
    });

    it("preserves order and rejects a partially invalid array without mutation", () => {
        const state = stateWithProposal();
        const result = addSubmittedDecisionCandidates(
            state,
            "participant-1",
            "agenda-1",
            "message-1",
            [candidate("candidate-1"), candidate("candidate-2")]
        );
        expect(result.state.decisionCandidates.map(({ id }) => id)).toEqual([
            "candidate-1",
            "candidate-2"
        ]);
        expect(() =>
            addSubmittedDecisionCandidates(state, "participant-1", "agenda-1", "message-1", [
                candidate("candidate-3"),
                candidate("candidate-4", 2)
            ])
        ).toThrow();
        expect(state.decisionCandidates).toEqual([]);
    });

    it("requires a real participant speaker and rejects unknown or stale proposals and terminal meetings", () => {
        const state = stateWithProposal();
        expect(() =>
            addSubmittedDecisionCandidates(state, "unknown", "agenda-1", "message-1", [
                candidate("candidate-1")
            ])
        ).toThrow();
        expect(() =>
            addSubmittedDecisionCandidates(state, "participant-1", "agenda-1", "message-1", [
                candidate("candidate-1", 2)
            ])
        ).toThrow();
        expect(() =>
            addSubmittedDecisionCandidates(
                { ...state, status: "completed" },
                "participant-1",
                "agenda-1",
                "message-1",
                [candidate("candidate-1")]
            )
        ).toThrow();
    });
});
