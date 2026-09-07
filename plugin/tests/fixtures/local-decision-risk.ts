import type { MeetingState } from "../../src/domain/model.js";
import { now, questionState } from "../unit/domain/transitions/fixtures.js";

export function createLocalDecisionRiskState(): MeetingState {
    const state = questionState();
    state.version = 0;
    state.eventSeq = 0;
    state.messageSeq = 1;
    state.createdAt = now;
    state.updatedAt = now;
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
            content: "Local control evidence",
            kind: "statement",
            mentions: [],
            taskIds: [],
            createdAt: now
        }
    ];
    state.proposals = [
        {
            id: "proposal-1",
            title: "Scope",
            description: "Bounded scope",
            proposedBy: "participant-1",
            revision: 1,
            status: "under_review",
            agendaItemId: "agenda-1",
            createdAt: now,
            updatedAt: now,
            positions: [
                {
                    id: "position-1",
                    participantId: "participant-1",
                    position: "accept",
                    blocking: false,
                    proposalRevision: 1
                }
            ]
        }
    ];
    state.decisionCandidates = ["Scope A", "Scope B"].map((statement, index) => ({
        id: `candidate-${index + 1}`,
        proposalId: "proposal-1",
        proposalRevision: 1,
        proposedBy: "participant-1",
        sourceMessageId: "message-1",
        agendaItemId: "agenda-1",
        createdAt: now,
        statement,
        rationale: "Supported scope"
    }));
    state.issues = [
        {
            id: "risk-1",
            title: "Bounded risk",
            description: "A reversible risk",
            sourceMessageId: "message-1",
            agendaItemId: "agenda-1",
            affectedOutputIds: [],
            affectedCriterionIds: [],
            violatedConstraintIds: [],
            blockingObjectionIds: [],
            relatedTaskIds: [],
            blocking: true,
            riskLevel: "low",
            impact: "Low impact",
            urgency: "before_release",
            reversibility: "reversible",
            safeDefaultAvailable: true,
            disposition: "blocking",
            status: "open"
        }
    ];
    return state;
}
