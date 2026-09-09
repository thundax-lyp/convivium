import { describe, expect, it } from "vitest";
import {
    cancelNonTerminalMeetingTasks,
    createMeetingTask,
    finishMeetingTask,
    queueMeetingTasks,
    startMeetingTask
} from "@/domain/index.js";
import type { MeetingState } from "@/domain/model.js";

function state(): MeetingState {
    return {
        formatVersion: 2,
        id: "meeting-1",
        attendanceRecommendations: [],
        meetingTasks: [],
        transcript: [
            {
                id: "message-1",
                seq: 1,
                attemptId: "attempt-1",
                taskIds: ["task-1"]
            }
        ]
    } as unknown as MeetingState;
}

function input() {
    return {
        meetingTaskId: "task-1",
        executionId: "execution-1",
        deliveryId: "delivery-1",
        participantId: "participant-1",
        originatingSpeakerAttemptId: "attempt-1",
        sourceTurnId: "turn-1",
        sourceStepId: "step-1",
        sourceContextFromSeq: 1,
        sourceContextThroughSeq: 1,
        title: "Run tests",
        description: "Run the test suite",
        blocking: true,
        now: 1
    };
}

describe("MeetingTask transitions", () => {
    it("rejects task writes after execution terminal state without mutation", () => {
        const meeting = { ...state(), status: "archived" as const };
        const before = structuredClone(meeting);

        expect(() => createMeetingTask(meeting, input())).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
        expect(() => startMeetingTask(meeting, "task-1", 3)).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
        expect(() =>
            finishMeetingTask(meeting, "task-1", { status: "completed", now: 4 })
        ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        expect(meeting).toEqual(before);
    });

    it("moves a task through requested, queued, running and completed", () => {
        const created = createMeetingTask(state(), input());
        const queued = queueMeetingTasks(
            created.state,
            ["task-1"],
            "participant-1",
            "attempt-1",
            2
        );
        const started = startMeetingTask(queued.state, "task-1", 3);
        const finished = finishMeetingTask(started.state, "task-1", {
            status: "completed",
            resultSummary: "passed",
            now: 4
        });

        expect(finished.state.meetingTasks[0]).toMatchObject({
            meetingTaskId: "task-1",
            status: "completed",
            resultSummary: "passed",
            sourceTurnId: "turn-1",
            sourceStepId: "step-1",
            sourceContextFromSeq: 1,
            sourceContextThroughSeq: 1
        });
        expect(finished.state.meetingTasks[0]?.sourceMessageId).toBe("message-1");
        expect(finished.state.meetingTasks[0]?.sourceMessageSeq).toBe(1);
        expect(finished.effect.events.map(({ type }) => type)).toEqual(["meeting_task.completed"]);
    });

    it.each([
        ["Participant", "participant-2", "attempt-1"],
        ["attempt", "participant-1", "attempt-2"]
    ])("rejects queueing with a different originating %s", (_kind, participantId, attemptId) => {
        const created = createMeetingTask(state(), input());
        // A later message citing the task must not transfer its originating attempt binding.
        created.state.transcript.push({
            ...created.state.transcript[0]!,
            id: "message-2",
            seq: 2,
            attemptId: "attempt-2"
        });
        const before = structuredClone(created.state);

        expect(() =>
            queueMeetingTasks(created.state, ["task-1"], participantId, attemptId, 2)
        ).toThrowError(expect.objectContaining({ code: "STALE_ATTEMPT" }));
        expect(created.state).toEqual(before);
    });

    it("rejects duplicate and invalid lifecycle operations without effects", () => {
        const created = createMeetingTask(state(), input());
        const queued = queueMeetingTasks(
            created.state,
            ["task-1"],
            "participant-1",
            "attempt-1",
            2
        );
        expect(() =>
            queueMeetingTasks(queued.state, ["task-1"], "participant-1", "attempt-1", 3)
        ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));

        const started = startMeetingTask(queued.state, "task-1", 4);
        expect(() => startMeetingTask(started.state, "task-1", 5)).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
        const finished = finishMeetingTask(started.state, "task-1", {
            status: "failed",
            failureReason: "provider failed",
            now: 6
        });
        expect(() =>
            finishMeetingTask(finished.state, "task-1", { status: "completed", now: 7 })
        ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        expect(finished.effect.events.map(({ type }) => type)).toEqual(["meeting_task.failed"]);
    });

    it("guards every task lifecycle entry in execution terminal states", () => {
        for (const status of ["completed", "archiving", "archived"] as const) {
            const meeting = { ...state(), status };
            const before = structuredClone(meeting);
            expect(() => createMeetingTask(meeting, input())).toThrowError(
                expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
            );
            expect(() =>
                queueMeetingTasks(meeting, ["task-1"], "participant-1", "attempt-1", 2)
            ).toThrowError(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
            expect(() => startMeetingTask(meeting, "task-1", 2)).toThrowError(
                expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
            );
            expect(meeting).toEqual(before);
        }
    });

    it("cancels every non-terminal task and leaves terminal facts unchanged", () => {
        const created = createMeetingTask(state(), input());
        const cancelled = cancelNonTerminalMeetingTasks(created.state, 5);
        expect(cancelled.state.meetingTasks[0]).toMatchObject({
            status: "cancelled",
            finishedAt: 5
        });
        expect(cancelled.effect.events[0]?.type).toBe("meeting_task.cancelled");
    });
});
