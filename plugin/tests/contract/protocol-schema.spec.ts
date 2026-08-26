import { describe, expect, it } from "vitest";
import {
    CreateMeetingResultSchema,
    CreateMeetingInputSchema,
    MeetingArchivePackageSchema,
    MeetingStatusResultSchema,
    validateProtocolError,
    isKnownMeetingProtocolErrorCode,
    validateProtocolSuccessEnvelope,
    validateBackgroundTaskRequest,
    validateReassignTurnInput
} from "../../src/protocol/index.js";

describe("protocol envelope schemas", () => {
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
        expect(isKnownMeetingProtocolErrorCode("UNKNOWN_ERROR")).toBe(false);
    });

    it("validates command discriminants beyond field types", () => {
        expect(() =>
            validateBackgroundTaskRequest({
                protocolVersion: 1,
                meetingId: "meeting-1",
                attemptId: "attempt-1",
                requestId: "request-1",
                action: "create",
                existingTaskId: "task-1",
                blocking: false
            })
        ).toThrow();

        expect(() =>
            validateBackgroundTaskRequest({
                protocolVersion: 1,
                meetingId: "meeting-1",
                attemptId: "attempt-1",
                requestId: "request-1",
                action: "create",
                title: "task",
                description: "work",
                existingTaskId: "",
                blocking: false
            })
        ).toThrow();

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
        ).not.toThrow();
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

    it("rejects terminal status with active meeting fields", () => {
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
                pauseControl: { action: "none" },
                termination: {
                    code: "completed",
                    reason: "done",
                    decisionIds: [],
                    unresolvedQuestionIds: []
                },
                archive: { package: {}, archivedAt: 1 }
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
            pauseControl: { action: "none" },
            termination: {
                code: "completed",
                reason: "done",
                decisionIds: [],
                unresolvedQuestionIds: []
            },
            archive: { package: {}, archivedAt: 1 }
        };

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
        expect(() => MeetingArchivePackageSchema({})).toThrow();
        expect(() =>
            MeetingArchivePackageSchema({ objectiveContract: undefined, termination: undefined })
        ).toThrow();
    });
});
