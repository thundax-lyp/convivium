import { expect, it } from "vitest";
import { transitionMeetingState } from "@/domain/meeting-state-transitions.js";
import {
    local,
    captain,
    identity,
    reviewer,
    manager,
    recordQuestion,
    resolveQuestion,
    publishedQuestionState,
    recordIssue,
    disposeIssue,
    issueState
} from "./meeting-state-transitions-fixtures.js";

it.each([
    ["local record", local, recordQuestion(), "UNAUTHORIZED"],
    ["missing agenda", identity, recordQuestion({ agendaId: "missing" }), "NOT_FOUND"],
    ["contributor resolve", identity, resolveQuestion(), "UNAUTHORIZED"],
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
        identity,
        recordQuestion({ blocking: true }),
        "PRECONDITION_FAILED"
    ],
    [
        "missing objective target",
        identity,
        recordQuestion({ affectedOutputIds: ["missing-output"] }),
        "NOT_FOUND"
    ],
    [
        "duplicate affected ids",
        identity,
        recordQuestion({ affectedOutputIds: ["output-1", "output-1"] }),
        "INVALID_ARGUMENT"
    ]
] as const)("rejects question operation: %s", (_name, actor, action, code) => {
    const current = publishedQuestionState(false);
    const result = transitionMeetingState(current, action, actor, 10, "fact-6", "question-2");
    expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
});

it("rejects evidence that has not been published", () => {
    const current = publishedQuestionState(false);
    current.publications[0].finalVersionIds = [];
    const result = transitionMeetingState(current, resolveQuestion(), captain, 10, "fact-6");
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
    const result = transitionMeetingState(
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
    const status = _name.startsWith("deferred") ? "deferred" : (_name as "answered" | "withdrawn");
    const result = transitionMeetingState(
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
        actorId: captain.id,
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

it.each([identity, manager, reviewer])("records an issue for an existing identity", (actor) => {
    const current = publishedQuestionState(false);
    const result = transitionMeetingState(
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
        actorId: actor.id,
        agendaId: "agenda-1",
        description: "risk",
        riskLevel: "high",
        classification: "blocking",
        affectedOutputIds: ["output-1"],
        affectedCriterionIds: [],
        affectedConstraintIds: [],
        requiresEvidenceReview: false,
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
    ["contributor dispose", identity, disposeIssue(), "UNAUTHORIZED"],
    ["manager dispose", manager, disposeIssue(), "UNAUTHORIZED"],
    [
        "accepted risk",
        identity,
        recordIssue({ riskLevel: "low", classification: "accepted_risk" }),
        "INVALID_ARGUMENT"
    ],
    ["missing risk", identity, recordIssue({ riskLevel: undefined }), "INVALID_ARGUMENT"],
    [
        "high nonblocking",
        identity,
        recordIssue({ blocking: false, classification: "follow_up" }),
        "PRECONDITION_FAILED"
    ],
    [
        "unqualified blocking",
        identity,
        recordIssue({
            riskLevel: "medium",
            blocking: true,
            classification: "blocking",
            affectedOutputIds: []
        }),
        "PRECONDITION_FAILED"
    ],
    ["classification mismatch", identity, recordIssue({ blocking: false }), "PRECONDITION_FAILED"],
    ["missing target", identity, recordIssue({ affectedOutputIds: ["missing"] }), "NOT_FOUND"],
    [
        "duplicate ids",
        identity,
        recordIssue({ affectedOutputIds: ["output-1", "output-1"] }),
        "INVALID_ARGUMENT"
    ],
    ["missing issue", captain, disposeIssue({ issueId: "missing" }), "NOT_FOUND"],
    ["missing evidence", captain, disposeIssue({ evidenceIds: ["missing"] }), "NOT_FOUND"]
] as const)("rejects issue operation: %s", (_name, actor, action, code) => {
    const current = action.kind === "dispose_issue" ? issueState() : publishedQuestionState(false);
    const result = transitionMeetingState(current, action, actor, 10, "fact-8", "issue-2");
    expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
});

it.each([
    ["resolved", true, false],
    ["out_of_scope", true, false],
    ["deferred", true, true]
] as const)("disposes an issue as %s", (status, oldBlocking, newBlocking) => {
    const current = issueState(oldBlocking);
    const result = transitionMeetingState(current, disposeIssue({ status }), captain, 10, "fact-9");
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
            actorId: captain.id,
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
        const result = transitionMeetingState(current, disposeIssue(), captain, 10, "fact-9");
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
    const result = transitionMeetingState(current, disposeIssue(), captain, 10, "fact-9");
    expect(result).toEqual({
        kind: "rejected",
        state: current,
        code: "PRECONDITION_FAILED",
        facts: []
    });
});

it("clears the final blocking issue and enters converging in the same transition", () => {
    const current = issueState(true, "open");
    current.objective.requiredOutputs[0].status = "satisfied";
    current.objective.acceptanceCriteria = [];
    current.objective.hardConstraints[0].status = "satisfied";
    current.reviews = [
        {
            id: "review-1",
            versionId: "version-1",
            reviewerId: "reviewer-1",
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
    ];
    current.evidencePackages[0].versions[0].status = "validated";
    current.reviewDeliveries = [
        {
            id: "delivery-1",
            reviewId: "review-1",
            authorId: "contributor-1",
            status: "sent",
            sentAt: 0
        }
    ];
    current.publications[0].finalReviewIds = ["review-1"];
    current.proposals = [
        {
            id: "proposal-1",
            proposalId: "proposal-group-1",
            ordinal: 1,
            actorId: "identity-1",
            agendaId: "agenda-1",
            summary: "x",
            body: "x",
            evidenceIds: ["version-1"],
            createdAt: 0
        }
    ];
    current.decisionCandidates = [
        {
            id: "candidate-1",
            proposalRevisionId: "proposal-1",
            actorId: "identity-1",
            outcome: "adopt",
            rationale: "x",
            evidenceIds: ["version-1"],
            positionIds: [],
            createdAt: 0
        }
    ];
    current.decisions = [
        {
            ...current.decisionCandidates[0],
            id: "decision-1",
            candidateId: "candidate-1",
            status: "accepted"
        }
    ];
    current.completionFacts = [
        {
            id: "fact-1",
            outputId: "output-1",
            actorId: captain.id,
            status: "active",
            statement: "done",
            rationale: "x",
            evidenceIds: ["version-1"],
            decisionIds: ["decision-1"],
            createdAt: 0
        }
    ];
    const result = transitionMeetingState(
        current,
        disposeIssue({ status: "resolved" }),
        captain,
        10,
        "fact-9"
    );
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") return;
    expect(result.state.lifecycle).toMatchObject({
        status: "converging",
        changedAt: 10,
        changedBy: captain.id,
        reason: "objective_satisfied"
    });
    expect(result.state.termination).toBeUndefined();
    expect(result.state.archive).toBeUndefined();
    expect(result.state.issues[0].status).toBe("resolved");
    expect(result.state.version).toBe(current.version + 1);
    expect(result.facts[0].payload).toMatchObject({
        kind: "issue_disposition",
        issueId: "issue-1",
        newStatus: "resolved"
    });
    expect(current.issues[0].status).toBe("open");
});
