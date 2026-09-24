import { MeetingViewSchema, type MeetingView } from "@/protocol/meeting-view.js";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.js";

const version = {
    id: "version-1",
    ordinal: 1,
    observation: "observation",
    interpretation: "interpretation",
    method: "method",
    falsifiers: [],
    uncertainties: [],
    limitations: [],
    claims: [],
    materials: [],
    submittedAt: 24,
    status: "validated" as const,
    failureCount: 0
};
const dimension = { score: 2, reason: "reason", scope: "scope", baselineEvidenceIds: [] };
const review = {
    id: "review-1",
    versionId: "version-1",
    baselinePublicationIds: ["publication-baseline"],
    scope: "review scope",
    dimensions: {
        source: dimension,
        credibility: dimension,
        completeness: dimension,
        support: dimension
    },
    createdAt: 25,
    reviewerId: "reviewer-v1"
};
const publication = {
    id: "publication-1",
    roundId: "round-1",
    seq: 1,
    finalVersionIds: ["version-1"],
    finalReviewIds: ["review-1"],
    exitReasons: ["reason A", "reason B"],
    publishedAt: 27
};
const message = {
    id: "message-1",
    seq: 1,
    actorId: "manager-v1",
    agendaId: "agenda-v1",
    kind: "notice",
    body: "message body",
    publicationId: "publication-1",
    relatedIds: ["bare-id"],
    createdAt: 28
};
const candidate = {
    id: "candidate-1",
    proposalRevisionId: "proposal-1",
    actorId: "captain-v1",
    outcome: "adopt",
    rationale: "candidate rationale",
    evidenceIds: ["version-1"],
    positionIds: ["position-1"],
    createdAt: 30
};
const decision = {
    ...candidate,
    id: "decision-1",
    actorId: "multi-v1",
    candidateId: "candidate-1",
    replacesDecisionId: "decision-old",
    status: "accepted",
    createdAt: 31
};
const completion = {
    id: "completion-1",
    actorId: "contributor-v1",
    outputId: "output-v1",
    status: "active",
    statement: "completion statement",
    rationale: "completion rationale",
    evidenceIds: ["version-1"],
    decisionIds: ["decision-1"],
    createdAt: 32
};
const risk = {
    id: "risk-1",
    actorId: "manager-v1",
    issueId: "issue-1",
    action: "accept",
    scope: "risk scope",
    rationale: "risk rationale",
    evidenceIds: ["version-1"],
    createdAt: 33
};
const termination = {
    id: "termination-1",
    outcome: "partial",
    reason: "termination reason",
    endedAt: 37,
    decisionIds: ["decision-1"],
    completionFactIds: ["completion-1"],
    unresolvedQuestionIds: ["question-1"],
    unresolvedIssueIds: ["issue-1"],
    unclosedContributionIds: []
};

