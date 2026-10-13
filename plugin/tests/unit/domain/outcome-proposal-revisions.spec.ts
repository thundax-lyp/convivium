import { captainActorIdFor } from "@/domain/control-actor.ts";
import { describe, expect, it } from "vitest";
import {
    recordProposalRevision,
    disposeRisk,
    recordCompletionFact
} from "@/domain/transitions/outcome.ts";
import { addUnpublishedEvidence, validState } from "./outcome-fixtures.ts";

describe("risk disposition gates", () => {
    const riskState = () => {
        const state = validState();
        state.issues = [
            {
                id: "issue",
                actorId: "contributor",
                agendaId: "a",
                description: "risk",
                riskLevel: "medium",
                classification: "blocking",
                affectedOutputIds: ["o"],
                affectedCriterionIds: [],
                affectedConstraintIds: [],
                requiresEvidenceReview: true,
                blocking: true,
                status: "open",
                rationale: "x"
            },
            {
                id: "other",
                actorId: "contributor",
                agendaId: "a",
                description: "other",
                riskLevel: "low",
                classification: "blocking",
                affectedOutputIds: ["o"],
                affectedCriterionIds: [],
                affectedConstraintIds: [],
                requiresEvidenceReview: false,
                blocking: true,
                status: "open",
                rationale: "x"
            }
        ];
        return state;
    };
    const input = (
        actor: { kind: "identity"; id: string } | { kind: "captain_user"; id: string },
        overrides: Record<string, unknown> = {}
    ) => ({
        dispositionId: "rd",
        issueId: "issue",
        action: "accept",
        scope: "scope",
        rationale: "reason",
        evidenceIds: ["v"],
        actor,
        now: 1,
        ...overrides
    });
    it("accept succeeds with the trusted Captain actor", () => {
        const actor = { kind: "captain_user" as const, id: captainActorIdFor("m") };
        const state = riskState();
        const before = structuredClone(state);
        const result = disposeRisk(state, input(actor));
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["rd", "issue", "v"],
            effectRequests: []
        });
        if (result.kind !== "accepted") {
            return;
        }
        expect(result.state.riskDispositions[0]).toMatchObject({
            id: "rd",
            issueId: "issue",
            actorId: actor.id,
            action: "accept",
            scope: "scope",
            rationale: "reason",
            evidenceIds: ["v"],
            createdAt: 1
        });
        expect(result.state.issues.find((i) => i.id === "issue")).toMatchObject({
            classification: "accepted_risk",
            blocking: false
        });
        expect(result.state.issues.find((i) => i.id === "other")).toEqual(before.issues[1]);
        expect(result.state.version).toBe(2);
        expect(result.state.updatedAt).toBe(1);
        expect(state).toEqual(before);
    });
    it("reject succeeds despite excessive risk and unsatisfied constraint", () => {
        const state = riskState();
        state.objective.acceptableRiskLevel = "low";
        state.issues[0].riskLevel = "high";
        state.objective.hardConstraints = [{ id: "c", text: "constraint", status: "pending" }];
        state.issues[0].affectedConstraintIds = ["c"];
        expect(
            disposeRisk(
                state,
                input({ kind: "captain_user", id: captainActorIdFor("m") }, { action: "reject" })
            )
        ).toMatchObject({
            kind: "accepted",
            relatedIds: ["rd", "issue", "v"],
            effectRequests: []
        });
    });
    it.each(["high"] as const)("accept boundary %s follows acceptable level", (level) => {
        const state = riskState();
        state.objective.acceptableRiskLevel = level;
        state.issues[0].riskLevel = level;
        expect(
            disposeRisk(state, input({ kind: "captain_user", id: captainActorIdFor("m") }))
        ).toMatchObject({
            kind: "accepted"
        });
    });
    it("rejects excessive accept even with satisfied affected constraints", () => {
        const state = riskState();
        state.objective.acceptableRiskLevel = "low";
        state.issues[0].riskLevel = "high";
        state.objective.hardConstraints = [{ id: "c", text: "constraint", status: "satisfied" }];
        state.issues[0].affectedConstraintIds = ["c"];
        expect(
            disposeRisk(state, input({ kind: "captain_user", id: captainActorIdFor("m") }))
        ).toMatchObject({
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["pending"] as const)("rejects accept with %s hard constraint", (status) => {
        const state = riskState();
        state.objective.hardConstraints = [{ id: "c", text: "constraint", status }];
        state.issues[0].affectedConstraintIds = ["c"];
        expect(
            disposeRisk(state, input({ kind: "captain_user", id: captainActorIdFor("m") }))
        ).toMatchObject({
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["contributor"] as const)("rejects %s actor", (id) => {
        const state = riskState();
        expect(disposeRisk(state, input({ kind: "identity", id }))).toMatchObject({
            error: { code: "UNAUTHORIZED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["resolved", "deferred"] as const)("rejects %s issue", (status) => {
        const state = riskState();
        state.issues[0].status = status;
        if (status === "resolved" || status === "out_of_scope") {
            state.issues[0].blocking = false;
        }
        if (status === "out_of_scope") {
            state.issues[0].classification = "out_of_scope";
        }
        expect(
            disposeRisk(state, input({ kind: "captain_user", id: captainActorIdFor("m") }))
        ).toMatchObject({
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each([
        ["missing issue", { issueId: "missing" }, "NOT_FOUND"],
        ["missing evidence", { evidenceIds: ["missing"] }, "NOT_FOUND"],
        ["duplicate evidence", { evidenceIds: ["v", "v"] }, "INVALID_ARGUMENT"],
        ["duplicate disposition", {}, "INVALID_ARGUMENT"]
    ] as const)("rejects %s", (_name, overrides, code) => {
        const state = riskState();
        if (_name === "duplicate disposition") {
            state.riskDispositions = [{ id: "rd" } as never];
        }
        expect(
            disposeRisk(
                state,
                input({ kind: "captain_user", id: captainActorIdFor("m") }, overrides)
            )
        ).toMatchObject({ error: { code }, state, relatedIds: [], effectRequests: [] });
    });
    it("distinguishes an unpublished evidence version", () => {
        const state = riskState();
        addUnpublishedEvidence(state);
        expect(
            disposeRisk(
                state,
                input({ kind: "captain_user", id: captainActorIdFor("m") }, { evidenceIds: ["v2"] })
            )
        ).toMatchObject({
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("preserves risk history across accept reject accept", () => {
        const state = riskState();
        const first = disposeRisk(
            state,
            input({ kind: "captain_user", id: captainActorIdFor("m") })
        );
        expect(first.kind).toBe("accepted");
        if (first.kind !== "accepted") {
            return;
        }
        const second = disposeRisk(
            first.state,
            input(
                { kind: "captain_user", id: captainActorIdFor("m") },
                { dispositionId: "rd2", action: "reject", now: 2 }
            )
        );
        expect(second.kind).toBe("accepted");
        if (second.kind !== "accepted") {
            return;
        }
        const third = disposeRisk(
            second.state,
            input(
                { kind: "captain_user", id: captainActorIdFor("m") },
                { dispositionId: "rd3", now: 3 }
            )
        );
        expect(third).toMatchObject({ kind: "accepted" });
        if (third.kind !== "accepted") {
            return;
        }
        expect(third.state.riskDispositions.map((d) => d.action)).toEqual([
            "accept",
            "reject",
            "accept"
        ]);
        expect(third.state.issues[0]).toMatchObject({
            classification: "accepted_risk",
            blocking: false
        });
    });
    it.each(["paused"] as const)("rejects lifecycle %s", (status) => {
        const state = riskState();
        state.lifecycle = { ...state.lifecycle, status };
        expect(
            disposeRisk(state, input({ kind: "captain_user", id: captainActorIdFor("m") }))
        ).toMatchObject({
            error: { code: "INVALID_STATE" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["terminal"] as const)("rejects terminal lifecycle %s", (status) => {
        const state = validState(status);
        state.issues = riskState().issues;
        expect(
            disposeRisk(state, input({ kind: "captain_user", id: captainActorIdFor("m") }))
        ).toMatchObject({
            error: { code: "MEETING_TERMINAL" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("keeps authorization and shape ahead of lifecycle", () => {
        const state = riskState();
        state.lifecycle = { ...state.lifecycle, status: "paused" };
        expect(disposeRisk(state, input({ kind: "identity", id: "manager" }))).toMatchObject({
            error: { code: "UNAUTHORIZED" },
            state
        });
        expect(
            disposeRisk(
                state,
                input({ kind: "captain_user", id: captainActorIdFor("m") }, { dispositionId: "" })
            )
        ).toMatchObject({ error: { code: "INVALID_ARGUMENT" }, state });
    });
});

it("records a fully reviewed completion fact and converges without termination", () => {
    const state = validState();
    state.objective = {
        ...state.objective,
        acceptanceCriteria: [{ id: "criterion", text: "criterion", status: "pending" }]
    };
    state.proposals = [
        {
            id: "rev",
            proposalId: "prop",
            ordinal: 1,
            actorId: "contributor",
            agendaId: "a",
            summary: "s",
            body: "b",
            evidenceIds: ["v"],
            createdAt: 0
        }
    ];
    state.decisionCandidates = [
        {
            id: "cand",
            proposalRevisionId: "rev",
            actorId: "contributor",
            outcome: "adopt",
            rationale: "x",
            evidenceIds: ["v"],
            positionIds: [],
            createdAt: 0
        }
    ];
    state.decisions = [
        {
            id: "dec",
            candidateId: "cand",
            proposalRevisionId: "rev",
            actorId: "contributor",
            outcome: "adopt",
            rationale: "x",
            evidenceIds: ["v"],
            positionIds: [],
            createdAt: 0,
            status: "accepted"
        }
    ];
    const before = structuredClone(state);
    const result = recordCompletionFact(state, {
        factId: "fact",
        outputId: "o",
        criterionId: "criterion",
        statement: "complete",
        rationale: "accepted decision",
        evidenceIds: ["v"],
        decisionIds: ["dec"],
        actor: { kind: "captain_user", id: captainActorIdFor("m") },
        now: 7
    });
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") {
        return;
    }
    expect(result.state.objective.requiredOutputs[0].status).toBe("satisfied");
    expect(result.state.objective.acceptanceCriteria[0].status).toBe("satisfied");
    expect(result.state.lifecycle).toMatchObject({
        status: "converging",
        changedAt: 7,
        changedBy: captainActorIdFor("m"),
        reason: "objective_satisfied"
    });
    expect(result.state.termination).toBeUndefined();
    expect(result.state.archive).toBeUndefined();
    expect(result.effectRequests).toEqual([]);
    expect(state).toEqual(before);
});

it("records a fact but remains running while a blocking issue exists", () => {
    const state = validState();
    state.issues = [
        {
            id: "issue",
            actorId: "contributor",
            agendaId: "a",
            description: "block",
            riskLevel: "high",
            classification: "blocking",
            affectedOutputIds: ["o"],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            requiresEvidenceReview: true,
            blocking: true,
            status: "open",
            rationale: "x"
        }
    ];
    state.proposals = [
        {
            id: "rev",
            proposalId: "prop",
            ordinal: 1,
            actorId: "contributor",
            agendaId: "a",
            summary: "s",
            body: "b",
            evidenceIds: ["v"],
            createdAt: 0
        }
    ];
    state.decisionCandidates = [
        {
            id: "cand",
            proposalRevisionId: "rev",
            actorId: "contributor",
            outcome: "adopt",
            rationale: "x",
            evidenceIds: ["v"],
            positionIds: [],
            createdAt: 0
        }
    ];
    state.decisions = [
        {
            id: "dec",
            candidateId: "cand",
            proposalRevisionId: "rev",
            actorId: "contributor",
            outcome: "adopt",
            rationale: "x",
            evidenceIds: ["v"],
            positionIds: [],
            createdAt: 0,
            status: "accepted"
        }
    ];
    const result = recordCompletionFact(state, {
        factId: "fact",
        outputId: "o",
        statement: "complete",
        rationale: "accepted decision",
        evidenceIds: ["v"],
        decisionIds: ["dec"],
        actor: { kind: "captain_user", id: captainActorIdFor("m") },
        now: 7
    });
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") {
        return;
    }
    expect(result.state.lifecycle.status).toBe("running");
    expect(result.state.completionFacts).toHaveLength(1);
});

it("makes an active fact basis stale when a new proposal revision is recorded", () => {
    const state = validState();
    state.objective = {
        ...state.objective,
        hardConstraints: [{ id: "constraint", text: "constraint", status: "pending" }]
    };
    state.proposals = [
        {
            id: "rev-1",
            proposalId: "prop",
            ordinal: 1,
            actorId: "contributor",
            agendaId: "a",
            summary: "s",
            body: "b",
            evidenceIds: ["v"],
            createdAt: 0
        }
    ];
    state.decisionCandidates = [
        {
            id: "cand",
            proposalRevisionId: "rev-1",
            actorId: "contributor",
            outcome: "adopt",
            rationale: "x",
            evidenceIds: ["v"],
            positionIds: [],
            createdAt: 0
        }
    ];
    state.decisions = [
        {
            id: "dec",
            candidateId: "cand",
            proposalRevisionId: "rev-1",
            actorId: "contributor",
            outcome: "adopt",
            rationale: "x",
            evidenceIds: ["v"],
            positionIds: [],
            createdAt: 0,
            status: "accepted"
        }
    ];
    state.completionFacts = [
        {
            id: "fact",
            outputId: "o",
            actorId: captainActorIdFor("m"),
            status: "active",
            statement: "complete",
            rationale: "x",
            evidenceIds: ["v"],
            decisionIds: ["dec"],
            createdAt: 0
        }
    ];
    state.objective.requiredOutputs[0] = {
        ...state.objective.requiredOutputs[0],
        status: "satisfied"
    };
    const result = recordProposalRevision(state, {
        revisionId: "rev-2",
        proposalId: "prop",
        agendaId: "a",
        summary: "new",
        body: "new",
        evidenceIds: ["v"],
        supersedesRevisionId: "rev-1",
        actor: { kind: "identity", id: "contributor" },
        now: 1
    });
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") {
        return;
    }
    expect(result.state.completionFacts[0].status).toBe("active");
    expect(result.state.objective.requiredOutputs[0].status).toBe("pending");
    expect(result.state.lifecycle.status).toBe("running");
});
