import { describe, expect, it } from "vitest";
import {
    changeDecision,
    disposeRisk,
    isObjectiveSatisfied,
    recalculateMeetingCompletion
} from "@/domain/transitions/outcome.js";
import { completionReadyState } from "./outcome-fixtures.js";

describe("Recompute/Convergence", () => {
    const completedFactState = () => {
        const state = completionReadyState();
        state.objective.requiredOutputs[0].status = "satisfied";
        state.objective.hardConstraints = [
            { id: "constraint", text: "constraint", status: "pending" }
        ];
        state.completionFacts = [
            {
                id: "fact",
                outputId: "o",
                actorId: "captain",
                status: "active",
                statement: "done",
                rationale: "why",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        return state;
    };
    it("revoke decision invalidates active fact basis and returns target pending", () => {
        const state = completedFactState();
        const before = structuredClone(state);
        const result = changeDecision(state, {
            decisionId: "dec",
            status: "revoked",
            rationale: "revoke",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 2
        });
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["dec", "v"],
            effectRequests: []
        });
        if (result.kind !== "accepted") return;
        expect(result.state.decisions[0].status).toBe("revoked");
        expect(result.state.completionFacts[0].status).toBe("active");
        expect(result.state.objective.requiredOutputs[0].status).toBe("pending");
        expect(result.state.lifecycle.status).toBe("running");
        expect(state).toEqual(before);
    });
    it("superseding decision basis returns target pending while retaining fact history", () => {
        const state = completedFactState();
        state.objective.hardConstraints[0].status = "satisfied";
        state.decisionCandidates.push({
            ...state.decisionCandidates[0],
            id: "replacement",
            rationale: "replacement"
        });
        const result = changeDecision(state, {
            decisionId: "dec",
            status: "superseded",
            replacementCandidateId: "replacement",
            replacementDecisionId: "new",
            rationale: "replace",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 2
        });
        expect(result).toMatchObject({ kind: "accepted", effectRequests: [] });
        if (result.kind !== "accepted") return;
        expect(result.state.decisions.map((d) => d.status)).toEqual(["superseded", "accepted"]);
        expect(result.state.completionFacts[0].status).toBe("active");
        expect(result.state.objective.requiredOutputs[0].status).toBe("pending");
    });
    const blockingIssue = () => ({
        id: "issue",
        actorId: "contributor",
        agendaId: "a",
        description: "block",
        riskLevel: "high" as const,
        classification: "blocking" as const,
        affectedOutputIds: ["o"],
        affectedCriterionIds: [],
        affectedConstraintIds: [],
        requiresEvidenceReview: true,
        blocking: true,
        status: "open" as const,
        rationale: "block"
    });
    it("accepting the only blocking risk converges without termination", () => {
        const state = completionReadyState();
        state.objective.requiredOutputs[0].status = "satisfied";
        state.objective.hardConstraints = [
            { id: "constraint", text: "constraint", status: "satisfied" }
        ];
        state.completionFacts = [
            {
                id: "fact",
                outputId: "o",
                actorId: "captain",
                status: "active",
                statement: "done",
                rationale: "why",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        state.issues = [blockingIssue()];
        state.rounds.push({
            id: "pending-round",
            agendaId: "a",
            planId: "pending-plan",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            publicBaselinePublicationIds: [],
            openedAt: 0,
            status: "open",
            contributionIds: []
        });
        state.managerPlans.push({
            id: "pending-plan",
            agendaId: "a",
            managerId: "manager",
            kind: "open_round",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            rationale: "plan",
            createdAt: 0,
            status: "completed"
        });
        state.pendingHandRaises = [
            {
                roundId: "pending-round",
                contributorId: "contributor",
                purpose: "contribute",
                raisedAt: 0
            }
        ];
        state.opportunityRequests = [
            {
                id: "opportunity",
                agendaId: "a",
                contributorId: "contributor",
                purpose: "contribute",
                requestedAt: 0
            }
        ];
        const result = disposeRisk(state, {
            dispositionId: "risk",
            issueId: "issue",
            action: "accept",
            scope: "scope",
            rationale: "accept",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 3
        });
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["risk", "issue", "v"],
            effectRequests: []
        });
        if (result.kind !== "accepted") return;
        expect(result.state.issues[0]).toMatchObject({
            classification: "accepted_risk",
            blocking: false
        });
        expect(result.state.lifecycle).toMatchObject({
            status: "converging",
            changedAt: 3,
            changedBy: "captain",
            reason: "objective_satisfied"
        });
        expect(result.state.termination).toBeUndefined();
        expect(result.state.archive).toBeUndefined();
        expect(result.state.pendingHandRaises).toEqual([]);
        expect(result.state.opportunityRequests).toEqual([]);
    });
    it("rejecting the blocking risk preserves running satisfied state", () => {
        const state = completionReadyState();
        state.objective.requiredOutputs[0].status = "satisfied";
        state.objective.hardConstraints = [
            { id: "constraint", text: "constraint", status: "satisfied" }
        ];
        state.completionFacts = [
            {
                id: "fact",
                outputId: "o",
                actorId: "captain",
                status: "active",
                statement: "done",
                rationale: "why",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        state.issues = [blockingIssue()];
        const result = disposeRisk(state, {
            dispositionId: "risk",
            issueId: "issue",
            action: "reject",
            scope: "scope",
            rationale: "reject",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 3
        });
        expect(result).toMatchObject({ kind: "accepted", effectRequests: [] });
        if (result.kind !== "accepted") return;
        expect(result.state.lifecycle.status).toBe("running");
        expect(result.state.objective.requiredOutputs[0].status).toBe("satisfied");
        expect(result.state.issues[0].blocking).toBe(true);
    });
    it("satisfaction ignores nonblocking issue classes and is immutable", () => {
        const state = completionReadyState();
        state.objective.requiredOutputs[0].status = "satisfied";
        state.objective.hardConstraints = [
            { id: "constraint", text: "constraint", status: "satisfied" }
        ];
        state.completionFacts = [
            {
                id: "fact",
                outputId: "o",
                actorId: "captain",
                status: "active",
                statement: "done",
                rationale: "why",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        state.issues = [{ ...blockingIssue(), blocking: false, classification: "follow_up" }];
        const before = structuredClone(state);
        expect(isObjectiveSatisfied(state)).toBe(true);
        expect(state).toEqual(before);
        state.issues[0].blocking = true;
        expect(isObjectiveSatisfied(state)).toBe(false);
    });
    it("recalculation preserves bookkeeping and non-running lifecycle", () => {
        const state = completedFactState();
        state.lifecycle = { ...state.lifecycle, status: "paused" };
        const before = structuredClone(state);
        const result = recalculateMeetingCompletion(state, "captain", 9);
        expect(result.version).toBe(before.version);
        expect(result.updatedAt).toBe(before.updatedAt);
        expect(result.objective.hardConstraints).toEqual(before.objective.hardConstraints);
        expect(result.lifecycle).toEqual(before.lifecycle);
    });
});
