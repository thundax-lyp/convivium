import { describe, expect, it } from "vitest";
import {
    CreateMeetingResultSchema,
    CreateMeetingInputSchema,
    CaptainDecisionDispositionInputSchema,
    CaptainRiskDispositionInputSchema,
    EndMeetingInputSchema,
    EndMeetingResultSchema,
    LocalMeetingListItemSchema,
    LocalMeetingListResponseConsumerSchema,
    LocalMeetingListResponseSchema,
    LocalMeetingListResultSchema,
    MeetingArchivePackageSchema,
    ManagerPlanResultSchema,
    ManagerPlanSubmissionSchema,
    MeetingStatusResultSchema,
    validateProtocolError,
    isKnownMeetingProtocolErrorCode,
    validateProtocolSuccessEnvelope,
    MeetingTaskRequestSchema,
    MeetingTaskFinishResultSchema,
    CaptainDecisionDispositionResultSchema,
    validateReassignTurnInput,
    TurnSubmissionSchema
} from "../../src/protocol/index.js";

describe("protocol envelope schemas", () => {
    it("rejects malformed Captain risk disposition input before runtime", () => {
        const input = {
            protocolVersion: 1,
            meetingId: "meeting-1",
            expectedMeetingVersion: 3,
            requestId: "request-1",
            issueId: "issue-1",
            decision: "accept" as const,
            reason: "Captain accepts the documented risk.",
            evidenceMessageIds: ["message-1"]
        };
        expect(CaptainRiskDispositionInputSchema(input)).toEqual(input);
        expect(() => CaptainRiskDispositionInputSchema({ ...input, extra: true })).toThrow();
        expect(() => CaptainRiskDispositionInputSchema({ ...input, issueId: " " })).toThrow();
        expect(() => CaptainRiskDispositionInputSchema({ ...input, reason: " " })).toThrow();
        expect(() =>
            CaptainRiskDispositionInputSchema({ ...input, evidenceMessageIds: [] })
        ).toThrow();
        expect(() =>
            CaptainRiskDispositionInputSchema({
                ...input,
                evidenceMessageIds: ["message-1", "message-1"]
            })
        ).toThrow();
    });

    it("validates Decision disposition conditional result and input fields", () => {
        const supersedeInput = {
            protocolVersion: 1,
            meetingId: "meeting-1",
            expectedMeetingVersion: 3,
            requestId: "request-1",
            decisionId: "decision-1",
            action: "supersede" as const,
            reason: "Replace with current candidate",
            evidenceMessageIds: ["message-1"],
            replacementCandidateId: "candidate-2"
        };
        const revokeInput = { ...supersedeInput, action: "revoke" as const };
        delete (revokeInput as { replacementCandidateId?: string }).replacementCandidateId;
        expect(CaptainDecisionDispositionInputSchema(supersedeInput)).toEqual(supersedeInput);
        expect(CaptainDecisionDispositionInputSchema(revokeInput)).toEqual(revokeInput);
        expect(() =>
            CaptainDecisionDispositionInputSchema({
                ...revokeInput,
                replacementCandidateId: "candidate-2"
            })
        ).toThrow();
        expect(() =>
            CaptainDecisionDispositionInputSchema({
                ...supersedeInput,
                replacementCandidateId: undefined
            })
        ).toThrow();
        expect(() =>
            CaptainDecisionDispositionInputSchema({ ...supersedeInput, extra: true })
        ).toThrow();

        const supersedeResult = {
            requestId: "request-1",
            decisionId: "decision-1",
            action: "supersede" as const,
            completionFactId: "completion-1",
            replacementDecisionId: "decision-2"
        };
        const revokeResult = { ...supersedeResult, action: "revoke" as const };
        delete (revokeResult as { replacementDecisionId?: string }).replacementDecisionId;
        expect(CaptainDecisionDispositionResultSchema(supersedeResult)).toEqual(supersedeResult);
        expect(CaptainDecisionDispositionResultSchema(revokeResult)).toEqual(revokeResult);
        for (const field of ["requestId", "decisionId", "action", "completionFactId"] as const) {
            expect(() =>
                CaptainDecisionDispositionResultSchema({ ...supersedeResult, [field]: undefined })
            ).toThrow();
        }
        expect(() =>
            CaptainDecisionDispositionResultSchema({
                ...supersedeResult,
                replacementDecisionId: undefined
            })
        ).toThrow();
        expect(() =>
            CaptainDecisionDispositionResultSchema({
                ...revokeResult,
                replacementDecisionId: "decision-2"
            })
        ).toThrow();
        expect(() =>
            CaptainDecisionDispositionResultSchema({ ...revokeResult, extra: true })
        ).toThrow();
    });

    it("validates an exact local meeting list response", () => {
        const item = {
            meetingId: "meeting-1",
            teamId: "team-1",
            topic: "Release",
            status: "running",
            meetingVersion: 3,
            updatedAt: 10
        } as const;
        const result = { meetings: [item] };
        const response = { protocolVersion: 1, ok: true, result } as const;

        expect(LocalMeetingListItemSchema(item)).toEqual(item);
        expect(LocalMeetingListResultSchema(result)).toEqual(result);
        expect(LocalMeetingListResponseSchema(response)).toEqual(response);
        expect(
            LocalMeetingListResponseConsumerSchema({
                ...response,
                optionalEnvelopeField: "future",
                result: {
                    ...result,
                    optionalResultField: "future",
                    meetings: [{ ...item, optionalItemField: "future" }]
                }
            })
        ).toMatchObject(response);

        for (const invalid of [
            { ...item, meetingId: undefined },
            { ...item, privateState: "hidden" }
        ]) {
            expect(() => LocalMeetingListItemSchema(invalid)).toThrow();
        }
        for (const invalid of [{}, { ...result, transcript: [] }]) {
            expect(() => LocalMeetingListResultSchema(invalid)).toThrow();
        }
        for (const invalid of [
            { protocolVersion: 1, ok: true },
            { ...response, meetingId: "meeting-1" },
            { ...response, meetingVersion: 3 }
        ]) {
            expect(() => LocalMeetingListResponseSchema(invalid)).toThrow();
        }
    });

    it("accepts local_host pause projection metadata", () => {
        expect(() =>
            MeetingStatusResultSchema({
                meetingId: "meeting-1",
                meetingVersion: 1,
                topic: "Release",
                objective: "Decide scope",
                continuationMaterials: [],
                limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
                activeAgendaItem: undefined,
                messages: [],
                questions: [],
                proposals: [],
                pendingDecisionCandidates: [],
                acceptedDecisions: [],
                decisionHistory: [],
                risks: [],
                blockingFacts: [],
                meetingTasks: [],
                status: "paused",
                stallCount: 0,
                maxStalls: 3,
                replanCount: 0,
                maxReplans: 1,
                pendingHandRaises: [],
                pauseControl: {
                    action: "resume",
                    pausedAt: 1,
                    pausedBy: { kind: "local_host", actorId: "loopback-web" },
                    reason: "manual pause"
                }
            })
        ).not.toThrow();
    });

    it("validates Manager plan input and result shapes", () => {
        const input = {
            protocolVersion: 1,
            meetingId: "meeting-1",
            planningAttemptId: "planning-1",
            observedMeetingVersion: 2,
            requestId: "request-1",
            agendaItemId: "agenda-1",
            intent: "review",
            objective: "Review the proposal",
            expectedOutputs: ["review"],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-1",
                    instruction: "Review the proposal",
                    reason: "required_reviewer"
                }
            ]
        };

        expect(ManagerPlanSubmissionSchema(input)).toEqual(input);
        expect(
            ManagerPlanResultSchema({
                status: "planned",
                turnId: "turn-1",
                firstStepId: "step-1",
                firstAttemptId: "attempt-1",
                fallbackApplied: false
            })
        ).toEqual({
            status: "planned",
            turnId: "turn-1",
            firstStepId: "step-1",
            firstAttemptId: "attempt-1",
            fallbackApplied: false
        });

        expect(() => ManagerPlanSubmissionSchema({ ...input, protocolVersion: 2 })).toThrow();
        expect(() => ManagerPlanSubmissionSchema({ ...input, steps: [] })).toThrow();
        expect(() =>
            ManagerPlanSubmissionSchema({
                ...input,
                steps: [{ ...input.steps[0], instruction: "" }]
            })
        ).toThrow();
        expect(() => ManagerPlanSubmissionSchema({ ...input, steps: "not-an-array" })).toThrow();
        expect(() =>
            ManagerPlanResultSchema({
                status: "planned",
                turnId: "",
                firstStepId: "step-1",
                firstAttemptId: "attempt-1",
                fallbackApplied: false
            })
        ).toThrow();
    });

    it("accepts a versioned success envelope", () => {
        expect(
            validateProtocolSuccessEnvelope(CreateMeetingResultSchema, {
                protocolVersion: 1,
                ok: true,
                meetingId: "meeting-1",
                meetingVersion: 3,
                result: {
                    meetingId: "meeting-1",
                    meetingVersion: 3,
                    status: "running",
                    participants: []
                }
            })
        ).toEqual({
            protocolVersion: 1,
            ok: true,
            meetingId: "meeting-1",
            meetingVersion: 3,
            result: {
                meetingId: "meeting-1",
                meetingVersion: 3,
                status: "running",
                participants: []
            }
        });
    });

    it("rejects an unsupported protocol version", () => {
        expect(() =>
            validateProtocolSuccessEnvelope(CreateMeetingResultSchema, {
                protocolVersion: 2,
                ok: true,
                meetingId: "meeting-1",
                meetingVersion: 3,
                result: {}
            })
        ).toThrow();

        expect(() =>
            validateProtocolSuccessEnvelope(CreateMeetingResultSchema, {
                protocolVersion: 1,
                ok: true,
                meetingId: "meeting-1",
                meetingVersion: 3,
                result: { status: "not-a-create-result" }
            })
        ).toThrow();
    });

    it("rejects inconsistent success envelope metadata", () => {
        expect(() =>
            validateProtocolSuccessEnvelope(CreateMeetingResultSchema, {
                protocolVersion: 1,
                ok: true,
                meetingId: "meeting-1",
                meetingVersion: 3,
                result: {
                    meetingId: "meeting-2",
                    meetingVersion: 3,
                    status: "running",
                    participants: []
                }
            })
        ).toThrow();

        expect(() =>
            validateProtocolSuccessEnvelope(CreateMeetingResultSchema, {
                protocolVersion: 1,
                ok: true,
                meetingId: "meeting-1",
                meetingVersion: 3,
                result: {
                    meetingId: "meeting-1",
                    meetingVersion: 4,
                    status: "running",
                    participants: []
                }
            })
        ).toThrow();
    });

    it("requires retryability on protocol errors", () => {
        expect(() =>
            validateProtocolError({
                protocolVersion: 1,
                ok: false,
                code: "INVALID_ARGUMENT",
                message: "invalid request"
            })
        ).toThrow();

        expect(
            validateProtocolError({
                protocolVersion: 1,
                ok: false,
                code: "UNKNOWN_ERROR",
                message: "invalid request",
                retryable: false
            })
        ).toMatchObject({ code: "UNKNOWN_ERROR", retryable: false });
        expect(isKnownMeetingProtocolErrorCode("INVALID_ARGUMENT")).toBe(true);
        expect(isKnownMeetingProtocolErrorCode("VERSION_CONFLICT")).toBe(true);
        expect(isKnownMeetingProtocolErrorCode("UNSUPPORTED_CAPABILITY")).toBe(true);
        expect(isKnownMeetingProtocolErrorCode("UNKNOWN_ERROR")).toBe(false);
    });

    it("preserves unsupported capabilities as non-retryable protocol errors", () => {
        expect(
            validateProtocolError({
                protocolVersion: 1,
                ok: false,
                code: "UNSUPPORTED_CAPABILITY",
                message: "manager selection is outside this runtime slice",
                retryable: false
            })
        ).toMatchObject({ code: "UNSUPPORTED_CAPABILITY", retryable: false });
    });

    it("validates MeetingTask request fields", () => {
        const input = {
            protocolVersion: 1,
            meetingId: "meeting-1",
            attemptId: "attempt-1",
            requestId: "request-1",
            title: "task",
            description: "work",
            blocking: false
        };
        expect(MeetingTaskRequestSchema(input)).toEqual(input);
        expect(() => MeetingTaskRequestSchema({ ...input, title: "" })).toThrow();
        expect(() => MeetingTaskRequestSchema({ ...input, description: "" })).toThrow();

        expect(() =>
            validateReassignTurnInput({
                protocolVersion: 1,
                meetingId: "meeting-1",
                expectedMeetingVersion: 1,
                currentAttemptId: "attempt-1",
                action: "skip",
                replacementParticipantId: "participant-2",
                reason: "unavailable",
                requestId: "request-1"
            })
        ).toThrow();

        expect(() =>
            validateReassignTurnInput({
                protocolVersion: 1,
                meetingId: "meeting-1",
                expectedMeetingVersion: 1,
                currentAttemptId: "attempt-1",
                action: "skip",
                replacementParticipantId: "",
                reason: "unavailable",
                requestId: "request-1"
            })
        ).toThrow();
    });

    it("allows failed task results to omit a hand raise id", () => {
        expect(
            MeetingTaskFinishResultSchema({
                requestId: "request-1",
                meetingTaskId: "task-1",
                status: "failed"
            })
        ).toEqual({
            requestId: "request-1",
            meetingTaskId: "task-1",
            status: "failed"
        });
        expect(
            MeetingTaskFinishResultSchema({
                requestId: "request-1",
                meetingTaskId: "task-1",
                status: "completed",
                handRaiseId: "raise-1"
            })
        ).toEqual({
            requestId: "request-1",
            meetingTaskId: "task-1",
            status: "completed",
            handRaiseId: "raise-1"
        });
        expect(() =>
            MeetingTaskFinishResultSchema({
                requestId: "request-1",
                meetingTaskId: "task-1",
                status: "completed"
            })
        ).toThrow();
        expect(() =>
            MeetingTaskFinishResultSchema({
                requestId: "request-1",
                meetingTaskId: "task-1",
                status: "failed",
                handRaiseId: "raise-1"
            })
        ).toThrow();
    });

    it("rejects blank question claim text", () => {
        const input = {
            protocolVersion: 1,
            meetingId: "meeting-1",
            turnId: "turn-1",
            stepId: "step-1",
            attemptId: "attempt-1",
            deliveryId: "delivery-1",
            agendaItemId: "agenda-1",
            kind: "question",
            content: "Question",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {
                questions: [{ text: "   ", blocking: false }],
                proposals: [],
                positions: [],
                issues: [],
                decisionProposals: [],
                agendaCandidates: []
            }
        };

        expect(() => TurnSubmissionSchema(input)).toThrow();
    });

    it("accepts a legacy non-blocking question claim without evidence arrays", () => {
        const normalized = TurnSubmissionSchema({
            protocolVersion: 1,
            meetingId: "meeting-1",
            turnId: "turn-1",
            stepId: "step-1",
            attemptId: "attempt-1",
            deliveryId: "delivery-1",
            agendaItemId: "agenda-1",
            kind: "question",
            content: "Question",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {
                questions: [{ text: "What remains?", blocking: false }],
                proposals: [],
                positions: [],
                issues: [],
                decisionProposals: [],
                agendaCandidates: []
            }
        });
        expect(normalized.changes.questions?.[0]).toMatchObject({
            affectedOutputIds: [],
            affectedCriterionIds: [],
            violatedConstraintIds: []
        });
    });

    it("accepts a legacy Issue claim without riskLevel", () => {
        const normalized = TurnSubmissionSchema({
            protocolVersion: 1,
            meetingId: "meeting-1",
            turnId: "turn-1",
            stepId: "step-1",
            attemptId: "attempt-1",
            deliveryId: "delivery-1",
            agendaItemId: "agenda-1",
            kind: "statement",
            content: "Legacy issue",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {
                questions: [],
                proposals: [],
                positions: [],
                issues: [
                    {
                        title: "Legacy issue",
                        description: "No risk level was persisted by V1.",
                        affectedOutputIds: [],
                        affectedCriterionIds: [],
                        violatedConstraintIds: [],
                        impact: "low",
                        urgency: "later",
                        safeDefaultAvailable: true
                    }
                ],
                decisionProposals: [],
                agendaCandidates: []
            }
        });
        expect(normalized.changes.issues?.[0]).not.toHaveProperty("riskLevel");
    });

    it("accepts a valid create-meeting payload", () => {
        expect(
            CreateMeetingInputSchema({
                protocolVersion: 1,
                requestId: "request-1",
                teamId: "team-1",
                topic: "Release",
                objective: "Decide release scope",
                objectiveContract: {
                    requiredOutputs: [{ key: "scope", description: "Scope" }],
                    acceptanceCriteria: [{ key: "reviewed", description: "Reviewed" }],
                    hardConstraints: [],
                    requiredReviewerKeys: ["reviewer"],
                    riskAcceptanceAuthorityKeys: ["captain"],
                    acceptableRiskLevel: "medium"
                },
                agenda: [
                    {
                        key: "scope",
                        title: "Scope",
                        objective: "Agree scope",
                        inScope: ["MVP"],
                        outOfScope: [],
                        completionCriteria: ["Review complete"],
                        requiredParticipantKeys: ["reviewer"]
                    }
                ],
                limits: { maxDurationMs: 60_000 },
                participants: [
                    { participantKey: "reviewer", displayName: "Reviewer" },
                    { participantKey: "captain", displayName: "Captain" }
                ]
            })
        ).toMatchObject({ protocolVersion: 1 });

        expect(() =>
            CreateMeetingInputSchema({
                protocolVersion: 1,
                requestId: "request-1",
                teamId: "team-1",
                topic: "Release",
                objective: "Decide release scope",
                objectiveContract: {
                    requiredOutputs: [],
                    acceptanceCriteria: [],
                    hardConstraints: [],
                    requiredReviewerKeys: [],
                    riskAcceptanceAuthorityKeys: [],
                    acceptableRiskLevel: "low"
                },
                agenda: [],
                participants: [],
                limits: { maxTurns: 3 }
            })
        ).toThrow(/agenda item/);
    });

    it("validates command results", () => {
        expect(
            CreateMeetingResultSchema({
                meetingId: "meeting-1",
                meetingVersion: 1,
                status: "created",
                participants: [{ participantKey: "reviewer", participantId: "participant-1" }]
            })
        ).toMatchObject({ meetingId: "meeting-1", status: "created" });

        expect(() =>
            CreateMeetingResultSchema({
                meetingId: "meeting-1",
                meetingVersion: 1,
                status: "unknown",
                participants: []
            })
        ).toThrow();
    });

    it("validates the Captain end command and terminal completion basis", () => {
        expect(
            EndMeetingInputSchema({
                protocolVersion: 1,
                meetingId: "meeting-1",
                expectedMeetingVersion: 3,
                outcome: "completed",
                reason: "Objective satisfied",
                acceptedDecisionIds: ["decision-1"],
                deferredAgendaItemIds: [],
                waivers: [],
                requestId: "request-end-1"
            })
        ).toMatchObject({ outcome: "completed" });
        expect(
            EndMeetingResultSchema({ status: "completed", terminationCode: "objective_satisfied" })
        ).toEqual({ status: "completed", terminationCode: "objective_satisfied" });

        const terminal = {
            meetingId: "meeting-1",
            meetingVersion: 4,
            topic: "Release",
            objective: "Decide scope",
            continuationMaterials: [],
            limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
            messages: [],
            questions: [],
            proposals: [],
            pendingDecisionCandidates: [],
            acceptedDecisions: [],
            decisionHistory: [],
            risks: [],
            blockingFacts: [],
            meetingTasks: [],
            status: "completed",
            pendingHandRaises: [],
            pauseControl: { action: "none" },
            termination: {
                code: "objective_satisfied",
                reason: "Objective satisfied",
                decisionIds: ["decision-1"],
                unresolvedQuestionIds: [],
                dissentingPositionIds: [],
                blockingAgendaItemIds: [],
                finalMessage: "Meeting completed.",
                endedAt: 1
            },
            completionFactIds: ["completion-1"]
        };

        expect(() => MeetingStatusResultSchema(terminal)).not.toThrow();
        expect(() =>
            MeetingStatusResultSchema({ ...terminal, completionFactIds: undefined })
        ).toThrow();
    });

    it("rejects terminal status with active meeting fields", () => {
        const archivePackage = validArchivePackage();
        expect(() =>
            MeetingStatusResultSchema({
                meetingId: "meeting-1",
                meetingVersion: 4,
                topic: "Release",
                objective: "Decide scope",
                continuationMaterials: [],
                limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
                status: "archived",
                currentTurn: { id: "turn-1" },
                currentSpeakerId: "participant-1",
                pendingHandRaises: [],
                meetingTasks: [],
                pauseControl: { action: "none" },
                termination: {
                    code: "completed",
                    reason: "done",
                    decisionIds: [],
                    unresolvedQuestionIds: []
                },
                archive: { package: archivePackage, archivedAt: 1 }
            })
        ).toThrow();
    });

    it("requires lifecycle projection objects", () => {
        const base = {
            meetingId: "meeting-1",
            meetingVersion: 1,
            topic: "Release",
            objective: "Decide scope",
            continuationMaterials: [],
            limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
            pendingHandRaises: [],
            meetingTasks: [],
            pauseControl: { action: "none" },
            termination: {
                code: "completed",
                reason: "done",
                decisionIds: [],
                unresolvedQuestionIds: []
            },
            archive: { package: validArchivePackage(), archivedAt: 1 }
        };

        expect(() => MeetingStatusResultSchema({ ...base, status: "archived" })).not.toThrow();
        expect(() => MeetingStatusResultSchema({ ...base, status: "running" })).toThrow();
        expect(() =>
            MeetingStatusResultSchema({ ...base, status: "completed", archive: undefined })
        ).toThrow();
        expect(() =>
            MeetingStatusResultSchema({ ...base, status: "archiving", termination: undefined })
        ).toThrow();
        expect(() =>
            MeetingStatusResultSchema({ ...base, status: "archived", limits: undefined })
        ).toThrow();
    });

    it("requires archive completion basis objects", () => {
        const archivePackage = validArchivePackage();
        expect(() => MeetingArchivePackageSchema(archivePackage)).not.toThrow();
        expect(() => MeetingArchivePackageSchema({})).toThrow();
        expect(() =>
            MeetingArchivePackageSchema({
                ...archivePackage,
                objectiveContract: undefined,
                termination: undefined
            })
        ).toThrow();
    });

    it("requires the archive package to belong to the projected meeting", () => {
        expect(() =>
            MeetingStatusResultSchema({
                ...validArchivedProjection(),
                archive: { package: validArchivePackage("meeting-2"), archivedAt: 1 }
            })
        ).toThrow(/meetingId/);
    });

    it("requires complete pause metadata for a paused projection", () => {
        expect(() =>
            MeetingStatusResultSchema({
                meetingId: "meeting-1",
                meetingVersion: 1,
                topic: "Release",
                objective: "Decide scope",
                continuationMaterials: [],
                limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
                activeAgendaItem: undefined,
                messages: [],
                questions: [],
                proposals: [],
                pendingDecisionCandidates: [],
                acceptedDecisions: [],
                decisionHistory: [],
                risks: [],
                blockingFacts: [],
                meetingTasks: [],
                status: "paused",
                stallCount: 0,
                maxStalls: 3,
                replanCount: 0,
                maxReplans: 1,
                pendingHandRaises: [],
                pauseControl: { action: "resume" }
            })
        ).toThrow(/pause metadata/);
    });

    it("maps paused projections to the resume action", () => {
        expect(() =>
            MeetingStatusResultSchema({
                meetingId: "meeting-1",
                meetingVersion: 1,
                topic: "Release",
                objective: "Decide scope",
                continuationMaterials: [],
                limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
                activeAgendaItem: undefined,
                messages: [],
                questions: [],
                proposals: [],
                pendingDecisionCandidates: [],
                acceptedDecisions: [],
                decisionHistory: [],
                risks: [],
                blockingFacts: [],
                meetingTasks: [],
                status: "paused",
                stallCount: 0,
                maxStalls: 3,
                replanCount: 0,
                maxReplans: 1,
                pendingHandRaises: [],
                pauseControl: {
                    action: "pause",
                    pausedAt: 1,
                    pausedBy: { kind: "user", actorId: "user-1" },
                    reason: "manual pause"
                }
            })
        ).toThrow(/pause control action/);
    });
});

