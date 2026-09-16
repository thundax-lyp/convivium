import { describe, expect, it } from "vitest";
import type { MeetingState } from "@/domain/meeting-state-v1.js";
import { transitionMeetingStateV1 } from "@/domain/meeting-state-v1-transitions.js";

function state(status: MeetingState["lifecycle"]["status"] = "running"): MeetingState {
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
                reviewResponsibilityIds: [],
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
                requiredOutputIds: ["output-1"],
                requiredReviewerIds: []
            }
        ],
        agendaCandidates: [],
        rounds: [],
        opportunityRequests: [],
        pendingHandRaises: [],
        contributions: [],
        formatApprovals: [],
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

const local = { kind: "local_controller", id: "local-1" } as const;
const identity = { kind: "identity", id: "identity-1" } as const;
const captain = identity;
const nonCaptain = { kind: "identity", id: "identity-2" } as const;
const reviewer = { kind: "identity", id: "reviewer-1" } as const;
const manager = { kind: "identity", id: "manager-1" } as const;
const recordQuestion = (overrides: Record<string, unknown> = {}) => ({
    kind: "record_question" as const,
    agendaId: "agenda-1",
    text: "q",
    affectedOutputIds: [],
    affectedCriterionIds: [],
    affectedConstraintIds: [],
    blocking: false,
    ...overrides
});
const resolveQuestion = (overrides: Record<string, unknown> = {}) => ({
    kind: "resolve_question" as const,
    questionId: "question-1",
    status: "answered" as const,
    rationale: "done",
    evidenceIds: ["version-1"],
    ...overrides
});

function terminalState(status: "terminal" | "archiving" | "archived"): MeetingState {
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
            createdAt: 3,
            createdBy: "identity-1",
            terminationId: "termination-1",
            publicSnapshotVersion: 3,
            includedPublicationIds: [],
            includedDecisionIds: [],
            includedCompletionFactIds: [],
            status: status === "archived" ? "complete" : "pending"
        };
    return current;
}

function candidateState(): MeetingState {
    const current = state();
    current.identities = [
        ...current.identities,
        {
            id: "reviewer-1",
            displayName: "Reviewer",
            roles: ["evidence_reviewer"],
            agendaResponsibilityIds: [],
            reviewResponsibilityIds: [],
            riskAuthority: false,
            required: false
        }
    ];
    current.agendaCandidates = [{ id: "candidate-1", title: "x", reason: "x", status: "pending" }];
    return current;
}

