import type { MeetingMessage, MeetingTurn } from "../../../src/domain/model.js";
import { createOutboxWorker } from "../../../src/runtime/outbox-worker.js";
import { createTurnRunner } from "../../../src/runtime/turn-runner.js";
import { describe, expect, it } from "vitest";

const turn: MeetingTurn = {
    id: "turn-integration",
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
    steps: ["a", "b", "c"].map((speaker) => ({
        id: `step-${speaker}`,
        speaker,
        instruction: `address-${speaker}`,
        reason: "round_robin_fallback" as const,
        status: "pending" as const
    }))
};

function submittedMessage(
    attemptId: string,
    stepId: string,
    speaker: string,
    seq: number
): MeetingMessage {
    return {
        id: `message-${speaker}`,
        seq,
        turnSeq: 1,
        turnId: turn.id,
        stepId,
        attemptId,
        speaker,
        agendaItemId: turn.agendaItemId,
        agendaRelation: "active",
        content: speaker,
        kind: "statement",
        mentions: [],
        taskIds: [],
        createdAt: seq
    };
}

describe("runtime vertical slice composition", () => {
    it("keeps the committed prefix between sequential deliveries", async () => {
        const committed: MeetingMessage[] = [];
        const contexts: string[][] = [];
        const runner = createTurnRunner();
        await runner.run({
            meetingId: "meeting-1",
            turn,
            readCommittedTranscript: async () => committed,
            allocateAttemptId: (_, index) => `attempt-${index}`,
            allocateDeliveryId: (_, index) => `delivery-${index}`,
            dispatch: async (attempt) => {
                contexts.push(attempt.priorMessages.map(({ id }) => id));
            },
            waitForSubmission: async (attempt) =>
                submittedMessage(
                    attempt.attemptId,
                    attempt.stepId,
                    attempt.participantId,
                    committed.length + 1
                ),
            commitSubmission: async (_, message) => committed.push(message)
        });
        expect(contexts).toEqual([[], ["message-a"], ["message-a", "message-b"]]);
    });

    it("keeps outbox retry state separate from the DSH dispatch callback", async () => {
        let dispatchCount = 0;
        let completionStatus = "";
        const worker = createOutboxWorker({
            repository: {
                claimOutbox: async () => [
                    {
                        id: "outbox-1",
                        deliveryId: "delivery-1",
                        kind: "dispatch",
                        payload: { attemptId: "attempt-1" },
                        attempts: 1,
                        leaseOwner: "worker-1",
                        leaseToken: "lease-1",
                        leaseDeadline: 100
                    }
                ],
                completeOutbox: async (input) => {
                    completionStatus = input.completion.status;
                    return { id: input.id, status: input.completion.status };
                }
            },
            owner: "worker-1",
            ttlMs: 100,
            batchSize: 1,
            pollMs: 10,
            dispatch: async () => {
                dispatchCount += 1;
                throw new Error("provider unavailable");
            },
            now: () => 10
        });
        expect(await worker.runOnce()).toMatchObject({ claimed: 1, retried: 1 });
        expect(dispatchCount).toBe(1);
        expect(completionStatus).toBe("retry");
    });
});
