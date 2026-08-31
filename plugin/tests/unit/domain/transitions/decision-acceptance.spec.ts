import { describe, expect, it } from "vitest";
import { acceptDecisionCandidate } from "../../../../src/domain/index.js";
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
            content: "source",
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
            id: "candidate-1",
            proposalId: "proposal-1",
            proposalRevision: 1,
            statement: "Accept",
            rationale: "Supported",
            proposedBy: "participant-1",
            sourceMessageId: "message-1",
            agendaItemId: "agenda-1",
            createdAt: now
        }
    ];
    return state;
}
const context = {
    meetingId: "meeting-1",
    decisionCandidateId: "candidate-1",
    actorBinding: "captain:session-1",
    reason: "Approved",
    evidenceMessageIds: ["message-1"],
    now
};

describe("acceptDecisionCandidate", () => {
    it("creates accepted decision, fact and event atomically", () => {
        const result = acceptDecisionCandidate(ready(), context);
        expect(result.state.decisions[0]).toMatchObject({
            id: "decision-candidate-1",
            status: "accepted",
            acceptedBy: ["participant-1"],
            acceptanceMode: "captain_acceptance",
            acceptanceFactIds: ["completion-candidate-1-acceptance"],
            createdAt: now
        });
        expect(result.state.eventSeq).toBe(ready().eventSeq + 1);
        expect(result.state.completionFacts[0]).toMatchObject({
            id: "completion-candidate-1-acceptance",
            authority: "captain",
            result: "accepted",
            taskIds: []
        });
        expect(result.effect.events).toEqual([
            {
                type: "decision.accepted",
                payload: {
                    candidateId: "candidate-1",
                    decisionId: "decision-candidate-1",
                    proposalId: "proposal-1",
                    proposalRevision: 1,
                    actorBinding: "captain:session-1"
                }
            }
        ]);
    });
    it("rejects missing support, blocking dissent, invalid evidence and terminal state without mutation", () => {
        for (const changed of [
            { proposals: [{ ...ready().proposals[0]!, positions: [] }] },
            {
                proposals: [
                    {
                        ...ready().proposals[0]!,
                        positions: [
                            {
                                ...ready().proposals[0]!.positions[0]!,
                                position: "object" as const,
                                blocking: true
                            }
                        ]
                    }
                ]
            },
            { evidenceMessageIds: ["missing"] },
            { status: "archived" as const }
        ]) {
            const state = ready();
            Object.assign(state, changed);
            expect(() => acceptDecisionCandidate(state, { ...context, ...changed })).toThrow();
            expect(state.decisions).toEqual([]);
            expect(state.completionFacts).toEqual([]);
        }
    });
});
