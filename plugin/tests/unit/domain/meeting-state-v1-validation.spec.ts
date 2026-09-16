import { describe, expect, it } from "vitest";
import { validateMeetingStateV1 } from "@/domain/meeting-state-v1-validation.js";
import type { MeetingState } from "@/domain/meeting-state-v1.js";

function base(): MeetingState {
    return {
        id: "meeting-1",
        version: 1,
        createdAt: 0,
        updatedAt: 0,
        objective: {
            statement: "x",
            requiredOutputs: [{ id: "output-1", text: "x", status: "pending" }],
            acceptanceCriteria: [{ id: "criterion-1", text: "x", status: "pending" }],
            hardConstraints: [{ id: "constraint-1", text: "x", status: "pending" }],
            acceptableRiskLevel: "medium"
        },
        lifecycle: { status: "running", changedAt: 0, changedBy: "local-1" },
        identities: [
            {
                id: "captain-1",
                displayName: "x",
                roles: ["captain"],
                agendaResponsibilityIds: [],
                reviewResponsibilityIds: [],
                riskAuthority: false,
                required: false
            },
            {
                id: "manager-1",
                displayName: "x",
                roles: ["manager"],
                agendaResponsibilityIds: [],
                reviewResponsibilityIds: [],
                riskAuthority: false,
                required: false
            },
            {
                id: "reviewer-1",
                displayName: "x",
                roles: ["evidence_reviewer"],
                agendaResponsibilityIds: [],
                reviewResponsibilityIds: ["agenda-1"],
                riskAuthority: false,
                required: false
            }
        ],
        agenda: [
            {
                id: "agenda-1",
                title: "x",
                question: "x",
                status: "active",
                requiredOutputIds: ["output-1"],
                requiredReviewerIds: ["reviewer-1"]
            }
        ],
        agendaCandidates: [],
        rounds: [],
        contributions: [],
        completionDeclarations: [],
        evidencePackages: [],
        registrations: [],
        reviews: [],
        reviewDeliveries: [],
        publications: [],
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
            maxFormalMessages: 0,
            maxDurationMs: 0,
            taskDeadlineMs: 0,
            reviewDeadlineMs: 0,
            responseDeadlineMs: 60000
        }
    };
}

function invalidAt(value: unknown, path: string) {
    const result = validateMeetingStateV1(value);
    expect(result).toEqual({ kind: "invalid", code: "INVALID_ARGUMENT", path });
    expect(validateMeetingStateV1(value)).toEqual(result);
}

