import { describe, expect, it } from "vitest";
import { createHandRaise } from "../../../src/domain/hand-raise.js";
import type { MeetingState } from "../../../src/domain/model.js";

function state(overrides: Partial<MeetingState> = {}): MeetingState {
    return {
        id: "meeting-1",
        handRaises: [],
        transcript: [],
        meetingTasks: [
            {
                meetingTaskId: "task-1",
                participantId: "participant-1",
                status: "completed"
            }
        ],
        ...overrides
    } as unknown as MeetingState;
}

function input(overrides: Record<string, unknown> = {}) {
    return {
        id: "raise-1",
        participantId: "participant-1",
        reason: "task_completed" as const,
        summary: "Task is complete",
        taskIds: ["task-1"],
        priority: "normal" as const,
        now: 1,
        ...overrides
    };
}

describe("HandRaise transitions", () => {
    it("rejects missing or foreign task references", () => {
        expect(() => createHandRaise(state(), input({ taskIds: ["missing"] }))).toThrowError(
            expect.objectContaining({ code: "INVALID_ENTITY_STATE" })
        );
        expect(() =>
            createHandRaise(
                state({
                    meetingTasks: [
                        {
                            meetingTaskId: "task-1",
                            participantId: "participant-2",
                            status: "completed"
                        }
                    ] as never
                }),
                input()
            )
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("validates and preserves the transcript reply target", () => {
        expect(() =>
            createHandRaise(state(), input({ replyToMessageId: "message-1" }))
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));

        const created = createHandRaise(
            state({ transcript: [{ id: "message-1" }] as never }),
            input({ replyToMessageId: "message-1" })
        );
        expect(created.state.handRaises[0]?.replyToMessageId).toBe("message-1");
    });

    it("does not collapse pending raises with different substantive context", () => {
        const first = createHandRaise(state(), input());
        const second = createHandRaise(
            { ...first.state, handRaises: first.state.handRaises },
            input({ id: "raise-2", summary: "Task completed with new evidence" })
        );
        expect(second.state.handRaises).toHaveLength(2);
        expect(second.effect.events).toHaveLength(1);
    });
});
