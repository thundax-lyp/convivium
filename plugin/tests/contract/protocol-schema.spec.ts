import { describe, expect, it } from "vitest";
import {
    CreateMeetingInputSchema,
    validateProtocolError,
    validateProtocolSuccessEnvelope,
    validateBackgroundTaskRequest,
    validateReassignTurnInput
} from "../../src/protocol/index.js";

describe("protocol envelope schemas", () => {
    it("accepts a versioned success envelope", () => {
        expect(
            validateProtocolSuccessEnvelope({
                protocolVersion: 1,
                ok: true,
                meetingId: "meeting-1",
                meetingVersion: 3,
                result: { status: "running" }
            })
        ).toEqual({
            protocolVersion: 1,
            ok: true,
            meetingId: "meeting-1",
            meetingVersion: 3,
            result: { status: "running" }
        });
    });

    it("rejects an unsupported protocol version", () => {
        expect(() =>
            validateProtocolSuccessEnvelope({
                protocolVersion: 2,
                ok: true,
                meetingId: "meeting-1",
                meetingVersion: 3,
                result: {}
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
                participants: [
                    { participantKey: "reviewer", displayName: "Reviewer" },
                    { participantKey: "captain", displayName: "Captain" }
                ]
            })
        ).toMatchObject({ protocolVersion: 1 });
    });
});
