import { describe, expect, it } from "vitest";
import type { MeetingMessage, MeetingTurn } from "../../../src/domain/model.js";
import { createTurnRunner } from "../../../src/runtime/turn-runner.js";

const turn: MeetingTurn = {
    id: "turn-1",
    seq: 1,
    agendaItemId: "agenda-1",
    intent: "explore",
    objective: "resolve",
    expectedOutputs: [],
    prohibitedTopics: [],
    plan: ["a", "b", "c"],
    status: "planned",
    currentStepIndex: 0,
    createdAt: 1,
    steps: ["a", "b", "c"].map((speaker, index) => ({
        id: `step-${speaker}`,
        speaker,
        instruction: `speak-${speaker}`,
        reason: "round_robin_fallback" as const,
        status: "pending" as const
    }))
};

function message(attempt: string, step: string, speaker: string, seq: number): MeetingMessage {
    return {
        id: `message-${speaker}`,
        seq,
        turnSeq: 1,
        turnId: "turn-1",
        stepId: step,
        attemptId: attempt,
        speaker,
        agendaItemId: "agenda-1",
        agendaRelation: "active",
        content: speaker,
        kind: "comment",
        mentions: [],
        taskIds: [],
        createdAt: seq
    };
}

describe("turn runner", () => {
    it("dispatches A, B, C serially with only committed prior context", async () => {
        const committed: MeetingMessage[] = [];
        const dispatches: string[][] = [];
        let inFlight = 0;
        let peak = 0;
        const runner = createTurnRunner();
        const result = await runner.run({
            meetingId: "meeting-1",
            turn,
            readCommittedTranscript: async () => committed,
            allocateAttemptId: (_, index) => `attempt-${index}`,
            allocateDeliveryId: (_, index) => `delivery-${index}`,
            dispatch: async (attempt) => {
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                dispatches.push(attempt.priorMessages.map(({ id }) => id));
                await Promise.resolve();
                inFlight -= 1;
            },
            waitForSubmission: async (attempt) =>
                message(
                    attempt.attemptId,
                    attempt.stepId,
                    attempt.participantId,
                    committed.length + 1
                ),
            commitSubmission: async (_, submitted) => {
                committed.push(submitted);
            }
        });

        expect(dispatches).toEqual([[], ["message-a"], ["message-a", "message-b"]]);
        expect(peak).toBe(1);
        expect(result.submittedAttemptIds).toEqual(["attempt-0", "attempt-1", "attempt-2"]);
    });

    it("ignores an invalid submit until the current attempt is submitted", async () => {
        const runner = createTurnRunner();
        const committed: MeetingMessage[] = [];
        let submissions = 0;
        await runner.run({
            meetingId: "meeting-1",
            turn: { ...turn, steps: turn.steps.slice(0, 1), plan: ["a"] },
            readCommittedTranscript: async () => committed,
            allocateAttemptId: () => "attempt-a",
            allocateDeliveryId: () => "delivery-a",
            dispatch: async () => undefined,
            waitForSubmission: async (attempt) => {
                submissions += 1;
                return submissions === 1
                    ? message("wrong", attempt.stepId, attempt.participantId, 1)
                    : message(attempt.attemptId, attempt.stepId, attempt.participantId, 1);
            },
            commitSubmission: async (_, submitted) => committed.push(submitted)
        });
        expect(submissions).toBe(2);
        expect(committed).toHaveLength(1);
    });

    it("rejects a reentrant run for the same meeting turn", async () => {
        const runner = createTurnRunner();
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => (release = resolve));
        const input = {
            meetingId: "meeting-1",
            turn: { ...turn, steps: turn.steps.slice(0, 1), plan: ["a"] },
            readCommittedTranscript: async () => [],
            allocateAttemptId: () => "attempt-a",
            allocateDeliveryId: () => "delivery-a",
            dispatch: async () => blocked,
            waitForSubmission: async (attempt: {
                attemptId: string;
                stepId: string;
                participantId: string;
            }) => message(attempt.attemptId, attempt.stepId, attempt.participantId, 1),
            commitSubmission: async () => undefined
        };
        const first = runner.run(input);
        await expect(runner.run(input)).rejects.toThrow("already running");
        release();
        await first;
    });
});