export function activeTimelineFixture(): MeetingView {
    const base = meetingProjectionFixture().view;
    return MeetingViewSchema.parse({
        ...base,
        lifecycle: { status: "running", changedAt: 10, reason: "lifecycle reason" },
        identities: [
            ...base.identities,
            { id: "captain-v1", displayName: "captain", roles: ["captain"] },
            { id: "multi-v1", displayName: "multi", roles: ["manager", "contributor"] }
        ],
        rounds: [
            {
                id: "round-1",
                agendaId: "agenda-v1",
                planId: "plan-1",
                roundGoal: {
                    question: "round question",
                    evidenceGap: "gap",
                    expectedOutput: "output"
                },
                status: "aborted",
                baselinePublicationIds: [],
                openedAt: 20,
                abortedAt: 21,
                abortReason: "abort reason",
                pendingHandRaises: [
                    {
                        roundId: "round-1",
                        contributorId: "contributor-v1",
                        purpose: "raise purpose",
                        raisedAt: 22
                    }
                ],
                contributions: []
            }
        ],
        opportunityRequests: [
            {
                id: "request-1",
                agendaId: "agenda-v1",
                contributorId: "contributor-v1",
                purpose: "request purpose",
                requestedAt: 23
            }
        ],
        evidencePackages: [
            {
                id: "package-1",
                roundId: "round-1",
                contributionId: "contribution-1",
                authorId: "contributor-v1",
                agendaId: "agenda-v1",
                currentVersion: version
            }
        ],
        evidenceReviews: [review],
        reviewDeliveries: [
            {
                id: "delivery-1",
                reviewId: "review-1",
                authorId: "contributor-v1",
                status: "sent",
                sentAt: 26
            }
        ],
        publications: [publication],
        messages: [message],
        identityRecommendations: [
            {
                id: "recommendation-1",
                candidateId: "person-1",
                agendaId: "agenda-v1",
                decision: "admit",
                status: "active",
                rationale: "recommendation rationale",
                createdAt: 29
            }
        ],
        outcomes: {
            decisions: [decision],
            completionFacts: [completion],
            riskDispositions: [risk],
            pendingDecisionCandidates: [candidate],
            termination
        },
        managerPlans: [
            {
                id: "plan-1",
                agendaId: "agenda-v1",
                managerId: "manager-v1",
                basedOnPublicationId: "publication-1",
                kind: "open_round",
                rationale: "plan rationale",
                status: "active",
                createdAt: 34
            }
        ],
        tasks: [
            {
                id: "task-1",
                assigneeId: "contributor-v1",
                title: "task title",
                status: "completed",
                authorizationId: "auth-1",
                authorizationStatus: "active",
                attempt: 0,
                startedAt: 35,
                completedAt: 36,
                result: "task result"
            }
        ]
    });
}

export function archiveTimelineFixture(
    status: "complete" | "pending" | "failed" = "complete"
): MeetingView {
    const active = activeTimelineFixture();
    return MeetingViewSchema.parse({
        ...active,
        lifecycle: { status: "archived", changedAt: 100 },
        archive: {
            id: "archive-1",
            status,
            createdAt: 50,
            publicSnapshotVersion: 1,
            terminationId: termination.id,
            objective: active.objective,
            agenda: active.agenda,
            agendaCandidates: [],
            publications: [publication],
            messages: [message],
            evidenceBundles: [
                {
                    packageId: "package-1",
                    authorIdentityId: "contributor-v1",
                    agendaId: "agenda-v1",
                    version,
                    review
                }
            ],
            proposalRevisions: [
                {
                    id: "proposal-1",
                    proposalId: "proposal-root",
                    ordinal: 1,
                    actorId: "manager-v1",
                    agendaId: "agenda-v1",
                    summary: "proposal summary",
                    body: "proposal body",
                    evidenceIds: ["version-1"],
                    supersedesRevisionId: "proposal-old",
                    createdAt: 38
                }
            ],
            positions: [
                {
                    id: "position-1",
                    proposalRevisionId: "proposal-1",
                    actorId: "contributor-v1",
                    stance: "support",
                    rationale: "position rationale",
                    evidenceIds: ["version-1"],
                    createdAt: 39
                }
            ],
            decisionCandidates: [candidate],
            decisions: [decision],
            completionFacts: [completion],
            questions: [],
            issues: [],
            riskDispositions: [risk],
            questionIssueDispositionFacts: [
                {
                    factId: "fact-1",
                    actorId: "manager-v1",
                    occurredAt: 40,
                    relatedIds: ["bare-id"],
                    kind: "dispose_issue",
                    payload: {
                        kind: "issue_disposition",
                        issueId: "issue-1",
                        oldStatus: "open",
                        newStatus: "resolved",
                        oldBlocking: true,
                        newBlocking: false,
                        rationale: "fact rationale",
                        evidenceIds: ["version-1"]
                    }
                }
            ],
            termination,
            unresolvedItemIds: [],
            unclosedContributions: [],
            identityProvenance: active.identities.map(({ id, displayName, roles }) => ({
                identityId: id,
                displayName,
                roles
            })),
            exportMaterials: []
        }
    });
}
