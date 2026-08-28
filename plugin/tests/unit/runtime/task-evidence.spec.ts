import { describe, expect, it } from "vitest";
import { meetingTaskEvidenceResolver } from "../../../src/runtime/task-evidence.js";
import type { MeetingState } from "../../../src/domain/model.js";

function state(overrides: Record<string, unknown> = {}): MeetingState {
    return {
        id: "meeting-1",
        version: 4,
        transcript: [
            {
                id: "message-1",
                seq: 3,
                turnId: "turn-1",
                stepId: "step-1",
                attemptId: "attempt-1",
                taskIds: ["task-1"]
            }
        ],
        meetingTasks: [
            {
                meetingTaskId: "task-1",
                participantId: "participant-1",
                originatingSpeakerAttemptId: "attempt-1",
                executionId: "execution-1",
                status: "completed",
                sourceMessageId: "message-1",
                sourceMessageSeq: 3,
                sourceTurnId: "turn-1",
                sourceStepId: "step-1",
                sourceContextFromSeq: 1,
                sourceContextThroughSeq: 3,
                resultSummary: "passed",
                finishedAt: 5
            }
        ],
        ...overrides
    } as unknown as MeetingState;
}

describe("meetingTaskEvidenceResolver", () => {
    it("returns the complete authorized evidence shape", () => {
        expect(
            meetingTaskEvidenceResolver.resolve({
                state: state(),
                meetingId: "meeting-1",
                participantId: "participant-1",
                taskIds: ["task-1"]
            })
        ).toEqual([
            {
                meetingId: "meeting-1",
                participantId: "participant-1",
                meetingTaskId: "task-1",
                originatingSpeakerAttemptId: "attempt-1",
                executionId: "execution-1",
                sourceMessageId: "message-1",
                sourceMessageSeq: 3,
                sourceTurnId: "turn-1",
                sourceStepId: "step-1",
                sourceContextFromSeq: 1,
                sourceContextThroughSeq: 3,
                resultSummary: "passed",
                taskStatus: "completed",
                finishedAt: 5
            }
        ]);
    });

    it("rejects task-id-only and finished-time-only evidence", () => {
        expect(() =>
            meetingTaskEvidenceResolver.resolve({
                state: state({
                    meetingTasks: [{ ...state().meetingTasks[0], sourceMessageId: undefined }]
                }),
                meetingId: "meeting-1",
                participantId: "participant-1",
                taskIds: ["task-1"]
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
    });

    it("rejects evidence without a finite terminal time", () => {
        expect(() =>
            meetingTaskEvidenceResolver.resolve({
                state: state({
                    meetingTasks: [{ ...state().meetingTasks[0], finishedAt: undefined }]
                }),
                meetingId: "meeting-1",
                participantId: "participant-1",
                taskIds: ["task-1"]
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
    });

    it("rejects foreign meeting and source identities", () => {
        expect(() =>
            meetingTaskEvidenceResolver.resolve({
                state: state(),
                meetingId: "meeting-2",
                participantId: "participant-1",
                taskIds: ["task-1"]
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        expect(() =>
            meetingTaskEvidenceResolver.resolve({
                state: state({
                    transcript: [{ ...state().transcript[0], speaker: "participant-2" }]
                }),
                meetingId: "meeting-1",
                participantId: "participant-1",
                taskIds: ["task-1"]
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
    });
});
