import { captainActorIdFor } from "@/domain/control-actor.js";
import { describe, expect, it } from "vitest";
import {
    recordProposalRevision,
    disposeRisk,
    submitCompletionDeclaration,
    recordCompletionFact
} from "@/domain/transitions/outcome.js";
import { validState } from "./outcome-fixtures.js";

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
    it.each([
        ["captain", { kind: "captain_user", id: captainActorIdFor("m") }],
        ["local", { kind: "captain_user", id: captainActorIdFor("m") }]
    ] as const)("accept succeeds with %s", (_name, actor) => {
        const state = riskState();
        const before = structuredClone(state);
        const result = disposeRisk(state, input(actor));
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["rd", "issue", "v"],
            effectRequests: []
        });
        if (result.kind !== "accepted") return;
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
    it("rejects excessive accept and unsatisfied affected constraints", () => {
        const state = riskState();
        state.objective.acceptableRiskLevel = "low";
        state.issues[0].riskLevel = "high";
        state.objective.hardConstraints = [{ id: "c", text: "constraint", status: "pending" }];
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
        if (status === "resolved" || status === "out_of_scope") state.issues[0].blocking = false;
        if (status === "out_of_scope") state.issues[0].classification = "out_of_scope";
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
        if (_name === "duplicate disposition") state.riskDispositions = [{ id: "rd" } as never];
        expect(
            disposeRisk(
                state,
                input({ kind: "captain_user", id: captainActorIdFor("m") }, overrides)
            )
        ).toMatchObject({ error: { code }, state, relatedIds: [], effectRequests: [] });
    });
    it("distinguishes an unpublished evidence version", () => {
        const state = riskState();
        state.evidencePackages[0].versions.push({
            ...state.evidencePackages[0].versions[0],
            id: "v2",
            ordinal: 2,
            status: "submitted"
        });
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
        if (first.kind !== "accepted") return;
        const second = disposeRisk(
            first.state,
            input(
                { kind: "captain_user", id: captainActorIdFor("m") },
                { dispositionId: "rd2", action: "reject", now: 2 }
            )
        );
        expect(second.kind).toBe("accepted");
        if (second.kind !== "accepted") return;
        const third = disposeRisk(
            second.state,
            input(
                { kind: "captain_user", id: captainActorIdFor("m") },
                { dispositionId: "rd3", now: 3 }
            )
        );
        expect(third).toMatchObject({ kind: "accepted" });
        if (third.kind !== "accepted") return;
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

describe("completion declaration gates", () => {
    const declarationState = () => validState();
    const declarationInput = (
        actor: { kind: "identity"; id: string } | { kind: "local_controller"; id: string },
        overrides: Record<string, unknown> = {}
    ) => ({
        declarationId: "decl",
        outputId: "o",
        statement: "done",
        evidenceIds: ["v"],
        actor,
        now: 1,
        ...overrides
    });
    it.each([
        ["contributor", { kind: "identity", id: "contributor" }],
        ["captain", { kind: "identity", id: "captain" }]
    ] as const)("accepts %s declaration with exact bookkeeping", (_name, actor) => {
        const state = declarationState();
        const before = structuredClone(state);
        const result = submitCompletionDeclaration(state, declarationInput(actor));
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["decl", "o", "v"],
            effectRequests: []
        });
        if (result.kind !== "accepted") return;
        expect(result.state.completionDeclarations[0]).toMatchObject({
            id: "decl",
            actorId: actor.id,
            outputId: "o",
            statement: "done",
            evidenceIds: ["v"],
            createdAt: 1
        });
        expect(result.state.version).toBe(2);
        expect(result.state.updatedAt).toBe(1);
        expect(result.state.completionFacts).toEqual(before.completionFacts);
        expect(result.state.objective).toEqual(before.objective);
        expect(result.state.lifecycle).toEqual(before.lifecycle);
        expect(state).toEqual(before);
    });
    it("accepts criterion and preserves existing declarations", () => {
        const state = declarationState();
        state.objective.acceptanceCriteria = [{ id: "c", text: "criterion", status: "pending" }];
        state.completionDeclarations = [
            {
                id: "old",
                actorId: "contributor",
                outputId: "o",
                statement: "old",
                evidenceIds: ["v"],
                createdAt: 0
            }
        ];
        expect(
            submitCompletionDeclaration(
                state,
                declarationInput({ kind: "identity", id: "contributor" }, { criterionId: "c" })
            )
        ).toMatchObject({
            kind: "accepted",
            relatedIds: ["decl", "o", "c", "v"],
            effectRequests: []
        });
    });
    it.each(["manager"] as const)("rejects %s", (id) => {
        const state = declarationState();
        expect(
            submitCompletionDeclaration(state, declarationInput({ kind: "identity", id }))
        ).toMatchObject({
            error: { code: "UNAUTHORIZED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("rejects non-contributor identity and external control actor", () => {
        const state = declarationState();
        state.identities[0].roles = ["manager"];
        expect(
            submitCompletionDeclaration(
                state,
                declarationInput({ kind: "identity", id: "captain" })
            )
        ).toMatchObject({ error: { code: "UNAUTHORIZED" }, state });
        expect(
            submitCompletionDeclaration(
                state,
                declarationInput({ kind: "local_controller", id: "local" })
            )
        ).toMatchObject({ error: { code: "UNAUTHORIZED" }, state });
    });
    it.each([
        ["missing output", { outputId: "missing" }, "NOT_FOUND"],
        ["missing criterion", { criterionId: "missing" }, "NOT_FOUND"],
        ["missing task", { taskId: "missing" }, "NOT_FOUND"],
        ["duplicate id", {}, "INVALID_ARGUMENT"],
        ["empty statement", { statement: "" }, "INVALID_ARGUMENT"],
        ["missing evidence", { evidenceIds: ["missing"] }, "NOT_FOUND"]
    ] as const)("rejects %s", (_name, overrides, code) => {
        const state = declarationState();
        if (_name === "duplicate id") state.completionDeclarations = [{ id: "decl" } as never];
        expect(
            submitCompletionDeclaration(
                state,
                declarationInput({ kind: "identity", id: "contributor" }, overrides)
            )
        ).toMatchObject({ error: { code }, state, relatedIds: [], effectRequests: [] });
    });
    it("rejects unpublished evidence distinctly", () => {
        const state = declarationState();
        state.evidencePackages[0].versions.push({
            ...state.evidencePackages[0].versions[0],
            id: "v2",
            ordinal: 2,
            status: "submitted"
        });
        expect(
            submitCompletionDeclaration(
                state,
                declarationInput({ kind: "identity", id: "contributor" }, { evidenceIds: ["v2"] })
            )
        ).toMatchObject({
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["assignee", "status", "authorization", "result"] as const)(
        "rejects invalid task %s",
        (variant) => {
            const state = declarationState();
            state.tasks = [
                {
                    id: "task",
                    createdBy: "manager",
                    assigneeId: "contributor",
                    agendaId: "a",
                    title: "t",
                    instructions: "i",
                    contextPublicationUpperBound: [],
                    status: "completed",
                    result: "done",
                    createdAt: 0,
                    updatedAt: 0,
                    authorizationId: "auth",
                    authorizationStatus: "active",
                    attempt: 1,
                    completedAt: 1
                }
            ];
            if (variant === "assignee") state.tasks[0].assigneeId = "manager";
            if (variant === "status") state.tasks[0].status = "open";
            if (variant === "authorization") state.tasks[0].authorizationStatus = "revoked";
            if (variant === "result") {
                const { result: _result, ...withoutResult } = state.tasks[0];
                state.tasks[0] = withoutResult;
            }
            expect(
                submitCompletionDeclaration(
                    state,
                    declarationInput({ kind: "identity", id: "contributor" }, { taskId: "task" })
                )
            ).toMatchObject({
                error: { code: "PRECONDITION_FAILED" },
                state,
                relatedIds: [],
                effectRequests: []
            });
        }
    );
    it.each(["paused"] as const)("rejects lifecycle %s", (status) => {
        const state = declarationState();
        state.lifecycle = { ...state.lifecycle, status };
        expect(
            submitCompletionDeclaration(
                state,
                declarationInput({ kind: "identity", id: "contributor" })
            )
        ).toMatchObject({
            error: { code: "INVALID_STATE" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["terminal"] as const)("rejects terminal lifecycle %s", (status) => {
        const state = validState(status);
        expect(
            submitCompletionDeclaration(
                state,
                declarationInput({ kind: "identity", id: "contributor" })
            )
        ).toMatchObject({
            error: { code: "MEETING_TERMINAL" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("keeps precedence authorization and shape ahead of lifecycle", () => {
        const state = declarationState();
        state.lifecycle = { ...state.lifecycle, status: "paused" };
        expect(
            submitCompletionDeclaration(
                state,
                declarationInput({ kind: "identity", id: "manager" })
            )
        ).toMatchObject({ error: { code: "UNAUTHORIZED" }, state });
        expect(
            submitCompletionDeclaration(
                state,
                declarationInput({ kind: "identity", id: "contributor" }, { declarationId: "" })
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
    if (result.kind !== "accepted") return;
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
    if (result.kind !== "accepted") return;
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
    if (result.kind !== "accepted") return;
    expect(result.state.completionFacts[0].status).toBe("active");
    expect(result.state.objective.requiredOutputs[0].status).toBe("pending");
    expect(result.state.lifecycle.status).toBe("running");
});
