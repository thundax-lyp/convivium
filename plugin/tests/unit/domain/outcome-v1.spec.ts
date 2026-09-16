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
                reviewResponsibilityIds: [],
                riskAuthority: true,
                required: true
            },
            {
                id: "contributor",
                displayName: "Contributor",
                roles: ["contributor"],
                agendaResponsibilityIds: ["a"],
                reviewResponsibilityIds: [],
                riskAuthority: false,
                required: false
            },
            {
                id: "reviewer",
                displayName: "Reviewer",
                roles: ["evidence_reviewer"],
                agendaResponsibilityIds: [],
                reviewResponsibilityIds: ["a"],
                riskAuthority: false,
                required: false
            },
            {
                id: "manager",
                displayName: "Manager",
                roles: ["manager"],
                agendaResponsibilityIds: [],
                reviewResponsibilityIds: [],
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
                requiredOutputIds: ["o"],
                requiredReviewerIds: ["reviewer"]
            }
        ],
        agendaCandidates: [],
        rounds: [
            {
                id: "r",
                agendaId: "a",
                publicBaselinePublicationIds: [],
                openedAt: 0,
                status: "open",
                contributionIds: ["c"]
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
        formatApprovals: [],
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
                managerId: "manager",
                status: "complete",
                missingFields: [],
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
            createdAt: 0,
            createdBy: "captain",
            terminationId: "termination",
            publicSnapshotVersion: 1,
            includedPublicationIds: [],
            includedDecisionIds: [],
            includedCompletionFactIds: [],
            status: status === "archived" ? "complete" : "pending",
            identityProvenance: []
        };
    }
    return state;
}

