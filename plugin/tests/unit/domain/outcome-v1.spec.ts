import { describe, expect, it } from "vitest";
import {
    recordProposalRevisionV1,
    recordPositionV1,
    recordDecisionCandidateV1,
    pendingDecisionCandidatesV1,
    decideV1,
    changeDecisionV1,
    disposeRiskV1,
    submitCompletionDeclarationV1,
    recordCompletionFactV1,
    changeCompletionFactV1,
    isObjectiveSatisfiedV1,
    recalculateMeetingCompletionV1
} from "@/domain/transitions/outcome-v1.js";
import type { MeetingState } from "@/domain/meeting-state-v1.js";

describe("outcome proposal revisions", () => {
    it("rejects an invalid snapshot without changing its reference", () => {
        const state = { lifecycle: { status: "terminal" } } as MeetingState;
        const result = recordProposalRevisionV1(state, {
            revisionId: "r1",
            proposalId: "p1",
            agendaId: "a1",
            summary: "s",
            body: "b",
            evidenceIds: ["e1"],
            actor: { kind: "identity", id: "i1" },
            now: 1
        });
        expect(result.kind).toBe("rejected");
        expect(result.state).toBe(state);
    });

    it.each(["paused", "preparing", "converging", "ending"] as const)(
        "rejects proposal writes in %s",
        (status) => {
            const state = { ...({} as MeetingState), lifecycle: { status } } as MeetingState;
            const result = recordProposalRevisionV1(state, {
                revisionId: "r1",
                proposalId: "p1",
                agendaId: "a1",
                summary: "s",
                body: "b",
                evidenceIds: ["e1"],
                actor: { kind: "identity", id: "i1" },
                now: 1
            });
            expect(result.kind).toBe("rejected");
            expect(result.state).toBe(state);
        }
    );

    it("keeps pending candidates a pure empty derivation for a malformed snapshot", () => {
        const state = {
            lifecycle: { status: "terminal" },
            proposals: [],
            decisions: []
        } as unknown as MeetingState;
        expect(pendingDecisionCandidatesV1(state)).toEqual([]);
    });

    it.each([
        [
            recordPositionV1,
            {
                positionId: "p",
                proposalRevisionId: "r",
                stance: "support",
                rationale: "x",
                evidenceIds: ["e"]
            }
        ],
        [
            recordDecisionCandidateV1,
            {
                candidateId: "c",
                proposalRevisionId: "r",
                outcome: "adopt",
                rationale: "x",
                evidenceIds: ["e"],
                positionIds: ["p"]
            }
        ],
        [decideV1, { decisionId: "d", candidateId: "c" }],
        [
            changeDecisionV1,
            { decisionId: "d", status: "revoked", rationale: "x", evidenceIds: ["e"] }
        ],
        [
            disposeRiskV1,
            {
                dispositionId: "rd",
                issueId: "i",
                action: "reject",
                scope: "x",
                rationale: "x",
                evidenceIds: ["e"]
            }
        ],
        [
            submitCompletionDeclarationV1,
            { declarationId: "cd", outputId: "o", statement: "x", evidenceIds: ["e"] }
        ],
        [
            recordCompletionFactV1,
            {
                factId: "f",
                outputId: "o",
                statement: "x",
                rationale: "x",
                evidenceIds: ["e"],
                decisionIds: ["d"]
            }
        ],
        [changeCompletionFactV1, { factId: "f", status: "revoked", rationale: "x" }]
    ] as const)("preserves reference and effects on invalid %s input", (action, input) => {
        const state = {} as MeetingState;
        const result = action(state, {
            ...input,
            actor: { kind: "identity", id: "i" },
            now: 1
        } as never);
        expect(result.kind).toBe("rejected");
        expect(result.state).toBe(state);
        if (result.kind === "rejected") expect(result.effectRequests).toEqual([]);
    });

    it("judges objective satisfaction from target statuses and blocking issues", () => {
        const state = {
            lifecycle: { status: "paused", changedAt: 0, changedBy: "i" },
            objective: {
                requiredOutputs: [{ id: "o", text: "o", status: "satisfied" }],
                acceptanceCriteria: [],
                hardConstraints: [],
                statement: "x",
                acceptableRiskLevel: "low"
            },
            issues: [],
            proposals: [],
            decisions: [],
            completionFacts: [],
            publications: []
        } as unknown as MeetingState;
        expect(isObjectiveSatisfiedV1(state)).toBe(false);
        expect(
            isObjectiveSatisfiedV1({ ...state, issues: [{ blocking: true }] } as MeetingState)
        ).toBe(false);
    });

    it("recalculation does not mutate the input snapshot", () => {
        const state = {
            lifecycle: { status: "paused", changedAt: 0, changedBy: "i" },
            objective: { requiredOutputs: [], acceptanceCriteria: [], hardConstraints: [] },
            issues: [],
            completionFacts: [],
            decisions: [],
            proposals: [],
            publications: []
        } as unknown as MeetingState;
        const result = recalculateMeetingCompletionV1(state, "i", 2);
        expect(result).not.toBe(state);
        expect(state.lifecycle.status).toBe("paused");
    });
});