function publishedQuestionState(blocking: boolean): MeetingState {
    const current = state();
    current.identities = [
        ...current.identities,
        {
            id: "manager-1",
            displayName: "Manager",
            roles: ["manager"],
            agendaResponsibilityIds: [],
            reviewResponsibilityIds: [],
            riskAuthority: false,
            required: false
        },
        {
            id: "reviewer-1",
            displayName: "Reviewer",
            roles: ["evidence_reviewer"],
            agendaResponsibilityIds: [],
            reviewResponsibilityIds: [],
            riskAuthority: false,
            required: false
        },
        {
            id: "contributor-1",
            displayName: "Contributor",
            roles: ["contributor"],
            agendaResponsibilityIds: [],
            reviewResponsibilityIds: [],
            riskAuthority: false,
            required: false
        }
    ];
    current.rounds = [
        {
            id: "round-1",
            agendaId: "agenda-1",
            publicBaselinePublicationIds: [],
            openedAt: 0,
            status: "published",
            contributionIds: ["contribution-1"],
            publicationId: "publication-1"
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

const recordIssue = (overrides: Record<string, unknown> = {}) => ({
    kind: "record_issue" as const,
    agendaId: "agenda-1",
    description: "risk",
    riskLevel: "high" as const,
    classification: "blocking" as const,
    affectedOutputIds: ["output-1"],
    affectedCriterionIds: [],
    affectedConstraintIds: [],
    requiredReviewerIds: [],
    blocking: true,
    rationale: "because",
    ...overrides
});
const disposeIssue = (overrides: Record<string, unknown> = {}) => ({
    kind: "dispose_issue" as const,
    issueId: "issue-1",
    status: "resolved" as const,
    rationale: "handled",
    evidenceIds: ["version-1"],
    ...overrides
});
const planNextStep = (overrides: Record<string, unknown> = {}) => ({
    kind: "plan_next_step" as const,
    agendaId: "agenda-1",
    planKind: "continue_agenda" as const,
    rationale: "next",
    ...overrides
});
function issueState(
    blocking = true,
    status: "open" | "deferred" | "resolved" | "out_of_scope" = "open"
) {
    const current = publishedQuestionState(false);
    current.issues = [
        {
            id: "issue-1",
            agendaId: "agenda-1",
            description: "risk",
            riskLevel: "high",
            classification: "blocking",
            affectedOutputIds: ["output-1"],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            requiredReviewerIds: [],
            blocking,
            status,
            rationale: "because"
        }
    ];
    return current;
}

describe("meeting lifecycle transitions", () => {
    it("records a nonblocking follow-up with all typed references", () => {
        const current = publishedQuestionState(false);
        const result = transitionMeetingStateV1(
            current,
            recordIssue({
                riskLevel: "medium",
                classification: "follow_up",
                blocking: false,
                affectedCriterionIds: ["criterion-1"],
                affectedConstraintIds: ["constraint-1"],
                requiredReviewerIds: []
            }),
            manager,
            10,
            "fact-7",
            "issue-follow-up"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.issues[0]).toMatchObject({
            id: "issue-follow-up",
            classification: "follow_up",
            blocking: false,
            affectedOutputIds: ["output-1"],
            affectedCriterionIds: ["criterion-1"],
            affectedConstraintIds: ["constraint-1"],
            requiredReviewerIds: []
        });
    });

    it("accepts a high risk issue without affected targets", () => {
        const current = publishedQuestionState(false);
        const result = transitionMeetingStateV1(
            current,
            recordIssue({ affectedOutputIds: [], riskLevel: "high", classification: "blocking" }),
            captain,
            10,
            "fact-7",
            "issue-high"
        );
        expect(result.kind).toBe("accepted");
    });

    it("accepts medium blocking when an agenda reviewer qualifies it", () => {
        const current = publishedQuestionState(false);
        current.agenda[0].requiredReviewerIds = ["reviewer-1"];
        current.identities.find((item) => item.id === "reviewer-1")!.reviewResponsibilityIds = [
            "agenda-1"
        ];
        const result = transitionMeetingStateV1(
            current,
            recordIssue({
                riskLevel: "medium",
                classification: "blocking",
                requiredReviewerIds: ["reviewer-1"],
                affectedOutputIds: []
            }),
            manager,
            10,
            "fact-7",
            "issue-reviewer"
        );
        expect(result.kind).toBe("accepted");
    });

    it.each([
        ["output", { affectedOutputIds: ["missing"] }],
        ["criterion", { affectedCriterionIds: ["missing"] }],
        ["constraint", { affectedConstraintIds: ["missing"] }],
        ["reviewer", { requiredReviewerIds: ["missing"] }]
    ] as const)("rejects a missing issue %s reference", (_name, overrides) => {
        const current = publishedQuestionState(false);
        const result = transitionMeetingStateV1(
            current,
            recordIssue(overrides),
            captain,
            10,
            "fact-8",
            "issue-missing-ref"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code: "NOT_FOUND", facts: [] });
    });

    it.each([
        ["pause running", "pause_meeting", "running", "paused"],
        ["resume paused", "resume_meeting", "paused", "running"]
    ] as const)("accepts %s", (_name, kind, from, to) => {
        const current = state(from);
        const result = transitionMeetingStateV1(
            current,
            { kind, reason: "operator request" },
            local,
            10,
            "fact-1"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state).toEqual({
            ...current,
            version: 4,
            updatedAt: 10,
            lifecycle: {
                ...current.lifecycle,
                status: to,
                changedAt: 10,
                changedBy: "local-1",
                reason: "operator request"
            }
        });
        expect(result.facts).toEqual([
            {
                id: "fact-1",
                kind,
                actorId: "local-1",
                occurredAt: 10,
                relatedIds: ["meeting-1"],
                payload: { kind: "references", relatedIds: ["meeting-1"] }
            }
        ]);
    });

    it.each([
        ["identity actor", identity, "running", "UNAUTHORIZED"],
        ["wrong lifecycle", local, "preparing", "INVALID_STATE"]
    ] as const)("rejects %s without changing the state", (_name, actor, status, code) => {
        const current = state(status);
        const result = transitionMeetingStateV1(
            current,
            { kind: "pause_meeting", reason: "pause" },
            actor,
            10,
            "fact-1"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it.each([
        ["duplicate reviewer", ["reviewer-1", "reviewer-1"], "INVALID_ARGUMENT"],
        ["reviewer without role", ["identity-1"], "PRECONDITION_FAILED"],
        ["used agenda id", ["reviewer-1"], "PRECONDITION_FAILED"]
    ] as const)("rejects promotion: %s", (_name, reviewerIds, code) => {
        const current = candidateState();
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_agenda_candidate",
                candidateId: "candidate-1",
                disposition: "promoted",
                reason: "approve",
                promotedAgenda: {
                    id: _name === "used agenda id" ? "agenda-1" : "agenda-2",
                    title: "next",
                    question: "next question",
                    requiredOutputIds: ["output-1"],
                    requiredReviewerIds: reviewerIds
                }
            },
            captain,
            10,
            "fact-3"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
        expect(result.state).toBe(current);
        expect(result.state.version).toBe(3);
    });

    it("requires a Captain identity for agenda activation", () => {
        const fixture = state();
        const current = {
            ...fixture,
            agenda: [
                ...fixture.agenda,
                {
                    id: "agenda-2",
                    title: "next",
                    question: "next question",
                    status: "pending" as const,
                    requiredOutputIds: ["output-1"],
                    requiredReviewerIds: []
                }
            ]
        };
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "activate_agenda",
                agendaId: "agenda-2",
                previousDisposition: "closed",
                reason: "move on"
            },
            nonCaptain,
            10,
            "fact-2"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "UNAUTHORIZED",
            facts: []
        });
    });

    it.each(["terminal", "archiving", "archived"] as const)(
        "rejects %s without changing the state",
        (status) => {
            const current = terminalState(status);
            const result = transitionMeetingStateV1(
                current,
                { kind: "pause_meeting", reason: "pause" },
                local,
                10,
                "fact-1"
            );
            expect(result).toEqual({
                kind: "rejected",
                state: current,
                code: "MEETING_TERMINAL",
                facts: []
            });
            expect(result.state).toBe(current);
            expect(result.state.version).toBe(3);
        }
    );

    it("rejects agenda activation in a terminal meeting", () => {
        const current = terminalState("terminal");
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "activate_agenda",
                agendaId: "missing-agenda",
                previousDisposition: "closed",
                reason: "move on"
            },
            captain,
            10,
            "fact-2"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "MEETING_TERMINAL",
            facts: []
        });
    });

    it("activates a pending agenda and records both agenda references", () => {
        const current = {
            ...state(),
            agenda: [
                state().agenda[0],
                {
                    id: "agenda-2",
                    title: "next",
                    question: "next question",
                    status: "pending" as const,
                    requiredOutputIds: ["output-1"],
                    requiredReviewerIds: []
                }
            ]
        };
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "activate_agenda",
                agendaId: "agenda-2",
                previousDisposition: "completed",
                reason: "move on"
            },
            captain,
            10,
            "fact-2"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.version).toBe(4);
        expect(result.state.agenda.map(({ id, status }) => ({ id, status }))).toEqual([
            { id: "agenda-1", status: "completed" },
            { id: "agenda-2", status: "active" }
        ]);
        expect(result.facts[0]).toEqual({
            id: "fact-2",
            kind: "activate_agenda",
            actorId: "identity-1",
            occurredAt: 10,
            relatedIds: ["meeting-1", "agenda-1", "agenda-2"],
            payload: { kind: "references", relatedIds: ["meeting-1", "agenda-1", "agenda-2"] }
        });
        expect(result.state.lifecycle).toBe(current.lifecycle);
        expect(result.state.lifecycle).toEqual(current.lifecycle);
    });

    it.each([
        ["local actor", local, "running", "pending", "UNAUTHORIZED"],
        ["missing target", captain, "running", "pending", "NOT_FOUND"],
        ["paused lifecycle", captain, "paused", "pending", "INVALID_STATE"],
        ["converging lifecycle", captain, "converging", "pending", "INVALID_STATE"],
        ["ending lifecycle", captain, "ending", "pending", "INVALID_STATE"],
        ["target is not pending", captain, "running", "completed", "INVALID_STATE"],
        ["open round", captain, "running", "pending", "PRECONDITION_FAILED"]
    ] as const)("rejects agenda activation: %s", (_name, actor, status, targetStatus, code) => {
        const fixture = state(status);
        const current = {
            ...fixture,
            agenda: [
                fixture.agenda[0],
                {
                    id: "agenda-2",
                    title: "next",
                    question: "next question",
                    status: targetStatus,
                    requiredOutputIds: ["output-1"],
                    requiredReviewerIds: []
                }
            ] as const,
            rounds:
                code === "PRECONDITION_FAILED"
                    ? [
                          {
                              id: "round-1",
                              agendaId: "agenda-1",
                              publicBaselinePublicationIds: [],
                              openedAt: 1,
                              status: "open" as const,
                              contributionIds: []
                          }
                      ]
                    : []
        };
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "activate_agenda",
                agendaId: code === "NOT_FOUND" ? "missing-agenda" : "agenda-2",
                previousDisposition: "completed",
                reason: "move on"
            },
            actor,
            10,
            "fact-2"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it.each([
        ["empty reason", { kind: "pause_meeting", reason: " " }, local, 10, "fact-1"],
        ["invalid time", { kind: "pause_meeting", reason: "pause" }, local, -1, "fact-1"],
        ["invalid fact", { kind: "pause_meeting", reason: "pause" }, local, 10, " "]
    ] as const)("rejects %s as invalid argument", (_name, action, actor, now, factId) => {
        const current = state();
        const result = transitionMeetingStateV1(current, action, actor, now, factId);
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "INVALID_ARGUMENT",
            facts: []
        });
    });

    it("rejects future actions until their transition step is implemented", () => {
        const current = state();
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "raise_agenda_candidate",
                title: "candidate",
                reason: "raise"
            },
            local,
            10,
            "fact-1"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "INVALID_ARGUMENT",
            facts: []
        });
    });

    it("raises a candidate for an existing identity", () => {
        const current = state();
        const result = transitionMeetingStateV1(
            current,
            { kind: "raise_agenda_candidate", title: "new agenda", reason: "needed" },
            captain,
            10,
            "fact-3",
            "candidate-1"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.agendaCandidates).toEqual([
            { id: "candidate-1", title: "new agenda", reason: "needed", status: "pending" }
        ]);
        expect(result.facts[0].relatedIds).toEqual(["meeting-1", "candidate-1"]);
    });

    it("accepts a candidate source message when it belongs to the meeting", () => {
        const current = state();
        current.rounds = [
            {
                id: "round-1",
                agendaId: "agenda-1",
                publicBaselinePublicationIds: [],
                openedAt: 0,
                status: "published",
                contributionIds: [],
                publicationId: "publication-1"
            }
        ];
        current.publications = [
            {
                id: "publication-1",
                roundId: "round-1",
                seq: 1,
                finalVersionIds: [],
                finalReviewIds: [],
                publishedAt: 0,
                exitReasons: []
            }
        ];
        current.messages = [
            {
                id: "message-1",
                seq: 1,
                actorId: "identity-1",
                agendaId: "agenda-1",
                kind: "note",
                body: "source",
                publicationId: "publication-1",
                relatedIds: [],
                createdAt: 0
            }
        ];
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "raise_agenda_candidate",
                title: "new agenda",
                reason: "needed",
                sourceMessageId: "message-1"
            },
            captain,
            10,
            "fact-3",
            "candidate-1"
        );
        expect(result.kind).toBe("accepted");
    });

    it.each([
        [
            "local raise",
            local,
            { kind: "raise_agenda_candidate", title: "x", reason: "x" },
            "UNAUTHORIZED"
        ],
        [
            "missing source",
            captain,
            {
                kind: "raise_agenda_candidate",
                title: "x",
                reason: "x",
                sourceMessageId: "message-1"
            },
            "NOT_FOUND"
        ],
        [
            "invalid source id",
            captain,
            { kind: "raise_agenda_candidate", title: "x", reason: "x", sourceMessageId: " " },
            "INVALID_ARGUMENT"
        ]
    ] as const)("rejects candidate raise: %s", (_name, actor, action, code) => {
        const current = state();
        const result = transitionMeetingStateV1(
            current,
            action,
            actor,
            10,
            "fact-3",
            "candidate-1"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it("allows an existing non Captain identity to raise a candidate", () => {
        const current = candidateState();
        const result = transitionMeetingStateV1(
            current,
            { kind: "raise_agenda_candidate", title: "x", reason: "x" },
            reviewer,
            10,
            "fact-3",
            "candidate-2"
        );
        expect(result.kind).toBe("accepted");
    });

    it.each(["parked", "rejected"] as const)(
        "disposes a pending candidate as %s",
        (disposition) => {
            const current = {
                ...state(),
                agendaCandidates: [
                    { id: "candidate-1", title: "x", reason: "x", status: "pending" as const }
                ]
            };
            const result = transitionMeetingStateV1(
                current,
                {
                    kind: "dispose_agenda_candidate",
                    candidateId: "candidate-1",
                    disposition,
                    reason: "decide"
                },
                captain,
                10,
                "fact-3"
            );
            expect(result.kind).toBe("accepted");
            if (result.kind !== "accepted") return;
            expect(result.state.agendaCandidates[0].status).toBe(disposition);
            expect(result.state.agenda).toBe(current.agenda);
            expect(result.facts[0].relatedIds).toEqual(["meeting-1", "candidate-1"]);
        }
    );

    it("rejects a parked disposal by a non Captain identity", () => {
        const current = candidateState();
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_agenda_candidate",
                candidateId: "candidate-1",
                disposition: "parked",
                reason: "decide"
            },
            reviewer,
            10,
            "fact-3"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "UNAUTHORIZED",
            facts: []
        });
        expect(result.state).toBe(current);
        expect(result.state.version).toBe(3);
    });

    it.each([
        ["repeat disposition", "parked", undefined, "INVALID_STATE"],
        [
            "attached agenda on reject",
            "pending",
            {
                id: "agenda-2",
                title: "next",
                question: "next question",
                requiredOutputIds: ["output-1"],
                requiredReviewerIds: ["identity-1"]
            },
            "PRECONDITION_FAILED"
        ]
    ] as const)("rejects invalid candidate disposal: %s", (_name, status, promotedAgenda, code) => {
        const current = {
            ...state(),
            agendaCandidates: [{ id: "candidate-1", title: "x", reason: "x", status }]
        };
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_agenda_candidate",
                candidateId: "candidate-1",
                disposition: "rejected",
                reason: "decide",
                ...(promotedAgenda === undefined ? {} : { promotedAgenda })
            },
            captain,
            10,
            "fact-3"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it.each([
        ["missing reviewer", ["missing-reviewer"], "NOT_FOUND"],
        ["bad promoted structure", ["reviewer-1"], "INVALID_ARGUMENT"]
    ] as const)("rejects promotion input: %s", (_name, reviewerIds, code) => {
        const current = candidateState();
        const action = {
            kind: "dispose_agenda_candidate" as const,
            candidateId: "candidate-1",
            disposition: "promoted" as const,
            reason: "approve",
            promotedAgenda:
                _name === "bad promoted structure"
                    ? null
                    : {
                          id: "agenda-2",
                          title: "next",
                          question: "next question",
                          requiredOutputIds: ["output-1"],
                          requiredReviewerIds: reviewerIds
                      }
        };
        const result = transitionMeetingStateV1(current, action as never, captain, 10, "fact-3");
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
        expect(result.state).toBe(current);
    });

    it("promotes a candidate atomically with a pending agenda and reviewer responsibility", () => {
        const current = candidateState();
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_agenda_candidate",
                candidateId: "candidate-1",
                disposition: "promoted",
                reason: "approve",
                promotedAgenda: {
                    id: "agenda-2",
                    title: "next",
                    question: "next question",
                    requiredOutputIds: ["output-1"],
                    requiredReviewerIds: ["reviewer-1"]
                }
            },
            captain,
            10,
            "fact-3"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.version).toBe(4);
        expect(result.state.updatedAt).toBe(10);
        expect(result.state.agenda[0]).toBe(current.agenda[0]);
        expect(result.state.agenda[0].status).toBe("active");
        expect(result.state.agenda.at(-1)).toEqual({
            id: "agenda-2",
            title: "next",
            question: "next question",
            requiredOutputIds: ["output-1"],
            requiredReviewerIds: ["reviewer-1"],
            status: "pending"
        });
        expect(result.state.agendaCandidates[0].status).toBe("promoted");
        expect(result.state.identities.at(-1)?.reviewResponsibilityIds).toEqual(["agenda-2"]);
        expect(result.state.identities.at(-1)?.roles).toEqual(current.identities.at(-1)?.roles);
        expect(result.facts[0]).toEqual({
            id: "fact-3",
            kind: "dispose_agenda_candidate",
            actorId: "identity-1",
            occurredAt: 10,
            relatedIds: ["meeting-1", "candidate-1", "agenda-2", "reviewer-1"],
            payload: {
                kind: "references",
                relatedIds: ["meeting-1", "candidate-1", "agenda-2", "reviewer-1"]
            }
        });
    });

    it.each([
        ["missing candidate", "missing", "parked", "NOT_FOUND"],
        ["promoted without agenda", "candidate-1", "promoted", "PRECONDITION_FAILED"]
    ] as const)("rejects candidate disposal: %s", (_name, candidateId, _disposition, code) => {
        const current = {
            ...state(),
            agendaCandidates: [
                { id: "candidate-1", title: "x", reason: "x", status: "pending" as const }
            ]
        };
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_agenda_candidate",
                candidateId,
                disposition: code === "PRECONDITION_FAILED" ? "promoted" : "parked",
                reason: "decide"
            },
            captain,
            10,
            "fact-3"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it.each([captain, manager, reviewer])(
        "records a question for each allowed identity",
        (actor) => {
            const current = publishedQuestionState(false);
            const result = transitionMeetingStateV1(
                current,
                {
                    kind: "record_question",
                    agendaId: "agenda-1",
                    text: "clarify",
                    affectedOutputIds: ["output-1"],
                    affectedCriterionIds: [],
                    affectedConstraintIds: [],
                    blocking: true
                },
                actor,
                10,
                "fact-5",
                `question-${actor.id}`
            );
            expect(result.kind).toBe("accepted");
            if (result.kind !== "accepted") return;
            const questionId = `question-${actor.id}`;
            expect(result.state.questions[1]).toEqual({
                id: questionId,
                actorId: actor.id,
                agendaId: "agenda-1",
                text: "clarify",
                affectedOutputIds: ["output-1"],
                affectedCriterionIds: [],
                affectedConstraintIds: [],
                blocking: true,
                status: "open"
            });
            expect(result.facts).toEqual([
                {
                    id: "fact-5",
                    kind: "record_question",
                    actorId: actor.id,
                    occurredAt: 10,
                    relatedIds: ["meeting-1", questionId],
                    payload: { kind: "references", relatedIds: ["meeting-1", questionId] }
                }
            ]);
        }
    );

    it.each([
        ["local record", local, recordQuestion(), "UNAUTHORIZED"],
        ["missing agenda", captain, recordQuestion({ agendaId: "missing" }), "NOT_FOUND"],
        ["local resolve", local, resolveQuestion(), "UNAUTHORIZED"],
        ["manager resolve", manager, resolveQuestion(), "UNAUTHORIZED"],
        ["reviewer resolve", reviewer, resolveQuestion(), "UNAUTHORIZED"],
        ["missing question", captain, resolveQuestion({ questionId: "missing" }), "NOT_FOUND"],
        [
            "missing evidence",
            captain,
            resolveQuestion({ evidenceIds: ["missing-version"] }),
            "NOT_FOUND"
        ],
        [
            "blocking without target",
            captain,
            recordQuestion({ blocking: true }),
            "PRECONDITION_FAILED"
        ],
        [
            "missing objective target",
            captain,
            recordQuestion({ affectedOutputIds: ["missing-output"] }),
            "NOT_FOUND"
        ],
        [
            "duplicate affected ids",
            captain,
            recordQuestion({ affectedOutputIds: ["output-1", "output-1"] }),
            "INVALID_ARGUMENT"
        ]
    ] as const)("rejects question operation: %s", (_name, actor, action, code) => {
        const current = publishedQuestionState(false);
        const result = transitionMeetingStateV1(current, action, actor, 10, "fact-6", "question-2");
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it("rejects evidence that has not been published", () => {
        const current = publishedQuestionState(false);
        current.publications[0].finalVersionIds = [];
        const result = transitionMeetingStateV1(current, resolveQuestion(), captain, 10, "fact-6");
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "PRECONDITION_FAILED",
            facts: []
        });
    });

    it.each(["answered", "withdrawn"] as const)("rejects a repeated %s resolution", (status) => {
        const current = publishedQuestionState(false);
        current.questions[0].status = status;
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "resolve_question",
                questionId: "question-1",
                status: "answered",
                rationale: "done",
                evidenceIds: ["version-1"]
            },
            captain,
            10,
            "fact-6"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "INVALID_STATE",
            facts: []
        });
    });

    it.each([
        ["answered", true, false],
        ["withdrawn", true, false],
        ["deferred false", false, false],
        ["deferred true", true, true]
    ] as const)("resolves a question as %s", (_name, oldBlocking, newBlocking) => {
        const current = publishedQuestionState(oldBlocking);
        const status = _name.startsWith("deferred")
            ? "deferred"
            : (_name as "answered" | "withdrawn");
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "resolve_question",
                questionId: "question-1",
                status,
                rationale: "resolved",
                evidenceIds: ["version-1"]
            },
            captain,
            10,
            "fact-5"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.questions[0].blocking).toBe(newBlocking);
        expect(result.facts[0]).toEqual({
            id: "fact-5",
            kind: "resolve_question",
            actorId: "identity-1",
            occurredAt: 10,
            relatedIds: ["meeting-1", "question-1", "version-1"],
            payload: {
                kind: "question_disposition",
                questionId: "question-1",
                oldStatus: "open",
                newStatus: status,
                oldBlocking,
                newBlocking,
                rationale: "resolved",
                evidenceIds: ["version-1"]
            }
        });
    });

    it.each([captain, manager, reviewer])("records an issue for an existing identity", (actor) => {
        const current = publishedQuestionState(false);
        const result = transitionMeetingStateV1(
            current,
            recordIssue(),
            actor,
            10,
            "fact-7",
            `issue-${actor.id}`
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.issues[0]).toEqual({
            id: `issue-${actor.id}`,
            agendaId: "agenda-1",
            description: "risk",
            riskLevel: "high",
            classification: "blocking",
            affectedOutputIds: ["output-1"],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            requiredReviewerIds: [],
            blocking: true,
            status: "open",
            rationale: "because"
        });
        expect(result.facts).toEqual([
            {
                id: "fact-7",
                kind: "record_issue",
                actorId: actor.id,
                occurredAt: 10,
                relatedIds: ["meeting-1", `issue-${actor.id}`],
                payload: { kind: "references", relatedIds: ["meeting-1", `issue-${actor.id}`] }
            }
        ]);
    });

    it.each([
        ["local record", local, recordIssue(), "UNAUTHORIZED"],
        ["local dispose", local, disposeIssue(), "UNAUTHORIZED"],
        ["manager dispose", manager, disposeIssue(), "UNAUTHORIZED"],
        [
            "accepted risk",
            captain,
            recordIssue({ riskLevel: "low", classification: "accepted_risk" }),
            "INVALID_ARGUMENT"
        ],
        ["missing risk", captain, recordIssue({ riskLevel: undefined }), "INVALID_ARGUMENT"],
        [
            "high nonblocking",
            captain,
            recordIssue({ blocking: false, classification: "follow_up" }),
            "PRECONDITION_FAILED"
        ],
        [
            "unqualified blocking",
            captain,
            recordIssue({
                riskLevel: "medium",
                blocking: true,
                classification: "blocking",
                affectedOutputIds: []
            }),
            "PRECONDITION_FAILED"
        ],
        [
            "classification mismatch",
            captain,
            recordIssue({ blocking: false }),
            "PRECONDITION_FAILED"
        ],
        ["missing target", captain, recordIssue({ affectedOutputIds: ["missing"] }), "NOT_FOUND"],
        [
            "duplicate ids",
            captain,
            recordIssue({ affectedOutputIds: ["output-1", "output-1"] }),
            "INVALID_ARGUMENT"
        ],
        ["missing issue", captain, disposeIssue({ issueId: "missing" }), "NOT_FOUND"],
        ["missing evidence", captain, disposeIssue({ evidenceIds: ["missing"] }), "NOT_FOUND"]
    ] as const)("rejects issue operation: %s", (_name, actor, action, code) => {
        const current =
            action.kind === "dispose_issue" ? issueState() : publishedQuestionState(false);
        const result = transitionMeetingStateV1(current, action, actor, 10, "fact-8", "issue-2");
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it.each([
        ["resolved", true, false],
        ["out_of_scope", true, false],
        ["deferred", true, true]
    ] as const)("disposes an issue as %s", (status, oldBlocking, newBlocking) => {
        const current = issueState(oldBlocking);
        const result = transitionMeetingStateV1(
            current,
            disposeIssue({ status }),
            captain,
            10,
            "fact-9"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.issues[0]).toMatchObject({
            status,
            blocking: newBlocking,
            classification: "blocking"
        });
        expect(result.facts).toEqual([
            {
                id: "fact-9",
                kind: "dispose_issue",
                actorId: "identity-1",
                occurredAt: 10,
                relatedIds: ["meeting-1", "issue-1", "version-1"],
                payload: {
                    kind: "issue_disposition",
                    issueId: "issue-1",
                    oldStatus: "open",
                    newStatus: status,
                    oldBlocking,
                    newBlocking,
                    rationale: "handled",
                    evidenceIds: ["version-1"]
                }
            }
        ]);
    });

    it.each(["resolved", "out_of_scope"] as const)(
        "rejects disposing an already %s issue",
        (status) => {
            const current = issueState(false, status);
            const result = transitionMeetingStateV1(current, disposeIssue(), captain, 10, "fact-9");
            expect(result).toEqual({
                kind: "rejected",
                state: current,
                code: "INVALID_STATE",
                facts: []
            });
        }
    );

    it("rejects unpublished evidence and preserves the issue state", () => {
        const current = issueState();
        current.publications[0].finalVersionIds = [];
        const result = transitionMeetingStateV1(current, disposeIssue(), captain, 10, "fact-9");
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "PRECONDITION_FAILED",
            facts: []
        });
    });

    it("records a manager plan and supersedes the prior active plan atomically", () => {
        const current = publishedQuestionState(false);
        current.agenda = [
            ...current.agenda,
            {
                id: "agenda-2",
                title: "other",
                question: "other",
                status: "pending",
                requiredOutputIds: ["output-1"],
                requiredReviewerIds: []
            }
        ];
        current.managerPlans = [
            {
                id: "plan-old",
                agendaId: "agenda-1",
                managerId: "manager-1",
                kind: "continue_agenda",
                rationale: "old",
                createdAt: 1,
                status: "active"
            },
            {
                id: "plan-other",
                agendaId: "agenda-2",
                managerId: "manager-1",
                kind: "stop_agenda",
                rationale: "other",
                createdAt: 1,
                status: "active"
            }
        ];
        const result = transitionMeetingStateV1(
            current,
            planNextStep({ planKind: "open_round" }),
            manager,
            10,
            "fact-10",
            "plan-new"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.version).toBe(4);
        expect(result.state.updatedAt).toBe(10);
        expect(result.state.managerPlans).toEqual([
            { ...current.managerPlans[0], status: "superseded" },
            current.managerPlans[1],
            {
                id: "plan-new",
                agendaId: "agenda-1",
                managerId: "manager-1",
                kind: "open_round",
                rationale: "next",
                createdAt: 10,
                status: "active"
            }
        ]);
        expect(result.state.agenda).toBe(current.agenda);
        expect(result.state.identities).toBe(current.identities);
        expect(result.state.rounds).toBe(current.rounds);
        expect(result.facts).toEqual([
            {
                id: "fact-10",
                kind: "plan_next_step",
                actorId: "manager-1",
                occurredAt: 10,
                relatedIds: ["meeting-1", "plan-new", "agenda-1", "plan-old"],
                payload: {
                    kind: "references",
                    relatedIds: ["meeting-1", "plan-new", "agenda-1", "plan-old"]
                }
            }
        ]);
    });

    it.each([
        ["local", local, planNextStep(), "UNAUTHORIZED"],
        ["captain", captain, planNextStep(), "UNAUTHORIZED"],
        ["missing agenda", manager, planNextStep({ agendaId: "missing" }), "NOT_FOUND"]
    ] as const)("rejects invalid plan actor or target: %s", (_name, actor, action, code) => {
        const current = publishedQuestionState(false);
        const result = transitionMeetingStateV1(current, action, actor, 10, "fact-10", "plan-new");
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it("rejects planning while any round is open", () => {
        const current = state();
        current.identities = [
            ...current.identities,
            {
                id: "manager-1",
                displayName: "Manager",
                roles: ["manager"],
                agendaResponsibilityIds: [],
                reviewResponsibilityIds: [],
                riskAuthority: false,
                required: false
            }
        ];
        current.rounds = [
            {
                id: "round-open",
                agendaId: "agenda-1",
                publicBaselinePublicationIds: [],
                openedAt: 0,
                status: "open",
                contributionIds: []
            }
        ];
        const result = transitionMeetingStateV1(
            current,
            planNextStep(),
            manager,
            10,
            "fact-10",
            "plan-new"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "PRECONDITION_FAILED",
            facts: []
        });
    });

    it("appends a plan when the agenda has no active plan", () => {
        const current = publishedQuestionState(false);
        const result = transitionMeetingStateV1(
            current,
            planNextStep(),
            manager,
            10,
            "fact-10",
            "plan-new"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.managerPlans).toEqual([
            {
                id: "plan-new",
                agendaId: "agenda-1",
                managerId: "manager-1",
                kind: "continue_agenda",
                rationale: "next",
                createdAt: 10,
                status: "active"
            }
        ]);
        expect(result.facts[0].relatedIds).toEqual(["meeting-1", "plan-new", "agenda-1"]);
    });

    it("rejects planning after the meeting is terminal", () => {
        const current = terminalState("terminal");
        current.identities = [
            ...current.identities,
            {
                id: "manager-1",
                displayName: "Manager",
                roles: ["manager"],
                agendaResponsibilityIds: [],
                reviewResponsibilityIds: [],
                riskAuthority: false,
                required: false
            }
        ];
        const result = transitionMeetingStateV1(
            current,
            planNextStep(),
            manager,
            10,
            "fact-10",
            "plan-new"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "MEETING_TERMINAL",
            facts: []
        });
    });
});
