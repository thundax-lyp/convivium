import { createLocalDecisionRiskState } from "../../../fixtures/local-decision-risk.js";
import type { MeetingState } from "../../../../src/domain/model.js";
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

describe("local control preserves authority and guards", () => {
    const local = {
        ...context,
        authority: "local_host" as const,
        actorBinding: "local-host:loopback-web",
        reason: "Reviewed evidence"
    };
    it("preserves local provenance without altering the source state", () => {
        const state = createLocalDecisionRiskState();
        const before = structuredClone(state);
        const result = acceptDecisionCandidate(state, local);
        expect(state).toEqual(before);
        expect(result.state.decisions[0]).toMatchObject({
            acceptanceMode: "local_host_acceptance",
            acceptedBy: ["participant-1"]
        });
        expect(result.state.completionFacts[0]).toMatchObject({
            authority: "local_host",
            assertedBy: local.actorBinding,
            reason: local.reason,
            evidenceMessageIds: ["message-1"]
        });
        expect(result.effect.events[0]?.payload).toMatchObject({
            actorBinding: local.actorBinding
        });
        expect(acceptDecisionCandidate(state, context).state.completionFacts[0]?.authority).toBe(
            "captain"
        );
    });
    it.each([
        { reason: " " },
        { evidenceMessageIds: [] },
        { evidenceMessageIds: ["message-1", "message-1"] },
        { evidenceMessageIds: ["unknown"] },
        { evidenceMessageIds: ["message-1", "other-meeting-message"] },
        { decisionCandidateId: "unknown" },
        { meetingId: "other-meeting" }
    ])("rejects invalid command %j without mutation", (patch) => {
        const state = createLocalDecisionRiskState();
        const before = structuredClone(state);
        expect(() => acceptDecisionCandidate(state, { ...local, ...patch })).toThrow();
        expect(state).toEqual(before);
    });
    it.each(["stale", "unsupported", "blocking", "wrong-speaker", "missing-agenda"])(
        "rejects %s candidates",
        (kind) => {
            const state = createLocalDecisionRiskState();
            if (kind === "stale") state.proposals[0]!.revision = 2;
            if (kind === "unsupported") state.proposals[0]!.positions = [];
            if (kind === "blocking")
                state.proposals[0]!.positions.push({
                    id: "position-2",
                    participantId: "participant-2",
                    position: "object",
                    blocking: true,
                    proposalRevision: 1
                });
            if (kind === "wrong-speaker") state.transcript[0]!.speaker = "participant-2";
            if (kind === "missing-agenda") state.agenda = [];
            const before = structuredClone(state);
            expect(() => acceptDecisionCandidate(state, local)).toThrow();
            expect(state).toEqual(before);
        }
    );
    it.each<MeetingState["status"]>([
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed",
        "archiving",
        "archived"
    ])("rejects %s", (status) => {
        const state = createLocalDecisionRiskState();
        state.status = status;
        const before = structuredClone(state);
        expect(() => acceptDecisionCandidate(state, local)).toThrow();
        expect(state).toEqual(before);
    });
});
