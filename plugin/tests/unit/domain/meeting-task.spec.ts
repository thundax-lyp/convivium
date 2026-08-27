import { describe, expect, it } from "vitest";
import {
    cancelNonTerminalMeetingTasks,
    createMeetingTask,
    finishMeetingTask,
    queueMeetingTasks,
    startMeetingTask
} from "../../../src/domain/index.js";
import type { MeetingState } from "../../../src/domain/model.js";

function state(): MeetingState {
    return { id: "meeting-1", meetingTasks: [] } as unknown as MeetingState;
}

function input() {
    return {
        meetingTaskId: "task-1",
        executionId: "execution-1",
        deliveryId: "delivery-1",
        participantId: "participant-1",
        originatingSpeakerAttemptId: "attempt-1",
        title: "Run tests",
        description: "Run the test suite",
        blocking: true,
        now: 1
    };
}

describe("MeetingTask transitions", () => {
    it("moves a task through requested, queued, running and completed", () => {
        const created = createMeetingTask(state(), input());
        const queued = queueMeetingTasks(created.state, ["task-1"], 2);
        const started = startMeetingTask(queued.state, "task-1", 3);
        const finished = finishMeetingTask(started.state, "task-1", {
            status: "completed",
            resultSummary: "passed",
            now: 4
        });

        expect(finished.state.meetingTasks[0]).toMatchObject({
            meetingTaskId: "task-1",
            status: "completed",
            resultSummary: "passed"
        });
        expect(finished.effect.events.map(({ type }) => type)).toEqual(["meeting_task.completed"]);
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
