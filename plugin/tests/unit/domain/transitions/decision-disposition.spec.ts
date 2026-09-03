import { describe, expect, it } from "vitest";
import { disposeDecision } from "../../../../src/domain/index.js";
import { now, questionState } from "./fixtures.js";

function ready() {
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
            content: "evidence",
            kind: "agent",
            mentions: [],
            taskIds: [],
            createdAt: now
        }
    ];
    state.decisions = [
        {
            id: "decision-1",
            proposalId: "proposal-1",
            proposalRevision: 1,
            status: "accepted",
            agendaItemId: "agenda-1",
            statement: "Accept",
            rationale: "Supported",
            acceptanceMode: "captain_acceptance",
            acceptanceFactIds: ["completion-candidate-1-acceptance"],
            createdAt: now
        }
    ];
    state.proposals = [
        {
            id: "proposal-1",
            title: "Use SQLite",
            description: "Persist",
            proposedBy: "participant-1",
            revision: 1,
            status: "under_review",
            agendaItemId: "agenda-1",
            positions: [
                {
                    id: "position-1",
                    participantId: "participant-1",
                    position: "accept",
                    blocking: false,
                    proposalRevision: 1
                }
            ],
            createdAt: now,
            updatedAt: now
        }
    ];
    state.decisionCandidates = [
        {
            id: "candidate-2",
            proposalId: "proposal-1",
            proposalRevision: 1,
            statement: "Accept revised",
            rationale: "Still supported",
            proposedBy: "participant-1",
            sourceMessageId: "message-1",
            agendaItemId: "agenda-1",
            createdAt: now
        }
    ];
    return state;
}

const base = {
    meetingId: "meeting-1",
    requestId: "request-1",
    decisionId: "decision-1",
    actorBinding: "captain:session-1",
    reason: "Changed decision",
    evidenceMessageIds: ["message-1"] as const,
    now
};

describe("disposeDecision", () => {
    it("supersedes with accepted replacement and ordered events", () => {
        const result = disposeDecision(ready(), {
            ...base,
            action: "supersede",
            replacementCandidateId: "candidate-2"
        });
        expect(result.state.decisions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "decision-1",
                    status: "superseded",
                    supersededByDecisionId: "decision-candidate-2"
                }),
                expect.objectContaining({ id: "decision-candidate-2", status: "accepted" })
            ])
        );
        expect(result.state.completionFacts.at(-1)).toMatchObject({
            id: "completion-request-1-decision-supersession",
            kind: "decision_supersession",
            result: "superseded"
        });
        expect(result.state.eventSeq).toBe(2);
        expect(result.effect.events.map(({ type }) => type)).toEqual([
            "decision.accepted",
            "decision.superseded"
        ]);
    });

    it("revokes with the revocation fact and rejects blank requestId", () => {
        const result = disposeDecision(ready(), { ...base, action: "revoke" });
        expect(result.state.decisions[0]).toMatchObject({ status: "revoked" });
        expect(result.state.completionFacts.at(-1)).toMatchObject({
            id: "completion-request-1-decision-revocation",
            kind: "decision_revocation",
            result: "revoked"
        });
        expect(result.state.eventSeq).toBe(1);
        const state = ready();
        expect(() =>
            disposeDecision(state, { ...base, requestId: "  ", action: "revoke" })
        ).toThrow("requestId must not be empty");
        expect(state.decisions[0]?.status).toBe("accepted");
        expect(state.completionFacts).toEqual([]);
    });
});
