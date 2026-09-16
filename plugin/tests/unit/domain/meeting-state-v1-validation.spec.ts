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