describe("T1a", () => {
    it("accepts the base fixture by the same state reference", () => {
        const state = base();
        const result = validateMeetingStateV1(state);
        expect(result).toEqual({ kind: "valid", state });
        expect(result.kind === "valid" && result.state).toBe(state);
    });

    it("rejects each required root field when missing or null", () => {
        const fields = [
            "id",
            "version",
            "createdAt",
            "updatedAt",
            "objective",
            "lifecycle",
            "identities",
            "agenda",
            "agendaCandidates",
            "rounds",
            "contributions",
            "completionDeclarations",
            "evidencePackages",
            "registrations",
            "reviews",
            "reviewDeliveries",
            "publications",
            "messages",
            "proposals",
            "positions",
            "decisionCandidates",
            "decisions",
            "questions",
            "issues",
            "riskDispositions",
            "tasks",
            "managerPlans",
            "privateMails",
            "completionFacts",
            "limits"
        ];
        for (const field of fields) {
            const missing = base() as unknown as Record<string, unknown>;
            delete missing[field];
            invalidAt(missing, `$.${field}`);
            invalidAt({ ...base(), [field]: null }, `$.${field}`);
        }
    });

    it("checks scalar and array boundaries", () => {
        invalidAt({ ...base(), id: "  " }, "$.id");
        invalidAt({ ...base(), version: 0 }, "$.version");
        invalidAt({ ...base(), version: -1 }, "$.version");
        invalidAt({ ...base(), version: Number.MAX_SAFE_INTEGER + 1 }, "$.version");
        invalidAt({ ...base(), createdAt: -1 }, "$.createdAt");
        invalidAt({ ...base(), updatedAt: 1.5 }, "$.updatedAt");
        invalidAt(
            { ...base(), lifecycle: { ...base().lifecycle, status: "bad" } },
            "$.lifecycle.status"
        );
        invalidAt(
            { ...base(), lifecycle: { ...base().lifecycle, changedBy: "" } },
            "$.lifecycle.changedBy"
        );
        invalidAt(
            { ...base(), identities: [{ ...base().identities[0], roles: ["bad"] }] },
            "$.identities[0].roles[0]"
        );
        invalidAt(
            { ...base(), agenda: [{ ...base().agenda[0], requiredOutputIds: [""] }] },
            "$.agenda[0].requiredOutputIds[0]"
        );
        invalidAt(
            { ...base(), limits: { ...base().limits, responseDeadlineMs: 0 } },
            "$.limits.responseDeadlineMs"
        );
        for (const field of [
            "maxFormalMessages",
            "maxDurationMs",
            "taskDeadlineMs",
            "reviewDeadlineMs"
        ]) {
            invalidAt(
                { ...base(), limits: { ...base().limits, [field]: -1 } },
                `$.limits.${field}`
            );
        }
        invalidAt({ ...base(), continuation: null }, "$.continuation");
        invalidAt(
            { ...base(), objective: { ...base().objective, statement: "" }, rounds: null },
            "$.objective.statement"
        );
        invalidAt({ ...base(), rounds: null }, "$.rounds");
    });

    it("checks the T1 type additions on issue and termination", () => {
        const issue = {
            id: "issue-1",
            agendaId: "agenda-1",
            description: "x",
            riskLevel: "low",
            classification: "follow_up",
            affectedOutputIds: [],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            requiredReviewerIds: [],
            blocking: false,
            status: "open",
            rationale: "x"
        } as const;
        const issueState = { ...base(), issues: [issue] };
        expect(validateMeetingStateV1(issueState)).toMatchObject({ kind: "valid" });
        for (const field of [
            "affectedOutputIds",
            "affectedCriterionIds",
            "affectedConstraintIds",
            "requiredReviewerIds"
        ]) {
            const missing = { ...issue } as Record<string, unknown>;
            delete missing[field];
            invalidAt({ ...issueState, issues: [missing] }, `$.issues[0].${field}`);
            const broken = { ...issueState, issues: [{ ...issue, [field]: null }] };
            invalidAt(broken, `$.issues[0].${field}`);
        }
        const termination = {
            id: "termination-1",
            outcome: "completed",
            reason: "x",
            endedAt: 0,
            decisionIds: [],
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            unclosedContributionIds: []
        } as const;
        const terminal = {
            ...base(),
            lifecycle: { ...base().lifecycle, status: "terminal" },
            agenda: [{ ...base().agenda[0], status: "completed" }],
            termination
        };
        expect(validateMeetingStateV1(terminal)).toMatchObject({ kind: "valid" });
        const missingTerminationId = { ...termination } as Record<string, unknown>;
        delete missingTerminationId.id;
        invalidAt({ ...terminal, termination: missingTerminationId }, "$.termination.id");
        invalidAt({ ...terminal, termination: { ...termination, id: null } }, "$.termination.id");
    });
});

