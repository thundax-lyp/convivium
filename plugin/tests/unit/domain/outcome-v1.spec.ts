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

function validState(status: MeetingState["lifecycle"]["status"] = "running"): MeetingState {
    const state = {
        id: "m",
        version: 1,
        createdAt: 0,
        updatedAt: 0,
        objective: {
            statement: "objective",
            requiredOutputs: [{ id: "o", text: "output", status: "pending" }],
            acceptanceCriteria: [],
            hardConstraints: [],
            acceptableRiskLevel: "high"
        },
        lifecycle: { status, changedAt: 0, changedBy: "local" },
        identities: [
            {
                id: "captain",
                displayName: "Captain",
                roles: ["captain", "contributor"],
                agendaResponsibilityIds: ["a"],
                riskAuthority: true,
                required: true
            },
            {
                id: "contributor",
                displayName: "Contributor",
                roles: ["contributor"],
                agendaResponsibilityIds: ["a"],
                riskAuthority: false,
                required: false
            },
            {
                id: "reviewer",
                displayName: "Reviewer",
                roles: ["evidence_reviewer"],
                agendaResponsibilityIds: [],
                riskAuthority: false,
                required: false
            },
            {
                id: "manager",
                displayName: "Manager",
                roles: ["manager"],
                agendaResponsibilityIds: [],
                riskAuthority: false,
                required: false
            }
        ],
        identityRecommendations: [],
        agenda: [
            {
                id: "a",
                title: "Agenda",
                question: "q",
                status: "active",
                requiredOutputIds: ["o"]
            }
        ],
        agendaCandidates: [],
        rounds: [
            {
                id: "r",
                agendaId: "a",
                publicBaselinePublicationIds: [],
                openedAt: 0,
                status: "published",
                contributionIds: ["c"],
                publicationId: "pub"
            }
        ],
        opportunityRequests: [],
        pendingHandRaises: [],
        contributions: [
            {
                id: "c",
                roundId: "r",
                contributorId: "contributor",
                handRaise: { raisedAt: 0, purpose: "x" },
                acceptedAt: 0,
                status: "registered",
                substantiveSupplementCount: 0,
                packageId: "p"
            }
        ],
        evidenceReviewerId: "reviewer",
        completionDeclarations: [],
        evidencePackages: [
            {
                id: "p",
                roundId: "r",
                contributionId: "c",
                authorId: "contributor",
                agendaId: "a",
                currentVersionId: "v",
                versions: [
                    {
                        id: "v",
                        ordinal: 1,
                        observation: "x",
                        interpretation: "x",
                        method: "x",
                        falsifiers: [],
                        uncertainties: [],
                        limitations: [],
                        claims: [],
                        materials: [],
                        submittedAt: 0
                    }
                ]
            }
        ],
        registrations: [
            {
                id: "reg",
                versionId: "v",
                status: "complete",
                createdAt: 0
            }
        ],
        reviews: [
            {
                id: "review",
                versionId: "v",
                reviewerId: "reviewer",
                baselinePublicationIds: [],
                scope: "x",
                dimensions: {
                    source: { score: 3, reason: "x", scope: "x", baselineEvidenceIds: [] },
                    credibility: { score: 3, reason: "x", scope: "x", baselineEvidenceIds: [] },
                    completeness: { score: 3, reason: "x", scope: "x", baselineEvidenceIds: [] },
                    support: { score: 3, reason: "x", scope: "x", baselineEvidenceIds: [] }
                },
                createdAt: 0
            }
        ],
        reviewDeliveries: [
            {
                id: "delivery",
                reviewId: "review",
                authorId: "contributor",
                status: "sent",
                sentAt: 0
            }
        ],
        publications: [
            {
                id: "pub",
                roundId: "r",
                seq: 1,
                finalVersionIds: ["v"],
                finalReviewIds: ["review"],
                publishedAt: 0,
                exitReasons: []
            }
        ],
        messages: [],
        proposals: [],
        positions: [],
        decisionCandidates: [],
        decisions: [],
        questions: [],
        issues: [],
        riskDispositions: [],
        tasks: [],
        managerPlans: [],
        privateMails: [],
        completionFacts: [],
        limits: {
            maxFormalMessages: 1,
            maxDurationMs: 1,
            taskDeadlineMs: 1,
            reviewDeadlineMs: 1,
            responseDeadlineMs: 60000
        }
    } as unknown as MeetingState;
    if (status === "terminal" || status === "archiving" || status === "archived") {
        state.termination = {
            id: "termination",
            outcome: "completed",
            reason: "done",
            endedAt: 0,
            decisionIds: [],
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            unclosedContributionIds: []
        };
    }
    if (status === "archiving" || status === "archived") {
        state.archive = {
            id: "archive",
            status: status === "archived" ? "complete" : "complete",
            createdAt: 0,
            publicSnapshotVersion: 1,
            terminationId: "termination",
            objective: state.objective,
            agenda: state.agenda,
            agendaCandidates: [],
            publications: [],
            messages: [],
            evidenceBundles: [],
            proposalRevisions: [],
            positions: [],
            decisionCandidates: [],
            decisions: [],
            completionFacts: [],
            questions: [],
            issues: [],
            riskDispositions: [],
            questionIssueDispositionFacts: [],
            termination: state.termination,
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            unresolvedItemIds: [],
            unclosedContributions: [],
            identityProvenance: [],
            exportMaterials: []
        };
    }
    return state;
}

function completionReadyState(): MeetingState {
    const state = validState();
    state.proposals = [
        {
            id: "rev",
            proposalId: "prop",
            ordinal: 1,
            actorId: "contributor",
            agendaId: "a",
            summary: "proposal",
            body: "body",
            evidenceIds: ["v"],
            createdAt: 0
        }
    ];
    state.positions = [
        {
            id: "pos",
            proposalRevisionId: "rev",
            actorId: "contributor",
            stance: "support",
            rationale: "support",
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
            rationale: "adopt",
            evidenceIds: ["v"],
            positionIds: ["pos"],
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
            rationale: "adopt",
            evidenceIds: ["v"],
            positionIds: ["pos"],
            createdAt: 0,
            status: "accepted"
        }
    ];
    return state;
}

function completionInput(
    actor: { kind: "identity"; id: string } = { kind: "identity", id: "captain" }
) {
    return {
        factId: "fact",
        outputId: "o",
        statement: "complete",
        rationale: "basis",
        evidenceIds: ["v"],
        decisionIds: ["dec"],
        actor,
        now: 1
    } as const;
}

function proposalState(): MeetingState {
    return validState();
}

function expectRejected(
    result: ReturnType<typeof recordPositionV1>,
    state: MeetingState,
    code: string
) {
    expect(result).toMatchObject({
        kind: "rejected",
        error: { code },
        state,
        relatedIds: [],
        effectRequests: []
    });
}

