import { captainActorIdFor } from "@/domain/control-actor.ts";
import { expect } from "vitest";
import type { MeetingState } from "@/domain/meeting-state.ts";
import { recordPosition } from "@/domain/transitions/outcome.ts";

export function validState(status: MeetingState["lifecycle"]["status"] = "running"): MeetingState {
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
                roles: ["contributor"],
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
                planId: "plan-r",
                roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
                publicBaselinePublicationIds: [],
                openedAt: 0,
                status: "published",
                contributionIds: ["c"],
                invitedContributorIds: ["contributor"],
                participationResponses: [
                    { contributorId: "contributor", status: "raised", recordedAt: 0 }
                ],
                publicationId: "pub"
            }
        ],
        pendingHandRaises: [],
        contributions: [
            {
                id: "c",
                roundId: "r",
                contributorId: "contributor",
                handRaise: { raisedAt: 0, purpose: "x" },
                acceptedAt: 0,
                status: "registered",
                packageId: "p"
            }
        ],
        evidenceReviewerId: "reviewer",
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
                        summary: "Evidence summary",
                        observation: "x",
                        interpretation: "x",
                        method: "x",
                        falsifiers: [],
                        uncertainties: [],
                        limitations: [],
                        claims: [],
                        materials: [],
                        submittedAt: 0,
                        status: "validated",
                        failureCount: 0
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
        reviewClaims: [],
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
        managerPlans: [
            {
                id: "plan-r",
                agendaId: "a",
                managerId: "manager",
                kind: "open_round",
                roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
                rationale: "plan",
                createdAt: 0,
                status: "completed"
            }
        ],
        completionFacts: [],
        limits: {
            maxFormalMessages: 1,
            maxDurationMs: 1,
            taskDeadlineMs: 1,
            reviewDeadlineMs: 1
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
            controlActorProvenance: [{ actorId: captainActorIdFor(state.id), kind: "captain" }],
            exportMaterials: []
        };
    }
    return state;
}

export function addUnpublishedEvidence(state: MeetingState, versionId = "v2"): void {
    const round = state.rounds[0];
    const version = state.evidencePackages[0].versions[0];
    state.managerPlans.push({
        id: "plan-unpublished",
        agendaId: round.agendaId,
        managerId: "manager",
        kind: "open_round",
        roundGoal: round.roundGoal,
        rationale: "follow-up evidence",
        createdAt: 0,
        status: "completed"
    });
    state.rounds.push({
        id: "round-unpublished",
        agendaId: round.agendaId,
        planId: "plan-unpublished",
        roundGoal: round.roundGoal,
        publicBaselinePublicationIds: state.publications.map((publication) => publication.id),
        openedAt: 0,
        status: "open",
        contributionIds: ["contribution-unpublished"],
        invitedContributorIds: ["captain"],
        participationResponses: [{ contributorId: "captain", status: "raised", recordedAt: 0 }]
    });
    state.contributions.push({
        id: "contribution-unpublished",
        roundId: "round-unpublished",
        contributorId: "captain",
        handRaise: { raisedAt: 0, purpose: "follow-up evidence" },
        acceptedAt: 0,
        status: "under_review",
        packageId: "package-unpublished"
    });
    state.evidencePackages.push({
        id: "package-unpublished",
        roundId: "round-unpublished",
        contributionId: "contribution-unpublished",
        authorId: "captain",
        agendaId: round.agendaId,
        currentVersionId: versionId,
        versions: [{ ...version, id: versionId, ordinal: 1, status: "submitted" }]
    });
    state.registrations.push({
        id: "registration-unpublished",
        versionId,
        status: "complete",
        createdAt: 0
    });
    state.limits.maxFormalMessages = Math.max(state.limits.maxFormalMessages, 2);
}

export function completionReadyState(): MeetingState {
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

export function completionInput(
    actor: { kind: "identity" | "captain_user"; id: string } = {
        kind: "captain_user",
        id: captainActorIdFor("m")
    }
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

export function proposalState(): MeetingState {
    return validState();
}

export function expectRejected(
    result: ReturnType<typeof recordPosition>,
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

export function decisionReadyState() {
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
