import type { MeetingState } from "@/domain/meeting-state.js";

export function state(status: MeetingState["lifecycle"]["status"] = "running"): MeetingState {
    return {
        id: "meeting-1",
        version: 3,
        createdAt: 0,
        updatedAt: 3,
        objective: {
            statement: "objective",
            requiredOutputs: [{ id: "output-1", text: "output", status: "pending" }],
            acceptanceCriteria: [{ id: "criterion-1", text: "criterion", status: "pending" }],
            hardConstraints: [{ id: "constraint-1", text: "constraint", status: "pending" }],
            acceptableRiskLevel: "medium"
        },
        lifecycle: { status, changedAt: 3, changedBy: "local-1", reason: "previous" },
        identities: [
            {
                id: "identity-1",
                displayName: "Captain",
                roles: ["captain"],
                agendaResponsibilityIds: [],
                riskAuthority: false,
                required: false
            },
            {
                id: "reviewer-1",
                displayName: "Reviewer",
                roles: ["evidence_reviewer"],
                agendaResponsibilityIds: [],
                riskAuthority: false,
                required: false
            }
        ],
        identityRecommendations: [],
        agenda: [
            {
                id: "agenda-1",
                title: "agenda",
                question: "question",
                status: "active",
                requiredOutputIds: ["output-1"]
            }
        ],
        agendaCandidates: [],
        rounds: [],
        opportunityRequests: [],
        pendingHandRaises: [],
        contributions: [],
        evidenceReviewerId: "reviewer-1",
        completionDeclarations: [],
        evidencePackages: [],
        registrations: [],
        reviews: [],
        reviewClaims: [],
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

export const local = { kind: "local_controller", id: "local-1" } as const;
export const identity = { kind: "identity", id: "identity-1" } as const;
export const captain = identity;
export const nonCaptain = { kind: "identity", id: "identity-2" } as const;
export const reviewer = { kind: "identity", id: "reviewer-1" } as const;
export const manager = { kind: "identity", id: "manager-1" } as const;
export const recordQuestion = (overrides: Record<string, unknown> = {}) => ({
    kind: "record_question" as const,
    agendaId: "agenda-1",
    text: "q",
    affectedOutputIds: [],
    affectedCriterionIds: [],
    affectedConstraintIds: [],
    blocking: false,
    ...overrides
});
export const resolveQuestion = (overrides: Record<string, unknown> = {}) => ({
    kind: "resolve_question" as const,
    questionId: "question-1",
    status: "answered" as const,
    rationale: "done",
    evidenceIds: ["version-1"],
    ...overrides
});

export function terminalState(status: "terminal" | "archiving" | "archived"): MeetingState {
    const current = state(status);
    current.termination = {
        id: "termination-1",
        outcome: "completed",
        reason: "done",
        endedAt: 3,
        decisionIds: [],
        completionFactIds: [],
        unresolvedQuestionIds: [],
        unresolvedIssueIds: [],
        unclosedContributionIds: []
    };
    if (status !== "terminal")
        current.archive = {
            id: "archive-1",
            status: "complete",
            createdAt: 3,
            publicSnapshotVersion: 3,
            terminationId: "termination-1",
            objective: current.objective,
            agenda: current.agenda,
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
            termination: current.termination,
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            unresolvedItemIds: [],
            unclosedContributions: [],
            identityProvenance: [],
            exportMaterials: []
        };
    return current;
}

export function candidateState(): MeetingState {
    const current = state();
    current.identities = [...current.identities];
    current.agendaCandidates = [{ id: "candidate-1", title: "x", reason: "x", status: "pending" }];
    return current;
}

export function publishedQuestionState(blocking: boolean): MeetingState {
    const current = state();
    current.identities = [
        ...current.identities,
        {
            id: "manager-1",
            displayName: "Manager",
            roles: ["manager"],
            agendaResponsibilityIds: [],
            riskAuthority: false,
            required: false
        },
        {
            id: "contributor-1",
            displayName: "Contributor",
            roles: ["contributor"],
            agendaResponsibilityIds: [],
            riskAuthority: false,
            required: false
        }
    ];
    current.rounds = [
        {
            id: "round-1",
            agendaId: "agenda-1",
            planId: "plan-1",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            publicBaselinePublicationIds: [],
            openedAt: 0,
            status: "published",
            contributionIds: ["contribution-1"],
            publicationId: "publication-1"
        }
    ];
    current.managerPlans = [
        {
            id: "plan-1",
            agendaId: "agenda-1",
            managerId: "manager-1",
            kind: "open_round",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            rationale: "plan",
            createdAt: 0,
            status: "completed"
        }
    ];
    current.contributions = [
        {
            id: "contribution-1",
            roundId: "round-1",
            contributorId: "contributor-1",
            handRaise: { raisedAt: 0, purpose: "x" },
            acceptedAt: 0,
            status: "registered",
            packageId: "package-1",
            substantiveSupplementCount: 0
        }
    ];
    current.evidencePackages = [
        {
            id: "package-1",
            roundId: "round-1",
            contributionId: "contribution-1",
            authorId: "contributor-1",
            agendaId: "agenda-1",
            currentVersionId: "version-1",
            versions: [
                {
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
                }
            ]
        }
    ];
    current.publications = [
        {
            id: "publication-1",
            roundId: "round-1",
            seq: 1,
            finalVersionIds: ["version-1"],
            finalReviewIds: [],
            publishedAt: 0,
            exitReasons: []
        }
    ];
    current.questions = [
        {
            id: "question-1",
            actorId: "identity-1",
            agendaId: "agenda-1",
            text: "x",
            affectedOutputIds: blocking ? ["output-1"] : [],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            blocking,
            status: "open"
        }
    ];
    return current;
}

export const recordIssue = (overrides: Record<string, unknown> = {}) => ({
    kind: "record_issue" as const,
    agendaId: "agenda-1",
    description: "risk",
    riskLevel: "high" as const,
    classification: "blocking" as const,
    affectedOutputIds: ["output-1"],
    affectedCriterionIds: [],
    affectedConstraintIds: [],
    requiresEvidenceReview: false,
    blocking: true,
    rationale: "because",
    ...overrides
});
export const disposeIssue = (overrides: Record<string, unknown> = {}) => ({
    kind: "dispose_issue" as const,
    issueId: "issue-1",
    status: "resolved" as const,
    rationale: "handled",
    evidenceIds: ["version-1"],
    ...overrides
});
export const planNextStep = (overrides: Record<string, unknown> = {}) => ({
    kind: "plan_next_step" as const,
    agendaId: "agenda-1",
    planKind: "continue_agenda" as const,
    rationale: "next",
    ...overrides
});
export function issueState(
    blocking = true,
    status: "open" | "deferred" | "resolved" | "out_of_scope" = "open"
) {
    const current = publishedQuestionState(false);
    current.issues = [
        {
            id: "issue-1",
            actorId: "manager-1",
            agendaId: "agenda-1",
            description: "risk",
            riskLevel: "high",
            classification: "blocking",
            affectedOutputIds: ["output-1"],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            requiresEvidenceReview: true,
            blocking,
            status,
            rationale: "because"
        }
    ];
    return current;
}
