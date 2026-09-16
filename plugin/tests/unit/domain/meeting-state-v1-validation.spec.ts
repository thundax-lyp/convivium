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

describe("MeetingState structure", () => {
    it("accepts the base fixture by the same state reference", () => {
        const state = base();
        const result = validateMeetingStateV1(state);
        expect(result).toEqual({ kind: "valid", state });
        expect(result.kind === "valid" && result.state).toBe(state);
    });

    it("rejects representative root and nested shape errors", () => {
        const missingRoot = base() as unknown as Record<string, unknown>;
        delete missingRoot.objective;
        invalidAt(missingRoot, "$.objective");
        invalidAt({ ...base(), objective: null }, "$.objective");
        invalidAt({ ...base(), identities: [null] }, "$.identities[0]");
        invalidAt({ ...base(), version: 0 }, "$.version");
        invalidAt({ ...base(), continuation: undefined }, "$.continuation");
        invalidAt({ ...base(), continuation: null }, "$.continuation");
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

    it("checks required Issue references and Termination ID", () => {
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

describe("MeetingState cross-object rules", () => {
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

function evidenceState() {
    const round = {
        id: "round-1",
        agendaId: "agenda-1",
        publicBaselinePublicationIds: [],
        openedAt: 0,
        status: "open",
        contributionIds: ["contribution-1"]
    };
    const contribution = {
        id: "contribution-1",
        roundId: "round-1",
        contributorId: "manager-1",
        handRaise: { raisedAt: 0, purpose: "x" },
        acceptedAt: 0,
        status: "registered",
        substantiveSupplementCount: 0,
        packageId: "package-1"
    };
    const version = {
        id: "version-1",
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
    };
    const pkg = {
        id: "package-1",
        roundId: "round-1",
        contributionId: "contribution-1",
        authorId: "manager-1",
        agendaId: "agenda-1",
        currentVersionId: "version-1",
        versions: [version]
    };
    const registration = {
        id: "registration-1",
        versionId: "version-1",
        managerId: "manager-1",
        status: "complete",
        missingFields: [],
        createdAt: 0
    };
    const review = {
        id: "review-1",
        versionId: "version-1",
        reviewerId: "reviewer-1",
        baselinePublicationIds: [],
        scope: "x",
        dimensions: {
            source: { score: 3, reason: "x" },
            credibility: { score: 3, reason: "x" },
            completeness: { score: 3, reason: "x" },
            support: { score: 3, reason: "x" }
        },
        createdAt: 0
    };
    const delivery = {
        id: "delivery-1",
        reviewId: "review-1",
        authorId: "manager-1",
        status: "sent",
        sentAt: 0
    };
    const publication = {
        id: "publication-1",
        roundId: "round-1",
        seq: 1,
        finalVersionIds: ["version-1"],
        finalReviewIds: ["review-1"],
        publishedAt: 0,
        exitReasons: []
    };
    const message = {
        id: "message-1",
        seq: 1,
        actorId: "manager-1",
        agendaId: "agenda-1",
        kind: "x",
        body: "x",
        publicationId: "publication-1",
        relatedIds: [],
        createdAt: 0
    };
    const proposal = {
        id: "proposal-1",
        proposalId: "proposal-group-1",
        ordinal: 1,
        actorId: "manager-1",
        agendaId: "agenda-1",
        summary: "x",
        body: "x",
        evidenceIds: ["version-1"],
        createdAt: 0
    };
    const position = {
        id: "position-1",
        proposalRevisionId: "proposal-1",
        actorId: "manager-1",
        stance: "support",
        rationale: "x",
        evidenceIds: ["version-1"],
        createdAt: 0
    };
    const decisionCandidate = {
        id: "decisionCandidate-1",
        proposalRevisionId: "proposal-1",
        actorId: "manager-1",
        outcome: "adopt",
        rationale: "x",
        evidenceIds: ["version-1"],
        positionIds: ["position-1"],
        createdAt: 0
    };
    const decision = {
        ...decisionCandidate,
        id: "decision-1",
        candidateId: "decisionCandidate-1",
        status: "accepted"
    };
    const candidate = {
        id: "candidate-1",
        title: "x",
        reason: "x",
        sourceMessageId: "message-1",
        status: "pending"
    };
    const plan = {
        id: "plan-1",
        agendaId: "agenda-1",
        managerId: "manager-1",
        basedOnPublicationId: "publication-1",
        kind: "open_round",
        rationale: "x",
        createdAt: 0,
        status: "active"
    };
    const state = {
        ...base(),
        rounds: [round],
        contributions: [contribution],
        evidencePackages: [pkg],
        registrations: [registration],
        reviews: [review],
        reviewDeliveries: [delivery],
        publications: [publication],
        messages: [message],
        proposals: [proposal],
        positions: [position],
        decisionCandidates: [decisionCandidate],
        decisions: [decision],
        agendaCandidates: [candidate],
        managerPlans: [plan]
    };
    return {
        round,
        contribution,
        version,
        pkg,
        registration,
        review,
        delivery,
        publication,
        message,
        proposal,
        position,
        decisionCandidate,
        decision,
        candidate,
        plan,
        state
    };
}
describe("Evidence and decision chain", () => {
    it("accepts the ordered evidence and publication chain", () => {
        const {
            round,
            contribution,
            version,
            pkg,
            registration,
            review,
            delivery,
            publication,
            message,
            proposal,
            position,
            decisionCandidate,
            decision,
            candidate,
            plan,
            state
        } = evidenceState();
        const validation = validateMeetingStateV1(state);
        if (validation.kind === "invalid") throw new Error(validation.path);
        expect(validation).toMatchObject({ kind: "valid" });
        const candidateWithoutSource = { ...candidate };
        delete candidateWithoutSource.sourceMessageId;
        expect(
            validateMeetingStateV1({ ...base(), agendaCandidates: [candidateWithoutSource] })
        ).toMatchObject({
            kind: "valid"
        });
        const planWithoutPublication = { ...plan };
        delete planWithoutPublication.basedOnPublicationId;
        expect(
            validateMeetingStateV1({ ...base(), managerPlans: [planWithoutPublication] })
        ).toMatchObject({ kind: "valid" });
        expect(
            validateMeetingStateV1({
                ...base(),
                rounds: [round],
                contributions: [contribution],
                evidencePackages: [pkg]
            })
        ).toMatchObject({ kind: "valid" });
        invalidAt(
            { ...state, rounds: [{ ...round, id: "", agendaId: "missing-agenda" }] },
            "$.rounds[0].id"
        );
        invalidAt(
            {
                ...state,
                evidencePackages: [
                    {
                        ...pkg,
                        versions: [{ ...version, id: "", ordinal: 0, observation: "" }]
                    }
                ]
            },
            "$.evidencePackages[0].versions[0].id"
        );
        invalidAt(
            {
                ...state,
                reviews: [
                    {
                        ...review,
                        dimensions: {
                            source: { score: 9, reason: "" },
                            credibility: { score: 9, reason: "" },
                            completeness: { score: 9, reason: "" },
                            support: { score: 9, reason: "" }
                        }
                    }
                ]
            },
            "$.reviews[0].dimensions.source.score"
        );
        invalidAt(
            { ...state, evidencePackages: [{ ...pkg, currentVersionId: "version-2" }] },
            "$.evidencePackages[0].currentVersionId"
        );
        invalidAt(
            { ...state, evidencePackages: [{ ...pkg, agendaId: "output-1" }] },
            "$.evidencePackages[0].agendaId"
        );
        invalidAt(
            { ...state, registrations: [{ ...registration, managerId: "captain-1" }] },
            "$.registrations[0].managerId"
        );
        invalidAt(
            { ...state, reviews: [{ ...review, reviewerId: "manager-1" }] },
            "$.reviews[0].reviewerId"
        );
        invalidAt(
            { ...state, reviewDeliveries: [{ ...delivery, authorId: "captain-1" }] },
            "$.reviewDeliveries[0].authorId"
        );
        invalidAt(
            { ...state, publications: [{ ...publication, seq: 0 }] },
            "$.publications[0].seq"
        );
        invalidAt({ ...state, messages: [{ ...message, seq: 0 }] }, "$.messages[0].seq");
        invalidAt(
            {
                ...state,
                publications: [publication, { ...publication, id: "publication-2", seq: 1 }]
            },
            "$.publications[1].seq"
        );
        invalidAt(
            { ...state, reviews: [{ ...review, baselinePublicationIds: ["publication-1"] }] },
            "$.reviews[0].baselinePublicationIds"
        );
        invalidAt(
            { ...state, proposals: [{ ...proposal, ordinal: 2, supersedesRevisionId: "wrong" }] },
            "$.proposals[0].ordinal"
        );
        invalidAt(
            { ...state, decisions: [{ ...decision, actorId: "captain-1" }] },
            "$.decisions[0].actorId"
        );
        invalidAt(
            { ...state, decisions: [{ ...decision, actorId: "missing-identity" }] },
            "$.decisions[0].actorId"
        );
        invalidAt(
            {
                ...state,
                rounds: [{ ...round, contributionIds: ["contribution-1", "contribution-1"] }]
            },
            "$.rounds[0].contributionIds[1]"
        );
        invalidAt(
            {
                ...state,
                reviews: [{ ...review, baselinePublicationIds: ["publication-1", "publication-1"] }]
            },
            "$.reviews[0].baselinePublicationIds[1]"
        );
        invalidAt(
            {
                ...state,
                publications: [{ ...publication, finalVersionIds: ["version-1", "version-1"] }]
            },
            "$.publications[0].finalVersionIds[1]"
        );
        invalidAt(
            { ...state, messages: [{ ...message, relatedIds: ["message-1", "message-1"] }] },
            "$.messages[0].relatedIds[1]"
        );
        invalidAt(
            { ...state, proposals: [{ ...proposal, evidenceIds: ["version-1", "version-1"] }] },
            "$.proposals[0].evidenceIds[1]"
        );
        invalidAt(
            { ...state, positions: [{ ...position, evidenceIds: ["version-1", "version-1"] }] },
            "$.positions[0].evidenceIds[1]"
        );
        invalidAt(
            {
                ...state,
                decisionCandidates: [
                    { ...decisionCandidate, positionIds: ["position-1", "position-1"] }
                ]
            },
            "$.decisionCandidates[0].positionIds[1]"
        );
        invalidAt(
            { ...state, decisions: [{ ...decision, evidenceIds: ["version-1", "version-1"] }] },
            "$.decisions[0].evidenceIds[1]"
        );
        invalidAt(
            { ...state, registrations: [registration, { ...registration, id: "registration-1" }] },
            "$.registrations[1].id"
        );
        invalidAt(
            { ...state, reviewDeliveries: [delivery, { ...delivery, id: "delivery-1" }] },
            "$.reviewDeliveries[1].id"
        );
        const material = {
            id: "material-1",
            kind: "document",
            originalSource: "x",
            version: "x",
            locator: "x",
            location: "x",
            verificationConditions: "x",
            limitations: "x",
            sharedDependencies: []
        };
        const claim = {
            id: "claim-1",
            statement: "x",
            materialIds: ["material-2"],
            qualification: "x"
        };
        invalidAt(
            {
                ...state,
                evidencePackages: [
                    { ...pkg, versions: [{ ...version, materials: [material], claims: [claim] }] }
                ]
            },
            "$.evidencePackages[0].versions[0].claims[0].materialIds[0]"
        );
        invalidAt(
            {
                ...state,
                evidencePackages: [
                    { ...pkg, versions: [{ ...version, materials: [material, material] }] }
                ]
            },
            "$.evidencePackages[0].versions[0].materials[1].id"
        );
        invalidAt(
            { ...state, rounds: [{ ...round, contributionIds: [] }] },
            "$.contributions[0].roundId"
        );
        invalidAt(
            { ...state, evidencePackages: [{ ...pkg, contributionId: "contribution-2" }] },
            "$.evidencePackages[0].contributionId"
        );
    });
});

const typedReferenceCases = [
    ["round agenda", "rounds", "round", "agendaId", ["output-1", "missing-agenda"]],
    [
        "contribution round",
        "contributions",
        "contribution",
        "roundId",
        ["agenda-1", "missing-round"]
    ],
    [
        "package version",
        "evidencePackages",
        "pkg",
        "currentVersionId",
        ["review-1", "missing-version"]
    ],
    [
        "registration version",
        "registrations",
        "registration",
        "versionId",
        ["review-1", "missing-version"]
    ],
    ["review version", "reviews", "review", "versionId", ["review-1", "missing-version"]],
    [
        "delivery review",
        "reviewDeliveries",
        "delivery",
        "reviewId",
        ["version-1", "missing-review"]
    ],
    [
        "publication version",
        "publications",
        "publication",
        "finalVersionIds",
        [["review-1"], ["missing-version"]]
    ],
    [
        "message publication",
        "messages",
        "message",
        "publicationId",
        ["version-1", "missing-publication"]
    ],
    [
        "proposal evidence",
        "proposals",
        "proposal",
        "evidenceIds",
        [["review-1"], ["missing-version"]]
    ],
    [
        "position proposal",
        "positions",
        "position",
        "proposalRevisionId",
        ["position-1", "missing-proposal"]
    ],
    [
        "candidate position",
        "decisionCandidates",
        "decisionCandidate",
        "positionIds",
        [["review-1"], ["missing-position"]]
    ],
    [
        "decision candidate",
        "decisions",
        "decision",
        "candidateId",
        ["position-1", "missing-candidate"]
    ],
    [
        "agenda candidate source",
        "agendaCandidates",
        "candidate",
        "sourceMessageId",
        ["publication-1", "missing-message"]
    ],
    [
        "manager plan publication",
        "managerPlans",
        "plan",
        "basedOnPublicationId",
        ["message-1", "missing-publication"]
    ]
] as const;

it.each(typedReferenceCases)(
    "rejects %s typed references",
    (_name, collection, itemKey, field, values) => {
        const fixture = evidenceState() as unknown as Record<string, Record<string, unknown>>;
        const item = fixture[itemKey];
        for (const value of values) {
            const state = fixture.state as unknown as Record<string, unknown>;
            const path = `$.${collection}[0].${field}${Array.isArray(value) ? "[0]" : ""}`;
            invalidAt({ ...state, [collection]: [{ ...item, [field]: value }] }, path);
        }
    }
);

const evidenceRuleCases = [
    [
        "published round requires publication",
        (f: ReturnType<typeof evidenceState>) => ({
            ...f.state,
            rounds: [{ ...f.round, status: "published" }]
        }),
        "$.rounds[0].publicationId"
    ],
    [
        "complete registration has no missing fields",
        (f: ReturnType<typeof evidenceState>) => ({
            ...f.state,
            registrations: [{ ...f.registration, missingFields: ["x"] }]
        }),
        "$.registrations[0].missingFields"
    ],
    [
        "correction registration has missing fields",
        (f: ReturnType<typeof evidenceState>) => ({
            ...f.state,
            registrations: [{ ...f.registration, status: "needs_correction", missingFields: [] }]
        }),
        "$.registrations[0].missingFields"
    ],
    [
        "failed delivery rejects sentAt",
        (f: ReturnType<typeof evidenceState>) => ({
            ...f.state,
            reviewDeliveries: [{ ...f.delivery, status: "failed" }]
        }),
        "$.reviewDeliveries[0].failedAt"
    ],
    [
        "sent delivery requires sentAt",
        (f: ReturnType<typeof evidenceState>) => {
            const { sentAt: _, ...delivery } = f.delivery;
            return { ...f.state, reviewDeliveries: [delivery] };
        },
        "$.reviewDeliveries[0].sentAt"
    ],
    [
        "failed delivery requires failedAt",
        (f: ReturnType<typeof evidenceState>) => {
            const { sentAt: _, ...delivery } = f.delivery;
            return { ...f.state, reviewDeliveries: [{ ...delivery, status: "failed" }] };
        },
        "$.reviewDeliveries[0].failedAt"
    ],
    [
        "unknown material requires reason",
        (f: ReturnType<typeof evidenceState>) => ({
            ...f.state,
            evidencePackages: [
                {
                    ...f.pkg,
                    versions: [
                        {
                            ...f.version,
                            materials: [
                                {
                                    id: "material-1",
                                    kind: "unknown",
                                    originalSource: "x",
                                    version: "x",
                                    locator: "x",
                                    location: "x",
                                    verificationConditions: "x",
                                    limitations: "x",
                                    sharedDependencies: []
                                }
                            ]
                        }
                    ]
                }
            ]
        }),
        "$.evidencePackages[0].versions[0].materials[0].reason"
    ],
    [
        "proposal revisions are sequential",
        (f: ReturnType<typeof evidenceState>) => ({
            ...f.state,
            proposals: [{ ...f.proposal, ordinal: 2 }]
        }),
        "$.proposals[0].supersedesRevisionId"
    ]
] as const;

it.each(evidenceRuleCases)("rejects %s", (_name, mutate, path) => {
    invalidAt(mutate(evidenceState()), path);
});

it.each([
    ["risk disposition", "riskDispositions"],
    ["completion declaration", "completionDeclarations"],
    ["completion fact", "completionFacts"],
    ["task", "tasks"],
    ["private mail", "privateMails"]
] as const)("validates %s structure", (_name, collection) => {
    invalidAt({ ...base(), [collection]: [{}] }, `$.${collection}[0].id`);
});

it("validates terminal archive linkage and snapshot bounds", () => {
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
    };
    const archive = {
        id: "archive-1",
        createdAt: 0,
        createdBy: "local-1",
        terminationId: "termination-1",
        publicSnapshotVersion: 1,
        includedPublicationIds: [],
        includedDecisionIds: [],
        includedCompletionFactIds: [],
        status: "complete"
    };
    const terminal = {
        ...base(),
        lifecycle: { ...base().lifecycle, status: "archived" },
        termination,
        archive
    };
    expect(validateMeetingStateV1(terminal)).toMatchObject({ kind: "valid" });
    invalidAt(
        { ...terminal, archive: { ...archive, terminationId: "other" } },
        "$.archive.terminationId"
    );
    invalidAt(
        { ...terminal, archive: { ...archive, publicSnapshotVersion: 2 } },
        "$.archive.publicSnapshotVersion"
    );
    invalidAt({ ...terminal, archive: { ...archive, status: "pending" } }, "$.archive.status");
});

const terminalReferenceCases = [
    [
        "termination decision",
        "decisionIds",
        ["output-1", "missing-target"],
        "$.termination.decisionIds[0]"
    ],
    [
        "termination completion",
        "completionFactIds",
        ["output-1", "missing-target"],
        "$.termination.completionFactIds[0]"
    ],
    [
        "termination question",
        "unresolvedQuestionIds",
        ["output-1", "missing-target"],
        "$.termination.unresolvedQuestionIds[0]"
    ],
    [
        "termination issue",
        "unresolvedIssueIds",
        ["output-1", "missing-target"],
        "$.termination.unresolvedIssueIds[0]"
    ],
    [
        "termination contribution",
        "unclosedContributionIds",
        ["output-1", "missing-target"],
        "$.termination.unclosedContributionIds[0]"
    ],
    [
        "archive publication",
        "includedPublicationIds",
        ["output-1", "missing-target"],
        "$.archive.includedPublicationIds[0]"
    ],
    [
        "archive decision",
        "includedDecisionIds",
        ["output-1", "missing-target"],
        "$.archive.includedDecisionIds[0]"
    ],
    [
        "archive completion",
        "includedCompletionFactIds",
        ["output-1", "missing-target"],
        "$.archive.includedCompletionFactIds[0]"
    ]
] as const;

it.each(terminalReferenceCases)("rejects %s references", (_name, key, values, path) => {
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
    };
    const archive = {
        id: "archive-1",
        createdAt: 0,
        createdBy: "local-1",
        terminationId: "termination-1",
        publicSnapshotVersion: 1,
        includedPublicationIds: [],
        includedDecisionIds: [],
        includedCompletionFactIds: [],
        status: "complete"
    };
    const state = {
        ...base(),
        lifecycle: { ...base().lifecycle, status: "archived" },
        termination,
        archive
    } as Record<string, unknown>;
    const target = key.startsWith("included") ? archive : termination;
    for (const value of values) {
        const broken = { ...target, [key]: [value] };
        invalidAt(
            { ...state, [key.startsWith("included") ? "archive" : "termination"]: broken },
            path
        );
    }
});

function remainingEntityState() {
    const f = evidenceState();
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
    };
    const risk = {
        id: "risk-1",
        issueId: "issue-1",
        actorId: "captain-1",
        action: "accept",
        scope: "x",
        rationale: "x",
        evidenceIds: ["version-1"],
        createdAt: 0
    };
    const declaration = {
        id: "declaration-1",
        actorId: "captain-1",
        outputId: "output-1",
        statement: "x",
        evidenceIds: ["version-1"],
        createdAt: 0
    };
    const fact = {
        id: "fact-1",
        outputId: "output-1",
        actorId: "captain-1",
        status: "active",
        statement: "x",
        rationale: "x",
        evidenceIds: ["version-1"],
        decisionIds: [],
        createdAt: 0
    };
    const task = {
        id: "task-1",
        createdBy: "captain-1",
        assigneeId: "manager-1",
        title: "x",
        instructions: "x",
        contextPublicationUpperBound: ["publication-1"],
        status: "open",
        createdAt: 0,
        updatedAt: 0,
        authorizationId: "auth-1",
        authorizationStatus: "active",
        attempt: 0
    };
    const mail = {
        id: "mail-1",
        senderId: "manager-1",
        recipientId: "captain-1",
        body: "x",
        relatedIds: [],
        sendContextPublicationUpperBound: ["publication-1"],
        status: "queued",
        deadlineAt: 0,
        createdAt: 0
    };
    return {
        ...f.state,
        issues: [issue],
        riskDispositions: [risk],
        completionDeclarations: [declaration],
        completionFacts: [fact],
        tasks: [task],
        privateMails: [mail]
    };
}

const remainingFkCases = [
    [
        "risk issue",
        "riskDispositions",
        "riskDispositions",
        "issueId",
        ["output-1", "missing-issue"]
    ],
    [
        "declaration actor",
        "completionDeclarations",
        "completionDeclarations",
        "actorId",
        ["output-1", "missing-actor"]
    ],
    [
        "fact output",
        "completionFacts",
        "completionFacts",
        "outputId",
        ["publication-1", "missing-output"]
    ],
    ["task creator", "tasks", "tasks", "createdBy", ["output-1", "missing-actor"]],
    ["mail sender", "privateMails", "privateMails", "senderId", ["output-1", "missing-actor"]]
] as const;

it("accepts the complete remaining entity extension", () => {
    expect(validateMeetingStateV1(remainingEntityState())).toMatchObject({ kind: "valid" });
});

it.each(remainingFkCases)(
    "rejects %s typed references",
    (_name, collection, itemKey, field, values) => {
        const state = remainingEntityState() as Record<string, unknown>;
        const item = (state[itemKey] as Record<string, unknown>[])[0];
        for (const value of values) {
            const path = `$.${collection}[0].${field}${Array.isArray(value) ? "[0]" : ""}`;
            invalidAt({ ...state, [collection]: [{ ...item, [field]: value }] }, path);
        }
    }
);

it.each([
    ["terminal", "$.termination"],
    ["archiving", "$.termination"],
    ["archived", "$.termination"]
] as const)("requires %s termination", (status, path) => {
    invalidAt({ ...base(), lifecycle: { ...base().lifecycle, status } }, path);
});

it("rejects archive before terminal lifecycle", () => {
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
    };
    const archive = {
        id: "archive-1",
        createdAt: 0,
        createdBy: "local-1",
        terminationId: "termination-1",
        publicSnapshotVersion: 1,
        includedPublicationIds: [],
        includedDecisionIds: [],
        includedCompletionFactIds: [],
        status: "complete"
    };
    invalidAt({ ...base(), termination, archive }, "$.archive");
});

it("enforces the remaining cross object invariants", () => {
    const f = evidenceState();
    invalidAt(
        {
            ...f.state,
            lifecycle: { ...f.state.lifecycle, status: "terminal" },
            agenda: [{ ...f.state.agenda[0], status: "completed" }],
            rounds: [f.round],
            termination: {
                id: "termination-1",
                outcome: "completed",
                reason: "x",
                endedAt: 0,
                decisionIds: [],
                completionFactIds: [],
                unresolvedQuestionIds: [],
                unresolvedIssueIds: [],
                unclosedContributionIds: []
            }
        },
        "$.rounds[0].agendaId"
    );
    invalidAt(
        {
            ...f.state,
            contributions: [
                {
                    ...f.contribution,
                    pendingSupplementHand: {
                        raisedAt: 0,
                        purpose: "x",
                        reviewId: "missing-review"
                    },
                    status: "awaiting_response"
                }
            ]
        },
        "$.contributions[0].pendingSupplementHand.reviewId"
    );
    invalidAt(
        {
            ...f.state,
            contributions: [f.contribution, { ...f.contribution, id: "contribution-2" }]
        },
        "$.contributions[1].roundId"
    );
    invalidAt(
        {
            ...f.state,
            agenda: [
                ...f.state.agenda,
                {
                    id: "agenda-2",
                    title: "x",
                    question: "x",
                    status: "pending",
                    requiredOutputIds: [],
                    requiredReviewerIds: []
                }
            ],
            managerPlans: [
                { ...f.plan, basedOnPublicationId: "publication-1", agendaId: "agenda-2" }
            ]
        },
        "$.managerPlans[0].basedOnPublicationId"
    );
});