describe("T1b", () => {
    it("validates candidate, question, issue, and manager plan references", () => {
        const issue = {
            id: "issue-1",
            agendaId: "agenda-1",
            description: "x",
            riskLevel: "low",
            classification: "follow_up",
            affectedOutputIds: ["output-1"],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            requiredReviewerIds: ["reviewer-1"],
            blocking: false,
            status: "open",
            rationale: "x"
        } as const;
        const question = {
            id: "question-1",
            actorId: "manager-1",
            agendaId: "agenda-1",
            text: "x",
            affectedOutputIds: ["output-1"],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            blocking: true,
            status: "open"
        } as const;
        const candidate = {
            id: "candidate-1",
            title: "x",
            reason: "x",
            status: "pending"
        } as const;
        const plan = {
            id: "plan-1",
            agendaId: "agenda-1",
            managerId: "manager-1",
            kind: "open_round",
            rationale: "x",
            createdAt: 0,
            status: "active"
        } as const;
        const state = {
            ...base(),
            issues: [issue],
            questions: [question],
            agendaCandidates: [candidate],
            managerPlans: [plan]
        };
        expect(validateMeetingStateV1(state)).toMatchObject({ kind: "valid" });
        invalidAt(
            { ...state, questions: [{ ...question, agendaId: "output-1" }] },
            "$.questions[0].agendaId"
        );
        invalidAt(
            { ...state, questions: [{ ...question, actorId: "agenda-1" }] },
            "$.questions[0].actorId"
        );
        invalidAt(
            { ...state, issues: [{ ...issue, affectedOutputIds: ["criterion-1"] }] },
            "$.issues[0].affectedOutputIds[0]"
        );
        invalidAt(
            { ...state, issues: [{ ...issue, requiredReviewerIds: ["output-1"] }] },
            "$.issues[0].requiredReviewerIds[0]"
        );
        invalidAt(
            { ...state, managerPlans: [{ ...plan, managerId: "captain-1" }] },
            "$.managerPlans[0].managerId"
        );
    });

    it("rejects duplicate IDs, invalid reviewer responsibility, and multiple active items", () => {
        invalidAt({ ...base(), agenda: [] }, "$.agenda");
        invalidAt(
            {
                ...base(),
                objective: {
                    ...base().objective,
                    requiredOutputs: [
                        { ...base().objective.requiredOutputs[0], id: "output-1" },
                        { ...base().objective.requiredOutputs[0], id: "output-1" }
                    ]
                }
            },
            "$.objective.requiredOutputs[1].id"
        );
        invalidAt(
            {
                ...base(),
                agenda: [{ ...base().agenda[0], requiredOutputIds: ["output-1", "output-1"] }]
            },
            "$.agenda[0].requiredOutputIds[1]"
        );
        invalidAt(
            {
                ...base(),
                identities: [
                    { ...base().identities[0], roles: ["captain", "captain"] },
                    ...base().identities.slice(1)
                ]
            },
            "$.identities[0].roles[1]"
        );
        const duplicateAgenda = {
            ...base(),
            agenda: [...base().agenda, { ...base().agenda[0], id: "agenda-1", status: "pending" }]
        };
        invalidAt(duplicateAgenda, "$.agenda[1].id");
        const duplicateIdentity = {
            ...base(),
            identities: [...base().identities, { ...base().identities[0], id: "captain-1" }]
        };
        invalidAt(duplicateIdentity, "$.identities[3].id");
        const noRole = {
            ...base(),
            identities: base().identities.map((identity) =>
                identity.id === "reviewer-1" ? { ...identity, roles: [] } : identity
            )
        };
        invalidAt(noRole, "$.identities[2].reviewResponsibilityIds[0]");
        invalidAt(
            {
                ...base(),
                identities: base().identities.map((identity) =>
                    identity.id === "manager-1"
                        ? { ...identity, definitionId: "definition-1" }
                        : identity
                )
            },
            "$.identities[1].definitionVersion"
        );
        invalidAt(
            {
                ...base(),
                identities: base().identities.map((identity) =>
                    identity.id === "manager-1"
                        ? { ...identity, definitionId: "definition-1", definitionVersion: "" }
                        : identity
                )
            },
            "$.identities[1].definitionVersion"
        );
        const oneWay = {
            ...base(),
            identities: base().identities.map((identity) =>
                identity.id === "reviewer-1"
                    ? { ...identity, reviewResponsibilityIds: [] }
                    : identity
            )
        };
        invalidAt(oneWay, "$.agenda[0].requiredReviewerIds[0]");
        invalidAt(
            {
                ...base(),
                agenda: [
                    ...base().agenda,
                    {
                        id: "agenda-2",
                        title: "x",
                        question: "x",
                        status: "active",
                        requiredOutputIds: [],
                        requiredReviewerIds: []
                    }
                ]
            },
            "$.agenda[1].status"
        );
        const plan = {
            id: "plan-1",
            agendaId: "agenda-1",
            managerId: "manager-1",
            kind: "open_round",
            rationale: "x",
            createdAt: 0,
            status: "active"
        } as const;
        invalidAt(
            { ...base(), managerPlans: [plan, { ...plan, id: "plan-2" }] },
            "$.managerPlans[1].agendaId"
        );
    });

    it("enforces issue blocking and accepted risk combinations", () => {
        const common = {
            id: "issue-1",
            agendaId: "agenda-1",
            description: "x",
            riskLevel: "low",
            classification: "follow_up",
            affectedOutputIds: [],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            requiredReviewerIds: [],
            blocking: false,
            status: "open",
            rationale: "x"
        } as const;
        invalidAt({ ...base(), issues: [{ ...common, blocking: true }] }, "$.issues[0].blocking");
        invalidAt(
            { ...base(), issues: [{ ...common, riskLevel: "high", blocking: false }] },
            "$.issues[0].blocking"
        );
        invalidAt(
            { ...base(), issues: [{ ...common, classification: "accepted_risk" }] },
            "$.issues[0].classification"
        );
        invalidAt(
            { ...base(), issues: [{ ...common, classification: "blocking", blocking: false }] },
            "$.issues[0].blocking"
        );
        invalidAt(
            { ...base(), issues: [{ ...common, affectedOutputIds: ["output-1", "output-1"] }] },
            "$.issues[0].affectedOutputIds[1]"
        );
        const resolvedBlocking = {
            ...base(),
            issues: [{ ...common, classification: "blocking", blocking: false, status: "resolved" }]
        };
        expect(validateMeetingStateV1(resolvedBlocking)).toMatchObject({ kind: "valid" });
        const deferredBlocking = {
            ...base(),
            issues: [{ ...common, classification: "blocking", blocking: false, status: "deferred" }]
        };
        expect(validateMeetingStateV1(deferredBlocking)).toMatchObject({ kind: "valid" });
        const collisionObjective = {
            ...base().objective,
            requiredOutputs: [
                { ...base().objective.requiredOutputs[0], id: "output-1", status: "satisfied" }
            ],
            acceptanceCriteria: [
                { ...base().objective.acceptanceCriteria[0], id: "output-1", status: "pending" }
            ]
        };
        invalidAt(
            {
                ...base(),
                objective: collisionObjective,
                questions: [
                    {
                        id: "question-1",
                        actorId: "manager-1",
                        agendaId: "agenda-1",
                        text: "x",
                        affectedOutputIds: ["output-1"],
                        affectedCriterionIds: [],
                        affectedConstraintIds: [],
                        blocking: true,
                        status: "open"
                    }
                ]
            },
            "$.questions[0].blocking"
        );
        invalidAt(
            {
                ...base(),
                objective: collisionObjective,
                issues: [{ ...common, affectedOutputIds: ["output-1"], blocking: true }]
            },
            "$.issues[0].blocking"
        );
        invalidAt(
            {
                ...base(),
                questions: [
                    {
                        id: "question-1",
                        actorId: "manager-1",
                        agendaId: "agenda-1",
                        text: "x",
                        affectedOutputIds: [],
                        affectedCriterionIds: [],
                        affectedConstraintIds: [],
                        blocking: true,
                        status: "open"
                    }
                ]
            },
            "$.questions[0].blocking"
        );
        invalidAt(
            {
                ...base(),
                questions: [
                    {
                        id: "question-1",
                        actorId: "manager-1",
                        agendaId: "agenda-1",
                        text: "x",
                        affectedOutputIds: ["output-1"],
                        affectedCriterionIds: [],
                        affectedConstraintIds: [],
                        blocking: true,
                        status: "answered"
                    }
                ]
            },
            "$.questions[0].blocking"
        );
        invalidAt({ ...base(), issues: [{ ...common, blocking: true }] }, "$.issues[0].blocking");
        invalidAt(
            {
                ...base(),
                issues: [
                    {
                        ...common,
                        affectedOutputIds: ["output-1"],
                        status: "resolved",
                        blocking: true
                    }
                ]
            },
            "$.issues[0].blocking"
        );
        invalidAt(
            {
                ...base(),
                issues: [{ ...common, riskLevel: "high", status: "deferred", blocking: false }]
            },
            "$.issues[0].blocking"
        );
    });
});
