import { describe, expect, it } from "vitest";
import {
    CreateMeetingResultSchema,
    CreateMeetingInputSchema,
    EndMeetingInputSchema,
    EndMeetingResultSchema,
    MeetingArchivePackageSchema,
    ManagerPlanResultSchema,
    ManagerPlanSubmissionSchema,
    MeetingStatusResultSchema,
    validateProtocolError,
    isKnownMeetingProtocolErrorCode,
    validateProtocolSuccessEnvelope,
    MeetingTaskRequestSchema,
    MeetingTaskFinishResultSchema,
    validateReassignTurnInput
} from "../../src/protocol/index.js";

describe("protocol envelope schemas", () => {
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
                turnId: "turn-1",
                firstStepId: "step-1",
                firstAttemptId: "attempt-1"
            })
        ).toEqual({ turnId: "turn-1", firstStepId: "step-1", firstAttemptId: "attempt-1" });

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
                turnId: "",
                firstStepId: "step-1",
                firstAttemptId: "attempt-1"
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
            acceptedDecisions: [],
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
                acceptedDecisions: [],
                blockingFacts: [],
                meetingTasks: [],
                status: "paused",
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
                acceptedDecisions: [],
                blockingFacts: [],
                meetingTasks: [],
                status: "paused",
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