describe("outcome proposal revisions", () => {
    it("records first and consecutive proposal revisions without copying history", () => {
        let state = validState();
        state.objective = {
            ...state.objective,
            hardConstraints: [{ id: "constraint", text: "constraint", status: "pending" }]
        };
        const first = recordProposalRevisionV1(state, {
            revisionId: "rev-1",
            proposalId: "prop",
            agendaId: "a",
            summary: "first",
            body: "body",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "contributor" },
            now: 1
        });
        expect(first.kind).toBe("accepted");
        if (first.kind !== "accepted") return;
        state = first.state;
        const second = recordProposalRevisionV1(state, {
            revisionId: "rev-2",
            proposalId: "prop",
            agendaId: "a",
            summary: "second",
            body: "body",
            evidenceIds: ["v"],
            supersedesRevisionId: "rev-1",
            actor: { kind: "identity", id: "contributor" },
            now: 2
        });
        expect(second.kind).toBe("accepted");
        if (second.kind !== "accepted") return;
        expect(second.state.proposals.map((p) => p.ordinal)).toEqual([1, 2]);
        expect(second.state.proposals[0].summary).toBe("first");
    });

    it("records current position and candidate and derives pending in write order", () => {
        let state = validState();
        const proposal = recordProposalRevisionV1(state, {
            revisionId: "rev",
            proposalId: "prop",
            agendaId: "a",
            summary: "s",
            body: "b",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "contributor" },
            now: 1
        });
        expect(proposal.kind).toBe("accepted");
        if (proposal.kind !== "accepted") return;
        state = proposal.state;
        const position = recordPositionV1(state, {
            positionId: "pos",
            proposalRevisionId: "rev",
            stance: "support",
            rationale: "because",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "contributor" },
            now: 2
        });
        expect(position.kind).toBe("accepted");
        if (position.kind !== "accepted") return;
        state = position.state;
        const candidate = recordDecisionCandidateV1(state, {
            candidateId: "cand",
            proposalRevisionId: "rev",
            outcome: "adopt",
            rationale: "adopt",
            evidenceIds: ["v"],
            positionIds: ["pos"],
            actor: { kind: "identity", id: "contributor" },
            now: 3
        });
        expect(candidate.kind).toBe("accepted");
        if (candidate.kind !== "accepted") return;
        expect(pendingDecisionCandidatesV1(candidate.state).map((c) => c.id)).toEqual(["cand"]);
    });

    it("accepts and revokes a decision while preserving history", () => {
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
        const accepted = decideV1(state, {
            decisionId: "dec",
            candidateId: "cand",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(accepted.kind).toBe("accepted");
        if (accepted.kind !== "accepted") throw new Error(JSON.stringify(accepted.error));
        const revoked = changeDecisionV1(accepted.state, {
            decisionId: "dec",
            status: "revoked",
            rationale: "reconsider",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 2
        });
        if (revoked.kind === "rejected") throw new Error(JSON.stringify(revoked.error));
        expect(revoked.kind).toBe("accepted");
        if (revoked.kind !== "accepted") return;
        expect(revoked.state.decisions).toHaveLength(1);
        expect(revoked.state.decisions[0].status).toBe("revoked");
    });

    it("appends risk dispositions and makes the last disposition authoritative", () => {
        const state = validState();
        state.issues = [
            {
                id: "issue",
                agendaId: "a",
                description: "risk",
                riskLevel: "high",
                classification: "blocking",
                affectedOutputIds: ["o"],
                affectedCriterionIds: [],
                affectedConstraintIds: [],
                requiredReviewerIds: ["reviewer"],
                blocking: true,
                status: "open",
                rationale: "x"
            }
        ];
        const rejected = disposeRiskV1(state, {
            dispositionId: "risk-1",
            issueId: "issue",
            action: "reject",
            scope: "all",
            rationale: "not accepted",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(rejected.kind).toBe("accepted");
        if (rejected.kind !== "accepted") return;
        const accepted = disposeRiskV1(rejected.state, {
            dispositionId: "risk-2",
            issueId: "issue",
            action: "accept",
            scope: "all",
            rationale: "accepted",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 2
        });
        expect(accepted.kind).toBe("accepted");
        if (accepted.kind !== "accepted") return;
        expect(accepted.state.riskDispositions.map((d) => d.action)).toEqual(["reject", "accept"]);
        expect(accepted.state.issues[0].blocking).toBe(false);
        expect(accepted.state.issues[0].classification).toBe("accepted_risk");
    });

    it("declaration appends without consuming facts or changing lifecycle", () => {
        const state = validState();
        const result = submitCompletionDeclarationV1(state, {
            declarationId: "decl",
            outputId: "o",
            statement: "done",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "contributor" },
            now: 1
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.completionDeclarations).toHaveLength(1);
        expect(result.state.completionFacts).toHaveLength(0);
        expect(result.state.lifecycle.status).toBe("running");
    });

    it("creates and revokes a completion fact with immutable history", () => {
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
        const decision = decideV1(state, {
            decisionId: "dec",
            candidateId: "cand",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(decision.kind).toBe("accepted");
        if (decision.kind !== "accepted") return;
        const fact = recordCompletionFactV1(decision.state, {
            factId: "fact",
            outputId: "o",
            statement: "output complete",
            rationale: "decision",
            evidenceIds: ["v"],
            decisionIds: ["dec"],
            actor: { kind: "identity", id: "captain" },
            now: 2
        });
        expect(fact.kind).toBe("accepted");
        if (fact.kind !== "accepted") return;
        expect(fact.state.completionFacts[0].status).toBe("active");
        const revoked = changeCompletionFactV1(fact.state, {
            factId: "fact",
            status: "revoked",
            rationale: "changed",
            actor: { kind: "identity", id: "captain" },
            now: 3
        });
        if (revoked.kind === "rejected") throw new Error(JSON.stringify(revoked.error));
        expect(revoked.kind).toBe("accepted");
        if (revoked.kind !== "accepted") return;
        expect(revoked.state.completionFacts).toHaveLength(1);
        expect(revoked.state.completionFacts[0].status).toBe("revoked");
    });
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
            const state = validState(status);
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
            expect(result).toMatchObject({
                kind: "rejected",
                state,
                relatedIds: [],
                effectRequests: [],
                error: { code: "INVALID_STATE" }
            });
            expect(result.state).toBe(state);
        }
    );

    it.each(["terminal", "archiving", "archived"] as const)(
        "rejects proposal writes in terminal lifecycle %s",
        (status) => {
            const state = validState(status);
            const result = recordProposalRevisionV1(state, {
                revisionId: "r1",
                proposalId: "p1",
                agendaId: "a",
                summary: "s",
                body: "b",
                evidenceIds: ["v"],
                actor: { kind: "identity", id: "contributor" },
                now: 1
            });
            expect(result).toMatchObject({
                kind: "rejected",
                state,
                relatedIds: [],
                effectRequests: [],
                error: { code: "MEETING_TERMINAL" }
            });
        }
    );

    it.each(["paused", "preparing", "converging", "ending"] as const)(
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

    it("supersedes a decision atomically with a replacement candidate", () => {
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
                id: "old-cand",
                proposalRevisionId: "rev",
                actorId: "contributor",
                outcome: "adopt",
                rationale: "x",
                evidenceIds: ["v"],
                positionIds: ["pos"],
                createdAt: 0
            },
            {
                id: "new-cand",
                proposalRevisionId: "rev",
                actorId: "contributor",
                outcome: "adopt",
                rationale: "new",
                evidenceIds: ["v"],
                positionIds: ["pos"],
                createdAt: 1
            }
        ];
        const accepted = decideV1(state, {
            decisionId: "old-dec",
            candidateId: "old-cand",
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        expect(accepted.kind).toBe("accepted");
        if (accepted.kind !== "accepted") return;
        const changed = changeDecisionV1(accepted.state, {
            decisionId: "old-dec",
            status: "superseded",
            replacementCandidateId: "new-cand",
            replacementDecisionId: "new-dec",
            rationale: "replace",
            evidenceIds: ["v"],
            actor: { kind: "identity", id: "captain" },
            now: 2
        });
        expect(changed.kind).toBe("accepted");
        if (changed.kind !== "accepted") return;
        expect(changed.state.decisions.map((d) => [d.id, d.status])).toEqual([
            ["old-dec", "superseded"],
            ["new-dec", "accepted"]
        ]);
        expect(changed.state.decisions[1].replacesDecisionId).toBe("old-dec");
    });

    it("supersedes a completion fact and retains the predecessor link", () => {
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
                id: "old-fact",
                outputId: "o",
                actorId: "captain",
                status: "active",
                statement: "old",
                rationale: "x",
                evidenceIds: ["v"],
                decisionIds: ["dec"],
                createdAt: 0
            }
        ];
        const result = changeCompletionFactV1(state, {
            factId: "old-fact",
            status: "superseded",
            rationale: "new",
            replacement: {
                factId: "new-fact",
                outputId: "o",
                statement: "new",
                rationale: "new",
                evidenceIds: ["v"],
                decisionIds: ["dec"]
            },
            actor: { kind: "identity", id: "captain" },
            now: 1
        });
        if (result.kind === "rejected") throw new Error(JSON.stringify(result.error));
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.completionFacts.map((f) => [f.id, f.status])).toEqual([
            ["old-fact", "superseded"],
            ["new-fact", "active"]
        ]);
        expect(result.state.completionFacts[1].supersedesFactId).toBe("old-fact");
        expect(result.state.objective.requiredOutputs[0].status).toBe("satisfied");
        expect(state.completionFacts[0].status).toBe("active");
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
