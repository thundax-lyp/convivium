import { createLocalDecisionRiskState } from "../../../fixtures/local-decision-risk.js";
import type { MeetingState } from "../../../../src/domain/model.js";
import { describe, expect, it } from "vitest";
import { acceptDecisionCandidate, disposeDecision } from "../../../../src/domain/index.js";
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

describe("local control preserves authority and guards", () => {
    const local = {
        ...base,
        authority: "local_host" as const,
        actorBinding: "local-host:loopback-web",
        reason: "Reviewed evidence",
        decisionId: "decision-candidate-1"
    };
    function accepted() {
        return acceptDecisionCandidate(createLocalDecisionRiskState(), {
            ...local,
            decisionCandidateId: "candidate-1"
        }).state;
    }
    it("keeps local provenance through replacement and revocation", () => {
        const state = accepted();
        const before = structuredClone(state);
        const replaced = disposeDecision(state, {
            ...local,
            requestId: "local-replace",
            action: "supersede",
            replacementCandidateId: "candidate-2"
        });
        expect(state).toEqual(before);
        expect(replaced.effect.events.map((event) => event.type)).toEqual([
            "decision.accepted",
            "decision.superseded"
        ]);
        for (const event of replaced.effect.events)
            expect(event.payload).toMatchObject({ actorBinding: local.actorBinding });
        expect(replaced.state.decisions[0]).toMatchObject({
            status: "superseded",
            supersededByDecisionId: "decision-candidate-2"
        });
        expect(replaced.state.decisions[1]).toMatchObject({
            status: "accepted",
            acceptanceMode: "local_host_acceptance"
        });
        const replacementBefore = structuredClone(replaced.state);
        const revoked = disposeDecision(replaced.state, {
            ...local,
            decisionId: "decision-candidate-2",
            requestId: "local-revoke",
            action: "revoke"
        });
        expect(replaced.state).toEqual(replacementBefore);
        expect(revoked.state.decisions[1]?.status).toBe("revoked");
        expect(revoked.state.completionFacts).toHaveLength(4);
        for (const fact of revoked.state.completionFacts)
            expect(fact).toMatchObject({
                authority: "local_host",
                assertedBy: local.actorBinding,
                evidenceMessageIds: ["message-1"],
                reason: local.reason
            });
        expect(revoked.effect.events[0]?.payload).toMatchObject({
            actorBinding: local.actorBinding
        });
        expect(
            disposeDecision(state, {
                ...base,
                decisionId: local.decisionId,
                action: "revoke"
            }).state.completionFacts.at(-1)?.authority
        ).toBe("captain");
    });
    it.each([
        { reason: " " },
        { evidenceMessageIds: [] },
        { evidenceMessageIds: ["message-1", "message-1"] },
        { evidenceMessageIds: ["unknown"] },
        { evidenceMessageIds: ["message-1", "other-meeting-message"] },
        { decisionId: "unknown" },
        { replacementCandidateId: "unknown" },
        { meetingId: "other-meeting" }
    ])("rejects invalid replacement %j atomically", (patch) => {
        const state = accepted();
        const before = structuredClone(state);
        expect(() =>
            disposeDecision(state, {
                ...local,
                action: "supersede",
                replacementCandidateId: "candidate-2",
                ...patch
            })
        ).toThrow();
        expect(state).toEqual(before);
    });
    it.each(["superseded", "revoked"] as const)("rejects %s target", (status) => {
        const state = accepted();
        state.decisions[0]!.status = status;
        const before = structuredClone(state);
        expect(() => disposeDecision(state, { ...local, action: "revoke" })).toThrow();
        expect(state).toEqual(before);
    });
    it.each<MeetingState["status"]>([
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed",
        "archiving",
        "archived"
    ])("rejects %s", (status) => {
        const state = accepted();
        state.status = status;
        const before = structuredClone(state);
        for (const action of ["revoke", "supersede"] as const) {
            expect(() =>
                disposeDecision(
                    state,
                    action === "revoke"
                        ? { ...local, action }
                        : { ...local, action, replacementCandidateId: "candidate-2" }
                )
            ).toThrow();
            expect(state).toEqual(before);
        }
    });
});
