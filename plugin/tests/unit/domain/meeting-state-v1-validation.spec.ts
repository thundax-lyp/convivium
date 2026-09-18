import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-v1-validation.js";

describe("canonical MeetingState validation", () => {
    it("accepts the target fixture", () => {
        const state = makeRunningMeetingStateV1();
        expect(validateMeetingStateV1(state)).toEqual({ kind: "valid", state });
    });
    it("requires exactly one evidence reviewer", () => {
        const state = makeRunningMeetingStateV1();
        expect(validateMeetingStateV1({ ...state, evidenceReviewerId: "missing" })).toMatchObject({
            kind: "invalid",
            path: "$.evidenceReviewerId"
        });
    });
    it("rejects the removed compatibility projection field", () => {
        const state = makeRunningMeetingStateV1();
        expect(validateMeetingStateV1({ ...state, formatApprovals: [] })).toMatchObject({
            kind: "invalid",
            path: "$.formatApprovals"
        });
    });
    it("enforces round abort pair", () => {
        const state = makeRunningMeetingStateV1();
        const round = {
            id: "round-1",
            agendaId: "agenda-v1",
            publicBaselinePublicationIds: [],
            openedAt: 0,
            status: "aborted" as const,
            contributionIds: [],
            abortReason: "x",
            abortedAt: 1
        };
        expect(validateMeetingStateV1({ ...state, rounds: [round] })).toMatchObject({
            kind: "valid"
        });
        expect(
            validateMeetingStateV1({ ...state, rounds: [{ ...round, abortedAt: undefined }] })
        ).toMatchObject({ kind: "invalid" });
    });

    it("accepts a complete canonical archive package by value", () => {
        const state = makeRunningMeetingStateV1();
        const termination = {
            id: "termination-v1",
            outcome: "partial" as const,
            reason: "未完成目标",
            endedAt: 10,
            decisionIds: [],
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            unclosedContributionIds: []
        };
        const archive = {
            id: "archive-v1",
            status: "complete" as const,
            createdAt: 11,
            publicSnapshotVersion: 2,
            terminationId: termination.id,
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
            termination,
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            unresolvedItemIds: [],
            unclosedContributions: [],
            identityProvenance: [],
            exportMaterials: []
        };
        const archived = {
            ...state,
            version: 2,
            lifecycle: { status: "archiving" as const, changedAt: 11, changedBy: "runtime" },
            termination,
            archive
        };
        expect(validateMeetingStateV1(archived)).toEqual({ kind: "valid", state: archived });
    });

    it("rejects the legacy archive summary shape", () => {
        const state = makeRunningMeetingStateV1();
        const legacyArchive = {
            id: "archive-v1",
            createdAt: 11,
            createdBy: "runtime",
            terminationId: "termination-v1",
            publicSnapshotVersion: 1,
            includedPublicationIds: [],
            includedDecisionIds: [],
            includedCompletionFactIds: [],
            status: "complete",
            identityProvenance: []
        };
        expect(
            validateMeetingStateV1({
                ...state,
                lifecycle: { status: "archiving", changedAt: 11, changedBy: "runtime" },
                termination: {
                    id: "termination-v1",
                    outcome: "partial",
                    reason: "未完成目标",
                    endedAt: 10,
                    decisionIds: [],
                    completionFactIds: [],
                    unresolvedQuestionIds: [],
                    unresolvedIssueIds: [],
                    unclosedContributionIds: []
                },
                archive: legacyArchive
            })
        ).toMatchObject({ kind: "invalid" });
    });
});