function validArchivePackage(meetingId = "meeting-1") {
    return {
        schemaVersion: 1,
        meetingId,
        teamId: "team-1",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [],
            hardConstraints: [],
            requiredReviewers: [],
            riskAcceptanceAuthority: [],
            acceptableRiskLevel: "low"
        },
        finalSummary: "done",
        artifactRefs: [],
        acceptedDecisions: [],
        decisionHistory: [],
        proposals: [],
        completionFacts: [],
        agenda: [],
        issues: [],
        unresolvedQuestions: [],
        parkingLot: [],
        formalTranscript: [],
        participantProvenance: [],
        termination: {
            code: "completed",
            reason: "done",
            decisionIds: [],
            unresolvedQuestionIds: []
        },
        endedAt: 1,
        materializedAt: 1
    };
}

function validArchivedProjection() {
    return {
        meetingId: "meeting-1",
        meetingVersion: 1,
        topic: "Release",
        objective: "Decide scope",
        continuationMaterials: [],
        limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
        status: "archived",
        pendingHandRaises: [],
        pauseControl: { action: "none" },
        termination: {
            code: "completed",
            reason: "done",
            decisionIds: [],
            unresolvedQuestionIds: []
        },
        archive: { package: validArchivePackage(), archivedAt: 1 }
    };
}