describe("proposal revision gates", () => {
    const input = (overrides: Record<string, unknown> = {}) => ({
        revisionId: "rev-1",
        proposalId: "prop",
        agendaId: "a",
        summary: "summary",
        body: "body",
        evidenceIds: ["v"],
        actor: { kind: "identity", id: "contributor" },
        now: 1,
        ...overrides
    });

    it.each([
        ["manager", { kind: "identity", id: "manager" }],
        ["local", { kind: "local_controller", id: "local" }]
    ] as const)("rejects %s actor", (_name, actor) => {
        const state = proposalState();
        const result = recordProposalRevisionV1(state, input({ actor }));
        expect(result).toMatchObject({
            kind: "rejected",
            error: { code: "UNAUTHORIZED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("distinguishes missing from unpublished evidence", () => {
        const missing = recordProposalRevisionV1(
            proposalState(),
            input({ evidenceIds: ["missing"] })
        );
        expect(missing).toMatchObject({
            kind: "rejected",
            error: { code: "NOT_FOUND", targetId: "missing" }
        });
        const unpublished = proposalState();
        unpublished.evidencePackages[0].versions.push({
            ...unpublished.evidencePackages[0].versions[0],
            id: "v2",
            ordinal: 2
        });
        const result = recordProposalRevisionV1(unpublished, input({ evidenceIds: ["v2"] }));
        expect(result).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
    });
    it.each([
        ["duplicate evidence", { evidenceIds: ["v", "v"] }],
        ["empty summary", { summary: "" }],
        ["empty revision", { revisionId: "" }],
        ["empty proposal", { proposalId: "" }]
    ] as const)("rejects %s shape", (_name, overrides) => {
        expect(recordProposalRevisionV1(proposalState(), input(overrides))).toMatchObject({
            kind: "rejected",
            error: { code: "INVALID_ARGUMENT" }
        });
    });
    it("rejects duplicate revision IDs", () => {
        const state = proposalState();
        state.proposals = [
            {
                id: "rev-1",
                proposalId: "prop",
                ordinal: 1,
                actorId: "contributor",
                agendaId: "a",
                summary: "x",
                body: "x",
                evidenceIds: ["v"],
                createdAt: 0
            }
        ];
        expect(recordProposalRevisionV1(state, input())).toMatchObject({
            kind: "rejected",
            error: { code: "INVALID_ARGUMENT" }
        });
    });
    it.each([undefined, "rev-other"] as const)("rejects predecessor %s", (predecessor) => {
        const state = proposalState();
        if (predecessor === "rev-other")
            state.proposals = [
                {
                    id: "rev-other",
                    proposalId: "other",
                    ordinal: 1,
                    actorId: "contributor",
                    agendaId: "a",
                    summary: "x",
                    body: "x",
                    evidenceIds: ["v"],
                    createdAt: 0
                }
            ];
        const result = recordProposalRevisionV1(
            state,
            input({ revisionId: "rev-2", supersedesRevisionId: predecessor ?? "rev-1" })
        );
        expect(result).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
    });
    it.each(["paused"] as const)("rejects %s lifecycle", (status) => {
        expect(recordProposalRevisionV1(validState(status), input())).toMatchObject({
            kind: "rejected",
            error: { code: "INVALID_STATE" }
        });
    });
    it.each(["terminal"] as const)("rejects %s lifecycle as terminal", (status) => {
        expect(recordProposalRevisionV1(validState(status), input())).toMatchObject({
            kind: "rejected",
            error: { code: "MEETING_TERMINAL" }
        });
    });
    it("keeps authorization and shape ahead of lifecycle", () => {
        expect(
            recordProposalRevisionV1(
                validState("paused"),
                input({ actor: { kind: "identity", id: "manager" } })
            )
        ).toMatchObject({ error: { code: "UNAUTHORIZED" } });
        expect(
            recordProposalRevisionV1(validState("paused"), input({ revisionId: "" }))
        ).toMatchObject({ error: { code: "INVALID_ARGUMENT" } });
    });
});

describe("outcome proposal revisions", () => {
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
            actor: { kind: "identity"; id: string } | { kind: "local_controller"; id: string },
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
            ["captain", { kind: "identity", id: "captain" }],
            ["local", { kind: "local_controller", id: "local" }]
        ] as const)("accept succeeds with %s", (_name, actor) => {
            const state = riskState();
            const before = structuredClone(state);
            const result = disposeRiskV1(state, input(actor));
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
                disposeRiskV1(
                    state,
                    input({ kind: "identity", id: "captain" }, { action: "reject" })
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
            expect(disposeRiskV1(state, input({ kind: "identity", id: "captain" }))).toMatchObject({
                kind: "accepted"
            });
        });
        it("rejects excessive accept and unsatisfied affected constraints", () => {
            const state = riskState();
            state.objective.acceptableRiskLevel = "low";
            state.issues[0].riskLevel = "high";
            state.objective.hardConstraints = [{ id: "c", text: "constraint", status: "pending" }];
            state.issues[0].affectedConstraintIds = ["c"];
            expect(disposeRiskV1(state, input({ kind: "identity", id: "captain" }))).toMatchObject({
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
            expect(disposeRiskV1(state, input({ kind: "identity", id: "captain" }))).toMatchObject({
                error: { code: "PRECONDITION_FAILED" },
                state,
                relatedIds: [],
                effectRequests: []
            });
        });
        it.each(["contributor"] as const)("rejects %s actor", (id) => {
            const state = riskState();
            expect(disposeRiskV1(state, input({ kind: "identity", id }))).toMatchObject({
                error: { code: "UNAUTHORIZED" },
                state,
                relatedIds: [],
                effectRequests: []
            });
        });
        it.each(["resolved", "deferred"] as const)("rejects %s issue", (status) => {
            const state = riskState();
            state.issues[0].status = status;
            if (status === "resolved" || status === "out_of_scope")
                state.issues[0].blocking = false;
            if (status === "out_of_scope") state.issues[0].classification = "out_of_scope";
            expect(disposeRiskV1(state, input({ kind: "identity", id: "captain" }))).toMatchObject({
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
                disposeRiskV1(state, input({ kind: "identity", id: "captain" }, overrides))
            ).toMatchObject({ error: { code }, state, relatedIds: [], effectRequests: [] });
        });
        it("distinguishes an unpublished evidence version", () => {
            const state = riskState();
            state.evidencePackages[0].versions.push({
                ...state.evidencePackages[0].versions[0],
                id: "v2",
                ordinal: 2
            });
            expect(
                disposeRiskV1(
                    state,
                    input({ kind: "identity", id: "captain" }, { evidenceIds: ["v2"] })
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
            const first = disposeRiskV1(state, input({ kind: "identity", id: "captain" }));
            expect(first.kind).toBe("accepted");
            if (first.kind !== "accepted") return;
            const second = disposeRiskV1(
                first.state,
                input(
                    { kind: "identity", id: "captain" },
                    { dispositionId: "rd2", action: "reject", now: 2 }
                )
            );
            expect(second.kind).toBe("accepted");
            if (second.kind !== "accepted") return;
            const third = disposeRiskV1(
                second.state,
                input({ kind: "identity", id: "captain" }, { dispositionId: "rd3", now: 3 })
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
            expect(disposeRiskV1(state, input({ kind: "identity", id: "captain" }))).toMatchObject({
                error: { code: "INVALID_STATE" },
                state,
                relatedIds: [],
                effectRequests: []
            });
        });
        it.each(["terminal"] as const)("rejects terminal lifecycle %s", (status) => {
            const state = validState(status);
            state.issues = riskState().issues;
            expect(disposeRiskV1(state, input({ kind: "identity", id: "captain" }))).toMatchObject({
                error: { code: "MEETING_TERMINAL" },
                state,
                relatedIds: [],
                effectRequests: []
            });
        });
        it("keeps authorization and shape ahead of lifecycle", () => {
            const state = riskState();
            state.lifecycle = { ...state.lifecycle, status: "paused" };
            expect(disposeRiskV1(state, input({ kind: "identity", id: "manager" }))).toMatchObject({
                error: { code: "UNAUTHORIZED" },
                state
            });
            expect(
                disposeRiskV1(
                    state,
                    input({ kind: "identity", id: "captain" }, { dispositionId: "" })
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
            const result = submitCompletionDeclarationV1(state, declarationInput(actor));
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
            state.objective.acceptanceCriteria = [
                { id: "c", text: "criterion", status: "pending" }
            ];
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
                submitCompletionDeclarationV1(
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
                submitCompletionDeclarationV1(state, declarationInput({ kind: "identity", id }))
            ).toMatchObject({
                error: { code: "UNAUTHORIZED" },
                state,
                relatedIds: [],
                effectRequests: []
            });
        });
        it("rejects captain without contributor role and local controller", () => {
            const state = declarationState();
            state.identities[0].roles = ["captain"];
            expect(
                submitCompletionDeclarationV1(
                    state,
                    declarationInput({ kind: "identity", id: "captain" })
                )
            ).toMatchObject({ error: { code: "UNAUTHORIZED" }, state });
            expect(
                submitCompletionDeclarationV1(
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
                submitCompletionDeclarationV1(
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
                ordinal: 2
            });
            expect(
                submitCompletionDeclarationV1(
                    state,
                    declarationInput(
                        { kind: "identity", id: "contributor" },
                        { evidenceIds: ["v2"] }
                    )
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
                    submitCompletionDeclarationV1(
                        state,
                        declarationInput(
                            { kind: "identity", id: "contributor" },
                            { taskId: "task" }
                        )
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
                submitCompletionDeclarationV1(
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
                submitCompletionDeclarationV1(
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
                submitCompletionDeclarationV1(
                    state,
                    declarationInput({ kind: "identity", id: "manager" })
                )
            ).toMatchObject({ error: { code: "UNAUTHORIZED" }, state });
            expect(
                submitCompletionDeclarationV1(
                    state,
                    declarationInput({ kind: "identity", id: "contributor" }, { declarationId: "" })
                )
            ).toMatchObject({ error: { code: "INVALID_ARGUMENT" }, state });
        });
    });

    it.each(["paused"] as const)(
        "all outcome families reject non-running %s with exact precedence",
        (status) => {
            const state = validState(status);
            const actor = { kind: "identity", id: "captain" } as const;
            const calls = [
                () =>
                    recordPositionV1(state, {
                        positionId: "p",
                        proposalRevisionId: "r",
                        stance: "support",
                        rationale: "x",
                        evidenceIds: ["v"],
                        actor,
                        now: 1
                    }),
                () =>
                    recordDecisionCandidateV1(state, {
                        candidateId: "c",
                        proposalRevisionId: "r",
                        outcome: "adopt",
                        rationale: "x",
                        evidenceIds: ["v"],
                        positionIds: ["p"],
                        actor,
                        now: 1
                    }),
                () => decideV1(state, { decisionId: "d", candidateId: "c", actor, now: 1 }),
                () =>
                    changeDecisionV1(state, {
                        decisionId: "d",
                        status: "revoked",
                        rationale: "x",
                        evidenceIds: ["v"],
                        actor,
                        now: 1
                    }),
                () =>
                    disposeRiskV1(state, {
                        dispositionId: "r",
                        issueId: "i",
                        action: "reject",
                        scope: "x",
                        rationale: "x",
                        evidenceIds: ["v"],
                        actor,
                        now: 1
                    }),
                () =>
                    submitCompletionDeclarationV1(state, {
                        declarationId: "d",
                        outputId: "o",
                        statement: "x",
                        evidenceIds: ["v"],
                        actor,
                        now: 1
                    }),
                () =>
                    recordCompletionFactV1(state, {
                        factId: "f",
                        outputId: "o",
                        statement: "x",
                        rationale: "x",
                        evidenceIds: ["v"],
                        decisionIds: ["d"],
                        actor,
                        now: 1
                    }),
                () =>
                    changeCompletionFactV1(state, {
                        factId: "f",
                        status: "revoked",
                        rationale: "x",
                        actor,
                        now: 1
                    })
            ];
            for (const call of calls)
                expect(call()).toMatchObject({
                    kind: "rejected",
                    state,
                    relatedIds: [],
                    effectRequests: [],
                    error: { code: "INVALID_STATE" }
                });
        }
    );

    it("derives no pending candidates in terminal lifecycle", () => {
        const state = validState("terminal");
        expect(pendingDecisionCandidatesV1(state)).toEqual([]);
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

    it("returns true for a valid active fact backed by an accepted adopt decision", () => {
        const state = validState();
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
        state.completionFacts = [
            {
                id: "fact",
                outputId: "o",
                actorId: "captain",
                status: "active",
                statement: "done",
                rationale: "dec",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        expect(isObjectiveSatisfiedV1(state)).toBe(true);
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
        const result = recordCompletionFactV1(state, {
            factId: "fact",
            outputId: "o",
            criterionId: "criterion",
            statement: "complete",
            rationale: "accepted decision",
            evidenceIds: ["v"],
            decisionIds: ["dec"],
            actor: { kind: "identity", id: "captain" },
            now: 7
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.objective.requiredOutputs[0].status).toBe("satisfied");
        expect(result.state.objective.acceptanceCriteria[0].status).toBe("satisfied");
        expect(result.state.lifecycle).toMatchObject({
            status: "converging",
            changedAt: 7,
            changedBy: "captain",
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
        const result = recordCompletionFactV1(state, {
            factId: "fact",
            outputId: "o",
            statement: "complete",
            rationale: "accepted decision",
            evidenceIds: ["v"],
            decisionIds: ["dec"],
            actor: { kind: "identity", id: "captain" },
            now: 7
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.lifecycle.status).toBe("running");
        expect(result.state.completionFacts).toHaveLength(1);
    });

    it("revoking the last valid fact returns its target to pending while running", () => {
        const state = validState();
        state.objective = {
            ...state.objective,
            hardConstraints: [{ id: "constraint", text: "constraint", status: "pending" }]
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
        state.completionFacts = [
            {
                id: "fact",
                outputId: "o",
                actorId: "captain",
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
        const result = changeCompletionFactV1(state, {
            factId: "fact",
            status: "revoked",
            rationale: "withdraw",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.objective.requiredOutputs[0].status).toBe("pending");
        expect(result.state.lifecycle.status).toBe("running");
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
                actorId: "captain",
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
        const result = recordProposalRevisionV1(state, {
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

function decisionReadyState() {
    const state = validState();
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
    state.positions = [
        {
            id: "pos",
            proposalRevisionId: "rev",
            actorId: "contributor",
            stance: "support",
            rationale: "x",
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
            positionIds: ["pos"],
            createdAt: 0
        }
    ];
    return state;
}

describe("decision gates", () => {
    it("decides with captain and local controller while copying candidate fields", () => {
        for (const actor of [
            { kind: "identity", id: "captain" },
            { kind: "local_controller", id: "contributor" }
        ] as const) {
            const state = decisionReadyState();
            const before = structuredClone(state);
            const result = decideV1(state, {
                decisionId: "dec",
                candidateId: "cand",
                actor,
                now: 1
            });
            expect(result).toMatchObject({
                kind: "accepted",
                relatedIds: ["dec", "cand"],
                effectRequests: []
            });
            if (result.kind !== "accepted") continue;
            const decision = result.state.decisions[0];
            const candidate = state.decisionCandidates[0];
            expect(decision).toMatchObject({
                ...candidate,
                id: "dec",
                candidateId: "cand",
                status: "accepted",
                actorId: candidate.actorId
            });
            expect(result.state.version).toBe(2);
            expect(result.state.updatedAt).toBe(1);
            expect(pendingDecisionCandidatesV1(result.state)).toEqual([]);
            expect(state).toEqual(before);
        }
    });
    const decidedState = () => {
        const state = decisionReadyState();
        state.decisionCandidates.push({
            ...state.decisionCandidates[0],
            id: "replacement",
            rationale: "replacement"
        });
        const result = decideV1(state, {
            decisionId: "old-decision",
            candidateId: "cand",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        if (result.kind !== "accepted") throw new Error("fixture decision failed");
        return result.state;
    };
    it.each([
        ["captain", { kind: "identity", id: "captain" }],
        ["local", { kind: "local_controller", id: "captain" }]
    ] as const)("supersedes atomically with %s", (_name, actor) => {
        const state = decidedState();
        const before = structuredClone(state);
        const result = changeDecisionV1(state, {
            decisionId: "old-decision",
            status: "superseded",
            replacementCandidateId: "replacement",
            replacementDecisionId: "new-decision",
            rationale: "replace",
            evidenceIds: ["v"],
            actor,
            now: 2
        });
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["old-decision", "new-decision", "replacement", "v"],
            effectRequests: []
        });
        if (result.kind !== "accepted") return;
        expect(result.state.decisions.map((d) => [d.id, d.status])).toEqual([
            ["old-decision", "superseded"],
            ["new-decision", "accepted"]
        ]);
        expect(result.state.decisions[1]).toMatchObject({
            ...state.decisionCandidates[1],
            id: "new-decision",
            candidateId: "replacement",
            status: "accepted",
            replacesDecisionId: "old-decision"
        });
        expect(result.state.version).toBe(3);
        expect(result.state.updatedAt).toBe(2);
        expect(state).toEqual(before);
    });
    it.each(["contributor"] as const)("rejects %s decision actors", (id) => {
        const state = decisionReadyState();
        const decideResult = decideV1(state, {
            decisionId: "d",
            candidateId: "cand",
            actor: { kind: "identity", id },
            now: 1
        });
        expect(decideResult).toMatchObject({
            error: { code: "UNAUTHORIZED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
        const changeState = decidedState();
        const changeResult = changeDecisionV1(changeState, {
            decisionId: "d",
            status: "revoked",
            rationale: "x",
            evidenceIds: ["v"],
            actor: { kind: "identity", id },
            now: 1
        });
        expect(changeResult).toMatchObject({
            error: { code: "UNAUTHORIZED" },
            state: changeState,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("rejects decision discriminant shapes and preserves state", () => {
        const state = decisionReadyState();
        expect(
            changeDecisionV1(state, {
                decisionId: "d",
                status: "revoked",
                rationale: "x",
                evidenceIds: ["v"],
                replacementCandidateId: "c",
                actor: { kind: "identity", id: "captain" },
                now: 1
            } as never)
        ).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            state,
            relatedIds: [],
            effectRequests: []
        });
        expect(
            decideV1(state, {
                decisionId: "",
                candidateId: "cand",
                actor: { kind: "identity", id: "captain" },
                now: 1
            })
        ).toMatchObject({ error: { code: "INVALID_ARGUMENT" }, state });
    });
    it("keeps converging pending candidates empty", () => {
        const state = decisionReadyState();
        state.lifecycle = { ...state.lifecycle, status: "converging" };
        state.decisionCandidates = [state.decisionCandidates[0]];
        expect(pendingDecisionCandidatesV1(state)).toEqual([]);
    });
    it.each([
        [
            "missing candidate",
            () =>
                decideV1(decisionReadyState(), {
                    decisionId: "d",
                    candidateId: "missing",
                    actor: { kind: "identity", id: "captain" },
                    now: 1
                }),
            "NOT_FOUND"
        ],
        [
            "duplicate decision",
            () => {
                const s = decisionReadyState();
                s.decisions = [
                    { ...s.decisionCandidates[0], id: "d", candidateId: "cand", status: "accepted" }
                ];
                return decideV1(s, {
                    decisionId: "d",
                    candidateId: "cand",
                    actor: { kind: "identity", id: "captain" },
                    now: 1
                });
            },
            "INVALID_ARGUMENT"
        ]
    ] as const)("decide %s", (_name, call, code) =>
        expect(call()).toMatchObject({
            kind: "rejected",
            error: { code },
            relatedIds: [],
            effectRequests: []
        })
    );
    it.each(["used candidate", "same revision accepted", "old revision candidate"] as const)(
        "decide rejects %s precondition",
        (kind) => {
            const state = decisionReadyState();
            if (kind === "used candidate") {
                state.decisions = [
                    {
                        ...state.decisionCandidates[0],
                        id: "used",
                        candidateId: "cand",
                        status: "accepted"
                    }
                ];
            } else if (kind === "same revision accepted") {
                state.decisionCandidates.push({ ...state.decisionCandidates[0], id: "other" });
                state.decisions = [
                    {
                        ...state.decisionCandidates[1],
                        id: "other-decision",
                        candidateId: "other",
                        status: "accepted"
                    }
                ];
            } else {
                state.proposals.push({
                    ...state.proposals[0],
                    id: "new-rev",
                    ordinal: 2,
                    supersedesRevisionId: "rev"
                });
            }
            const result = decideV1(state, {
                decisionId: "new-decision",
                candidateId: "cand",
                actor: { kind: "identity", id: "captain" },
                now: 1
            });
            expect(result).toMatchObject({
                kind: "rejected",
                error: { code: "PRECONDITION_FAILED" },
                state,
                relatedIds: [],
                effectRequests: []
            });
        }
    );
    it.each(["revoked", "superseded"] as const)("change rejects old %s", (status) => {
        const state = decidedState();
        state.decisions[0].status = status;
        expect(
            changeDecisionV1(state, {
                decisionId: "old-decision",
                status: "revoked",
                rationale: "x",
                evidenceIds: ["v"],
                actor: { kind: "identity", id: "captain" },
                now: 2
            })
        ).toMatchObject({
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["paused"] as const)("decision lifecycle %s", (status) => {
        const state = decisionReadyState();
        state.lifecycle = { ...state.lifecycle, status };
        const result = decideV1(state, {
            decisionId: "d",
            candidateId: "cand",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(result).toMatchObject({
            error: { code: "INVALID_STATE" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["terminal"] as const)("decision terminal lifecycle %s", (status) => {
        const state = validState(status);
        const result = decideV1(state, {
            decisionId: "d",
            candidateId: "cand",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(result).toMatchObject({
            error: { code: "MEETING_TERMINAL" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["terminal"] as const)("change terminal lifecycle %s", (status) => {
        const state = validState(status);
        expect(
            changeDecisionV1(state, {
                decisionId: "missing",
                status: "revoked",
                rationale: "x",
                evidenceIds: ["v"],
                actor: { kind: "identity", id: "captain" },
                now: 2
            })
        ).toMatchObject({
            error: { code: "MEETING_TERMINAL" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
});

describe("decision change corrective gates", () => {
    const decidedState = () => {
        const state = decisionReadyState();
        state.decisionCandidates.push({
            ...state.decisionCandidates[0],
            id: "replacement",
            rationale: "replacement"
        });
        const result = decideV1(state, {
            decisionId: "old-decision",
            candidateId: "cand",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        if (result.kind !== "accepted") throw new Error("fixture decision failed");
        return result.state;
    };
    const change = (state: MeetingState, overrides: Record<string, unknown> = {}) =>
        changeDecisionV1(state, {
            decisionId: "old-decision",
            status: "revoked",
            rationale: "x",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 2,
            ...overrides
        } as never);
    it.each([
        ["empty", [], "INVALID_ARGUMENT"],
        ["duplicate", ["v", "v"], "INVALID_ARGUMENT"],
        ["missing", ["missing"], "NOT_FOUND"],
        ["unpublished", ["v2"], "PRECONDITION_FAILED"]
    ] as const)("change evidence %s", (_name, evidenceIds, code) => {
        const state = decidedState();
        if (_name === "unpublished")
            state.evidencePackages[0].versions.push({
                ...state.evidencePackages[0].versions[0],
                id: "v2",
                ordinal: 2
            });
        expect(change(state, { evidenceIds })).toMatchObject({
            kind: "rejected",
            error: { code },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("rejects replacement candidate target variants", () => {
        const base = decidedState();
        expect(
            change(base, {
                status: "superseded",
                replacementCandidateId: "missing",
                replacementDecisionId: "new"
            })
        ).toMatchObject({ error: { code: "NOT_FOUND" } });
        for (const variant of ["cross-proposal", "noncurrent"] as const) {
            const state = decidedState();
            state.proposals.push({
                ...state.proposals[0],
                id: "rev-2",
                proposalId: variant === "cross-proposal" ? "other" : "prop",
                ordinal: variant === "cross-proposal" ? 1 : 2,
                ...(variant === "cross-proposal" ? {} : { supersedesRevisionId: "rev" })
            });
            if (variant === "cross-proposal") {
                state.positions.push({
                    ...state.positions[0],
                    id: "pos-2",
                    proposalRevisionId: "rev-2"
                });
            }
            state.decisionCandidates.push({
                ...state.decisionCandidates[1],
                id: "variant",
                proposalRevisionId: variant === "cross-proposal" ? "rev-2" : "rev",
                positionIds: variant === "cross-proposal" ? ["pos-2"] : ["pos"]
            });
            const result = change(state, {
                status: "superseded",
                replacementCandidateId: "variant",
                replacementDecisionId: "new"
            });
            expect(result).toMatchObject({
                error: { code: "PRECONDITION_FAILED" },
                state,
                relatedIds: [],
                effectRequests: []
            });
        }
    });
    it("rejects a replacement revision that already has an accepted decision", () => {
        const state = decidedState();
        state.proposals.push({
            ...state.proposals[0],
            id: "rev-2",
            ordinal: 2,
            supersedesRevisionId: "rev"
        });
        state.positions.push({ ...state.positions[0], id: "pos-2", proposalRevisionId: "rev-2" });
        state.decisionCandidates.push({
            ...state.decisionCandidates[0],
            id: "used-revision-candidate",
            proposalRevisionId: "rev-2",
            positionIds: ["pos-2"]
        });
        state.decisions.push({
            ...state.decisionCandidates[2],
            id: "used-revision-decision",
            candidateId: "used-revision-candidate",
            status: "accepted"
        });
        state.decisionCandidates.push({
            ...state.decisionCandidates[0],
            id: "replacement-revision-candidate",
            proposalRevisionId: "rev-2",
            positionIds: ["pos-2"]
        });
        const result = change(state, {
            status: "superseded",
            replacementCandidateId: "replacement-revision-candidate",
            replacementDecisionId: "new"
        });
        expect(result).toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("rejects a replacement candidate already used by any decision", () => {
        const state = decidedState();
        state.decisions.push({
            ...state.decisionCandidates[1],
            id: "used-replacement",
            candidateId: "replacement",
            status: "revoked"
        });
        expect(
            change(state, {
                status: "superseded",
                replacementCandidateId: "replacement",
                replacementDecisionId: "new"
            })
        ).toMatchObject({
            error: { code: "PRECONDITION_FAILED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["old-decision"] as const)("rejects replacement decision id %s", (decisionId) => {
        const state = decidedState();
        state.decisions.push({ ...state.decisions[0], id: "new" });
        expect(
            change(state, {
                status: "superseded",
                replacementCandidateId: "replacement",
                replacementDecisionId: decisionId
            })
        ).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each([
        ["missing candidate", { replacementCandidateId: undefined, replacementDecisionId: "new" }],
        [
            "missing decision",
            { replacementCandidateId: "replacement", replacementDecisionId: undefined }
        ],
        ["revoke candidate", { status: "revoked", replacementCandidateId: "replacement" }],
        ["revoke decision", { status: "revoked", replacementDecisionId: "new" }],
        ["unknown status", { status: "unknown" }]
    ] as const)("rejects discriminant %s", (_name, overrides) =>
        expect(change(decidedState(), overrides)).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            relatedIds: [],
            effectRequests: []
        })
    );
    it("keeps Captain and local revoke independent and immutable", () => {
        for (const actor of [
            { kind: "identity", id: "captain" },
            { kind: "local_controller", id: "captain" }
        ] as const) {
            const state = decidedState();
            const before = structuredClone(state);
            const result = change(state, { actor });
            expect(result).toMatchObject({
                kind: "accepted",
                relatedIds: ["old-decision", "v"],
                effectRequests: []
            });
            expect(state).toEqual(before);
        }
    });
    it.each(["paused"] as const)("change lifecycle %s", (status) => {
        const state = decidedState();
        state.lifecycle = { ...state.lifecycle, status };
        expect(change(state)).toMatchObject({
            error: { code: "INVALID_STATE" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("keeps change authorization and shape ahead of lifecycle", () => {
        const paused = validState("paused");
        expect(
            changeDecisionV1(paused, {
                decisionId: "missing",
                status: "revoked",
                rationale: "x",
                evidenceIds: ["v"],
                actor: { kind: "identity", id: "manager" },
                now: 1
            })
        ).toMatchObject({
            error: { code: "UNAUTHORIZED" },
            state: paused,
            relatedIds: [],
            effectRequests: []
        });
        expect(
            changeDecisionV1(paused, {
                decisionId: "",
                status: "revoked",
                rationale: "x",
                evidenceIds: ["v"],
                actor: { kind: "identity", id: "captain" },
                now: 1
            })
        ).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            state: paused,
            relatedIds: [],
            effectRequests: []
        });
    });
});

describe("position candidate and pending gates", () => {
    const ready = () => {
        const state = validState();
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
        return state;
    };
    const positionInput = (
        actor = { kind: "identity", id: "contributor" } as const,
        overrides: Record<string, unknown> = {}
    ) => ({
        positionId: "pos",
        proposalRevisionId: "rev",
        stance: "support",
        rationale: "x",
        evidenceIds: ["v"],
        actor,
        now: 1,
        ...overrides
    });
    const candidateInput = (
        actor = { kind: "identity", id: "contributor" } as const,
        overrides: Record<string, unknown> = {}
    ) => ({
        candidateId: "cand",
        proposalRevisionId: "rev",
        outcome: "adopt",
        rationale: "x",
        evidenceIds: ["v"],
        positionIds: ["pos"],
        actor,
        now: 1,
        ...overrides
    });

    it("accepts current Position with exact bookkeeping and immutable input", () => {
        const state = ready();
        const before = structuredClone(state);
        const result = recordPositionV1(state, positionInput());
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["pos", "rev", "v"],
            effectRequests: []
        });
        if (result.kind !== "accepted") return;
        expect(result.state.version).toBe(2);
        expect(result.state.updatedAt).toBe(1);
        expect(state).toEqual(before);
        expect(state.positions).toEqual([]);
    });
    it("accepts current Candidate without status or Decision and preserves related order", () => {
        const state = ready();
        const position = recordPositionV1(state, positionInput());
        expect(position.kind).toBe("accepted");
        if (position.kind !== "accepted") return;
        const result = recordDecisionCandidateV1(position.state, candidateInput());
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["cand", "rev", "pos", "v"],
            effectRequests: []
        });
        if (result.kind !== "accepted") return;
        expect(result.state.decisionCandidates[0]).not.toHaveProperty("status");
        expect(result.state.decisions).toEqual([]);
        expect(result.state.version).toBe(3);
    });
    it.each([
        ["missing evidence", ["missing"], "NOT_FOUND"],
        ["unpublished evidence", ["v2"], "PRECONDITION_FAILED"],
        ["empty evidence", [], "INVALID_ARGUMENT"],
        ["duplicate evidence", ["v", "v"], "INVALID_ARGUMENT"]
    ] as const)("Position evidence %s", (_name, evidenceIds, code) => {
        const state = ready();
        if (_name === "unpublished evidence")
            state.evidencePackages[0].versions.push({
                ...state.evidencePackages[0].versions[0],
                id: "v2",
                ordinal: 2
            });
        const result = recordPositionV1(
            state,
            positionInput({ kind: "identity", id: "contributor" }, { evidenceIds })
        );
        expectRejected(result, state, code);
    });
    it.each(["paused"] as const)("Position/Candidate reject %s", (status) => {
        const state = ready();
        state.lifecycle = { ...state.lifecycle, status };
        expect(recordPositionV1(state, positionInput())).toMatchObject({
            error: { code: "INVALID_STATE" }
        });
        expect(recordDecisionCandidateV1(state, candidateInput())).toMatchObject({
            error: { code: "INVALID_STATE" }
        });
    });
    it.each(["terminal"] as const)("Position/Candidate reject terminal %s", (status) => {
        const state = validState(status);
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
        expect(recordPositionV1(state, positionInput())).toMatchObject({
            error: { code: "MEETING_TERMINAL" }
        });
        expect(recordDecisionCandidateV1(state, candidateInput())).toMatchObject({
            error: { code: "MEETING_TERMINAL" }
        });
    });
    it("derives pending candidates only for current unused revisions without mutating state", () => {
        const state = ready();
        const positions = state.positions;
        state.proposals.push({ ...state.proposals[0], id: "old", ordinal: 0 });
        state.decisionCandidates = [
            {
                id: "used",
                proposalRevisionId: "rev",
                actorId: "contributor",
                outcome: "adopt",
                rationale: "x",
                evidenceIds: ["v"],
                positionIds: ["pos"],
                createdAt: 0
            }
        ];
        state.decisions = [
            { ...state.decisionCandidates[0], candidateId: "used", status: "accepted" }
        ];
        const before = structuredClone(state);
        expect(pendingDecisionCandidatesV1(state)).toEqual([]);
        expect(state).toEqual(before);
        expect(state.positions).toBe(positions);
    });
    it("keeps precedence authorization and shape ahead of lifecycle for both writes", () => {
        const state = ready();
        state.lifecycle = { ...state.lifecycle, status: "paused" };
        expect(
            recordPositionV1(state, positionInput({ kind: "identity", id: "manager" }))
        ).toMatchObject({ error: { code: "UNAUTHORIZED" } });
        expect(
            recordPositionV1(
                state,
                positionInput({ kind: "identity", id: "contributor" }, { positionId: "" })
            )
        ).toMatchObject({ error: { code: "INVALID_ARGUMENT" } });
        expect(
            recordDecisionCandidateV1(state, candidateInput({ kind: "identity", id: "manager" }))
        ).toMatchObject({ error: { code: "UNAUTHORIZED" } });
        expect(
            recordDecisionCandidateV1(
                state,
                candidateInput({ kind: "identity", id: "contributor" }, { candidateId: "" })
            )
        ).toMatchObject({ error: { code: "INVALID_ARGUMENT" } });
    });
    it("accepts captain Position and Candidate writes", () => {
        const state = ready();
        const position = recordPositionV1(
            state,
            positionInput({ kind: "identity", id: "captain" })
        );
        expect(position).toMatchObject({ kind: "accepted" });
        if (position.kind !== "accepted") return;
        const candidate = recordDecisionCandidateV1(
            position.state,
            candidateInput({ kind: "identity", id: "captain" })
        );
        expect(candidate).toMatchObject({
            kind: "accepted",
            relatedIds: ["cand", "rev", "pos", "v"],
            effectRequests: []
        });
    });
    it.each([
        ["manager", { kind: "identity", id: "manager" }],
        ["reviewer", { kind: "identity", id: "reviewer" }],
        ["local_controller", { kind: "local_controller", id: "local" }]
    ] as const)("rejects %s for Position and Candidate independently", (_name, actor) => {
        const state = ready();
        const p = recordPositionV1(state, positionInput(actor as never));
        expect(p).toMatchObject({
            kind: "rejected",
            error: { code: "UNAUTHORIZED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
        const withPosition = ready();
        withPosition.positions = [
            {
                id: "pos",
                proposalRevisionId: "rev",
                actorId: "contributor",
                stance: "support",
                rationale: "x",
                evidenceIds: ["v"],
                createdAt: 0
            }
        ];
        const c = recordDecisionCandidateV1(withPosition, candidateInput(actor as never));
        expect(c).toMatchObject({
            kind: "rejected",
            error: { code: "UNAUTHORIZED" },
            state: withPosition,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each([
        ["missing", ["missing"], "NOT_FOUND"],
        ["unpublished", ["v2"], "PRECONDITION_FAILED"],
        ["duplicate", ["v", "v"], "INVALID_ARGUMENT"]
    ] as const)("Candidate evidence %s", (_name, evidenceIds, code) => {
        const state = ready();
        state.positions = [
            {
                id: "pos",
                proposalRevisionId: "rev",
                actorId: "contributor",
                stance: "support",
                rationale: "x",
                evidenceIds: ["v"],
                createdAt: 0
            }
        ];
        if (_name === "unpublished")
            state.evidencePackages[0].versions.push({
                ...state.evidencePackages[0].versions[0],
                id: "v2",
                ordinal: 2
            });
        const result = recordDecisionCandidateV1(state, candidateInput(undefined, { evidenceIds }));
        expect(result).toMatchObject({
            kind: "rejected",
            error: { code },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each([
        ["duplicate", ["pos", "pos"], "INVALID_ARGUMENT"],
        ["missing", ["missing"], "NOT_FOUND"]
    ] as const)("Candidate positionIds %s", (_name, positionIds, code) => {
        const state = ready();
        if (_name !== "missing")
            state.positions = [
                {
                    id: "pos",
                    proposalRevisionId: "rev",
                    actorId: "contributor",
                    stance: "support",
                    rationale: "x",
                    evidenceIds: ["v"],
                    createdAt: 0
                }
            ];
        const result = recordDecisionCandidateV1(state, candidateInput(undefined, { positionIds }));
        expect(result).toMatchObject({
            kind: "rejected",
            error: { code },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("rejects duplicate Position and Candidate IDs", () => {
        const state = ready();
        state.positions = [
            {
                id: "pos",
                proposalRevisionId: "rev",
                actorId: "contributor",
                stance: "support",
                rationale: "x",
                evidenceIds: ["v"],
                createdAt: 0
            }
        ];
        expect(recordPositionV1(state, positionInput())).toMatchObject({
            kind: "rejected",
            error: { code: "INVALID_ARGUMENT" }
        });
        state.decisionCandidates = [
            {
                id: "cand",
                proposalRevisionId: "rev",
                actorId: "contributor",
                outcome: "adopt",
                rationale: "x",
                evidenceIds: ["v"],
                positionIds: ["pos"],
                createdAt: 0
            }
        ];
        expect(recordDecisionCandidateV1(state, candidateInput())).toMatchObject({
            kind: "rejected",
            error: { code: "INVALID_ARGUMENT" }
        });
    });
    it("rejects cross-revision Position and Candidate references", () => {
        const state = ready();
        state.proposals.push({
            ...state.proposals[0],
            id: "rev-2",
            ordinal: 2,
            supersedesRevisionId: "rev"
        });
        state.positions = [
            {
                id: "other-pos",
                proposalRevisionId: "rev",
                actorId: "contributor",
                stance: "support",
                rationale: "x",
                evidenceIds: ["v"],
                createdAt: 0
            }
        ];
        expect(
            recordPositionV1(state, positionInput(undefined, { proposalRevisionId: "rev" }))
        ).toMatchObject({ error: { code: "PRECONDITION_FAILED" } });
        expect(
            recordDecisionCandidateV1(
                state,
                candidateInput(undefined, {
                    proposalRevisionId: "rev-2",
                    positionIds: ["other-pos"]
                })
            )
        ).toMatchObject({ error: { code: "PRECONDITION_FAILED" } });
    });
    it("keeps pending order for running and paused and filters used/old while retaining current unused", () => {
        for (const status of ["running", "paused"] as const) {
            const state = ready();
            state.lifecycle = { ...state.lifecycle, status };
            state.proposals.push({
                ...state.proposals[0],
                id: "old",
                ordinal: 0
            });
            state.decisionCandidates = [
                {
                    id: "old-cand",
                    proposalRevisionId: "old",
                    actorId: "contributor",
                    outcome: "adopt",
                    rationale: "x",
                    evidenceIds: ["v"],
                    positionIds: ["pos"],
                    createdAt: 0
                },
                {
                    id: "used",
                    proposalRevisionId: "rev",
                    actorId: "contributor",
                    outcome: "adopt",
                    rationale: "x",
                    evidenceIds: ["v"],
                    positionIds: ["pos"],
                    createdAt: 1
                },
                {
                    id: "free",
                    proposalRevisionId: "rev",
                    actorId: "contributor",
                    outcome: "reject",
                    rationale: "x",
                    evidenceIds: ["v"],
                    positionIds: ["pos"],
                    createdAt: 2
                }
            ];
            state.decisions = [
                { ...state.decisionCandidates[1], candidateId: "used", status: "accepted" }
            ];
            const before = structuredClone(state);
            const pending = pendingDecisionCandidatesV1(state);
            expect(pending.map((c) => c.id)).toEqual(["free"]);
            expect(state).toEqual(before);
        }
    });
    it.each(["preparing", "converging", "ending", "terminal", "archiving", "archived"] as const)(
        "pending is empty in %s",
        (status) => {
            const state = ready();
            state.lifecycle = { ...state.lifecycle, status };
            state.decisionCandidates = [
                {
                    id: "free",
                    proposalRevisionId: "rev",
                    actorId: "contributor",
                    outcome: "adopt",
                    rationale: "x",
                    evidenceIds: ["v"],
                    positionIds: ["pos"],
                    createdAt: 0
                }
            ];
            expect(pendingDecisionCandidatesV1(state)).toEqual([]);
        }
    );
});

describe("CompletionFact", () => {
    const reviewBreaks = [
        [
            "missing evidence review",
            (s: MeetingState) => {
                s.reviews = [];
                s.reviewDeliveries = [];
                s.publications[0].finalReviewIds = [];
            }
        ],
        [
            "publication omits review",
            (s: MeetingState) => {
                s.publications[0].finalReviewIds = [];
            }
        ],
        [
            "review delivery is not sent",
            (s: MeetingState) => {
                const { sentAt: _sentAt, ...delivery } = s.reviewDeliveries[0];
                s.reviewDeliveries[0] = {
                    ...delivery,
                    status: "failed",
                    failedAt: 1,
                    failureReason: "timeout"
                };
            }
        ],
        [
            "duplicate selected review",
            (s: MeetingState) => {
                s.reviews = [s.reviews[0], { ...s.reviews[0], id: "review-2" }];
            }
        ]
    ] as const;

    it.each(reviewBreaks)("rejects when %s", (_name, mutate) => {
        const state = completionReadyState();
        mutate(state);
        const result = recordCompletionFactV1(state, completionInput());
        expect(result).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
        expect(result.state).toBe(state);
        expect(result.effectRequests).toEqual([]);
        expect(state.completionFacts).toEqual([]);
    });

    it.each([
        [
            "revoked",
            (s: MeetingState) => {
                s.decisions[0].status = "revoked";
            }
        ],
        [
            "non-adopt",
            (s: MeetingState) => {
                s.decisions[0].outcome = "reject";
            }
        ],
        [
            "stale revision",
            (s: MeetingState) => {
                s.proposals.push({
                    ...s.proposals[0],
                    id: "rev-2",
                    ordinal: 2,
                    supersedesRevisionId: "rev"
                });
            }
        ]
    ] as const)("rejects %s decision basis", (_name, mutate) => {
        const state = completionReadyState();
        mutate(state);
        const result = recordCompletionFactV1(state, completionInput());
        expect(result).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
        expect(result.state).toBe(state);
        expect(result.effectRequests).toEqual([]);
        expect(state.completionFacts).toEqual([]);
    });

    it("checks authorization before review preconditions", () => {
        const state = completionReadyState();
        state.publications[0].finalReviewIds = [];
        const result = recordCompletionFactV1(
            state,
            completionInput({ kind: "identity", id: "manager" })
        );
        expect(result).toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(result.state).toBe(state);
    });

    it("rejects a local controller and manager even with a valid review chain", () => {
        for (const actor of [
            { kind: "identity", id: "manager" } as const,
            { kind: "local_controller", id: "local" } as const
        ]) {
            const result = recordCompletionFactV1(
                completionReadyState(),
                completionInput(actor as never)
            );
            expect(result).toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        }
    });

    it("applies the same review and basis gates to replacement facts", () => {
        const state = completionReadyState();
        state.completionFacts = [
            {
                id: "old",
                outputId: "o",
                actorId: "captain",
                status: "active",
                statement: "old",
                rationale: "old",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        state.objective.requiredOutputs[0] = {
            ...state.objective.requiredOutputs[0],
            status: "satisfied"
        };
        state.evidencePackages[0].currentVersionId = "v2";
        state.evidencePackages[0].versions.push({
            ...state.evidencePackages[0].versions[0],
            id: "v2",
            ordinal: 2
        });
        state.publications[0].finalVersionIds = ["v", "v2"];
        state.publications[0].finalReviewIds = ["review"];
        const reviewResult = changeCompletionFactV1(state, {
            factId: "old",
            status: "superseded",
            rationale: "replace",
            replacement: {
                factId: "new",
                outputId: "o",
                statement: "new",
                rationale: "new",
                evidenceIds: ["v2"],
                decisionIds: ["dec"]
            },
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(reviewResult).toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED" }
        });
        const basisState = completionReadyState();
        basisState.completionFacts = [
            {
                id: "old",
                outputId: "o",
                actorId: "captain",
                status: "active",
                statement: "old",
                rationale: "old",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        basisState.objective.requiredOutputs[0] = {
            ...basisState.objective.requiredOutputs[0],
            status: "pending"
        };
        basisState.proposals.push({
            ...basisState.proposals[0],
            id: "rev-2",
            ordinal: 2,
            supersedesRevisionId: "rev"
        });
        const basisResult = changeCompletionFactV1(basisState, {
            factId: "old",
            status: "superseded",
            rationale: "replace",
            replacement: {
                factId: "new",
                outputId: "o",
                statement: "new",
                rationale: "new",
                evidenceIds: ["v"],
                decisionIds: ["dec"]
            },
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(basisResult).toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED" }
        });
    });
    it.each([
        ["missing output", { outputId: "missing" }, "NOT_FOUND"],
        ["missing criterion", { criterionId: "missing" }, "NOT_FOUND"],
        ["missing decision", { decisionIds: ["missing"] }, "NOT_FOUND"],
        ["missing evidence", { evidenceIds: ["missing"] }, "NOT_FOUND"],
        ["duplicate evidence", { evidenceIds: ["v", "v"] }, "INVALID_ARGUMENT"],
        ["empty decision ids", { decisionIds: [] }, "INVALID_ARGUMENT"],
        ["duplicate fact", {}, "INVALID_ARGUMENT"]
    ] as const)("record rejects %s", (_name, overrides, code) => {
        const state = completionReadyState();
        if (_name === "duplicate fact") {
            state.objective.requiredOutputs[0].status = "satisfied";
            state.completionFacts = [
                {
                    id: "fact",
                    outputId: "o",
                    actorId: "captain",
                    status: "active",
                    statement: "existing",
                    rationale: "existing",
                    evidenceIds: ["v"],
                    decisionIds: ["dec"],
                    createdAt: 0
                }
            ];
        }
        expect(recordCompletionFactV1(state, { ...completionInput(), ...overrides })).toMatchObject(
            {
                kind: "rejected",
                error: { code },
                state,
                relatedIds: [],
                effectRequests: []
            }
        );
    });
    it.each([
        ["unknown status", { status: "unknown" }, "INVALID_ARGUMENT"],
        ["missing replacement", { status: "superseded" }, "INVALID_ARGUMENT"],
        [
            "revoke replacement",
            { status: "revoked", replacement: { factId: "new" } },
            "INVALID_ARGUMENT"
        ]
    ] as const)("change rejects %s", (_name, overrides, code) => {
        const state = completionReadyState();
        state.objective.requiredOutputs[0].status = "satisfied";
        state.completionFacts = [
            {
                ...completionInput(),
                actor: undefined,
                status: "active",
                id: "fact",
                actorId: "captain",
                createdAt: 0
            } as never
        ];
        expect(
            changeCompletionFactV1(state, {
                factId: "fact",
                rationale: "x",
                actor: { kind: "identity", id: "captain" },
                now: 1,
                ...overrides
            } as never)
        ).toMatchObject({
            kind: "rejected",
            error: { code },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("keeps completion facts running with a pending hard constraint", () => {
        const state = completionReadyState();
        state.objective.hardConstraints = [{ id: "c", text: "constraint", status: "pending" }];
        const result = recordCompletionFactV1(state, completionInput());
        expect(result).toMatchObject({ kind: "accepted", effectRequests: [] });
        if (result.kind !== "accepted") return;
        expect(result.state.objective.requiredOutputs[0].status).toBe("satisfied");
        expect(result.state.lifecycle.status).toBe("running");
    });
    it.each(["paused"] as const)("record rejects lifecycle %s", (status) => {
        const state = completionReadyState();
        state.lifecycle = { ...state.lifecycle, status };
        expect(recordCompletionFactV1(state, completionInput())).toMatchObject({
            error: { code: "INVALID_STATE" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["terminal"] as const)("record rejects terminal lifecycle %s", (status) => {
        const state = validState(status);
        expect(recordCompletionFactV1(state, completionInput())).toMatchObject({
            error: { code: "MEETING_TERMINAL" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
});

describe("CompletionFact change", () => {
    const ready = () => {
        const state = completionReadyState();
        state.objective.requiredOutputs[0].status = "satisfied";
        state.objective.acceptanceCriteria = [
            { id: "criterion", text: "criterion", status: "satisfied" }
        ];
        state.completionFacts = [
            {
                id: "old",
                outputId: "o",
                criterionId: "criterion",
                actorId: "captain",
                status: "active",
                statement: "old",
                rationale: "old",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        return state;
    };
    const replacement = {
        factId: "new",
        outputId: "o",
        criterionId: "criterion",
        statement: "new",
        rationale: "new",
        evidenceIds: ["v"],
        decisionIds: ["dec"]
    };
    const change = (state: MeetingState, overrides: Record<string, unknown> = {}) =>
        changeCompletionFactV1(state, {
            factId: "old",
            status: "superseded",
            rationale: "replace",
            replacement,
            actor: { kind: "identity", id: "captain" },
            now: 1,
            ...overrides
        } as never);
    it("revokes a valid old fact without appending and preserves history", () => {
        const state = ready();
        const before = structuredClone(state);
        const result = changeCompletionFactV1(state, {
            factId: "old",
            status: "revoked",
            rationale: "revoke",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(result).toMatchObject({ kind: "accepted", relatedIds: ["old"], effectRequests: [] });
        if (result.kind !== "accepted") return;
        expect(result.state.completionFacts).toHaveLength(1);
        expect(result.state.completionFacts[0]).toMatchObject({
            ...before.completionFacts[0],
            status: "revoked"
        });
        expect(result.state.version).toBe(2);
        expect(result.state.updatedAt).toBe(1);
        expect(state).toEqual(before);
    });
    it.each([
        ["missing old", "missing", "NOT_FOUND"],
        ["revoked old", "revoked", "PRECONDITION_FAILED"],
        ["superseded old", "superseded", "PRECONDITION_FAILED"]
    ] as const)("rejects %s with target", (_name, mode, code) => {
        const state = ready();
        if (mode !== "missing") {
            state.completionFacts[0].status = mode;
            state.objective.requiredOutputs[0].status = "pending";
            state.objective.acceptanceCriteria[0].status = "pending";
        }
        expect(
            changeCompletionFactV1(state, {
                factId: mode === "missing" ? "missing" : "old",
                status: "revoked",
                rationale: "x",
                actor: { kind: "identity", id: "captain" },
                now: 1
            })
        ).toMatchObject({ error: { code }, state, relatedIds: [], effectRequests: [] });
    });
    it("supersedes with criterion and exact replacement bookkeeping", () => {
        const state = ready();
        const before = structuredClone(state);
        const result = change(state);
        expect(result).toMatchObject({
            kind: "accepted",
            relatedIds: ["old", "new", "o", "criterion", "dec", "v"],
            effectRequests: []
        });
        if (result.kind !== "accepted") return;
        expect(result.state.completionFacts).toMatchObject([
            { id: "old", status: "superseded" },
            {
                id: "new",
                outputId: "o",
                criterionId: "criterion",
                statement: "new",
                rationale: "new",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                status: "active",
                actorId: "captain",
                supersedesFactId: "old",
                createdAt: 1
            }
        ]);
        expect(result.state.version).toBe(2);
        expect(result.state.updatedAt).toBe(1);
        expect(state).toEqual(before);
    });
    it.each([
        ["missing output", { outputId: "missing" }, "NOT_FOUND", "missing"],
        ["missing criterion", { criterionId: "missing" }, "NOT_FOUND", "missing"],
        ["missing decision", { decisionIds: ["missing"] }, "NOT_FOUND", "missing"],
        ["missing evidence", { evidenceIds: ["missing"] }, "NOT_FOUND", "missing"],
        ["unpublished evidence", { evidenceIds: ["v2"] }, "PRECONDITION_FAILED", undefined]
    ] as const)("replacement typed ref %s", (_name, overrides, code, targetId) => {
        const state = ready();
        if (_name === "unpublished evidence")
            state.evidencePackages[0].versions.push({
                ...state.evidencePackages[0].versions[0],
                id: "v2",
                ordinal: 2
            });
        expect(change(state, { replacement: { ...replacement, ...overrides } })).toMatchObject({
            error: { code },
            ...(targetId ? { relatedIds: [] } : {}),
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each([
        ["unknown", { status: "unknown" }],
        ["missing replacement", { replacement: undefined }],
        ["revoke replacement", { status: "revoked", replacement }],
        ["duplicate replacement", { replacement: { ...replacement, factId: "old" } }],
        ["empty replacement id", { replacement: { ...replacement, factId: "" } }]
    ] as const)("rejects change shape %s", (_name, overrides) => {
        const state = ready();
        expect(change(state, overrides)).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["paused"] as const)("rejects change lifecycle %s", (status) => {
        const state = ready();
        state.lifecycle = { ...state.lifecycle, status };
        expect(change(state)).toMatchObject({
            error: { code: "INVALID_STATE" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it.each(["terminal"] as const)("rejects change terminal lifecycle %s", (status) => {
        const state = validState(status);
        expect(
            changeCompletionFactV1(state, {
                factId: "missing",
                status: "revoked",
                rationale: "x",
                actor: { kind: "identity", id: "captain" },
                now: 1
            })
        ).toMatchObject({
            error: { code: "MEETING_TERMINAL" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
    it("keeps change authorization and shape ahead of lifecycle", () => {
        const state = ready();
        state.lifecycle = { ...state.lifecycle, status: "paused" };
        expect(
            changeCompletionFactV1(state, {
                factId: "old",
                status: "revoked",
                rationale: "x",
                actor: { kind: "identity", id: "manager" },
                now: 1
            })
        ).toMatchObject({
            error: { code: "UNAUTHORIZED" },
            state,
            relatedIds: [],
            effectRequests: []
        });
        expect(
            changeCompletionFactV1(state, {
                factId: "",
                status: "revoked",
                rationale: "x",
                actor: { kind: "identity", id: "captain" },
                now: 1
            })
        ).toMatchObject({
            error: { code: "INVALID_ARGUMENT" },
            state,
            relatedIds: [],
            effectRequests: []
        });
    });
});

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
        const result = changeDecisionV1(state, {
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
        const result = changeDecisionV1(state, {
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
        const result = disposeRiskV1(state, {
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
        const result = disposeRiskV1(state, {
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
        expect(isObjectiveSatisfiedV1(state)).toBe(true);
        expect(state).toEqual(before);
        state.issues[0].blocking = true;
        expect(isObjectiveSatisfiedV1(state)).toBe(false);
    });
    it("recalculation preserves bookkeeping and non-running lifecycle", () => {
        const state = completedFactState();
        state.lifecycle = { ...state.lifecycle, status: "paused" };
        const before = structuredClone(state);
        const result = recalculateMeetingCompletionV1(state, "captain", 9);
        expect(result.version).toBe(before.version);
        expect(result.updatedAt).toBe(before.updatedAt);
        expect(result.objective.hardConstraints).toEqual(before.objective.hardConstraints);
        expect(result.lifecycle).toEqual(before.lifecycle);
    });
});
