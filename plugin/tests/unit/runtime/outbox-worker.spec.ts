import { describe, expect, it } from "vitest";
import type { OutboxItem } from "../../../src/repository/index.js";
import { createOutboxWorker } from "../../../src/runtime/outbox-worker.js";

function item(attempts = 1): OutboxItem {
    return {
        id: "outbox-1",
        deliveryId: "delivery-stable",
        kind: "dispatch",
        payload: { attemptId: "attempt-1" },
        attempts,
        leaseOwner: "worker-1",
        leaseToken: "lease-1",
        leaseDeadline: 100
    };
}

describe("outbox worker", () => {
    it("dispatches a claimed delivery after commit and completes the same lease", async () => {
        const completed: unknown[] = [];
        const dispatched: OutboxItem[] = [];
        const worker = createOutboxWorker({
            repository: {
                claimOutbox: async () => [item()],
                completeOutbox: async (input) => {
                    completed.push(input);
                    return { id: input.id, status: "delivered" as const };
                }
            },
            owner: "worker-1",
            ttlMs: 100,
            batchSize: 10,
            pollMs: 10,
            dispatch: async (claimed) => dispatched.push(claimed),
            now: () => 10
        });

        expect(await worker.runOnce()).toEqual({ claimed: 1, delivered: 1, retried: 0, failed: 0 });
        expect(dispatched[0]?.deliveryId).toBe("delivery-stable");
        expect(completed).toHaveLength(1);
        expect((completed[0] as { leaseToken: string }).leaseToken).toBe("lease-1");
    });

    it("retries a failed dispatch and marks an exhausted lease failed", async () => {
        const completions: { status: string; availableAt?: number }[] = [];
        const worker = createOutboxWorker({
            repository: {
                claimOutbox: async () => [item(1)],
                completeOutbox: async (input) => {
                    completions.push(input.completion);
                    return { id: input.id, status: input.completion.status };
                }
            },
            owner: "worker-1",
            ttlMs: 100,
            batchSize: 1,
            pollMs: 10,
            retryDelayMs: 50,
            maxAttempts: 2,
            dispatch: async () => {
                throw Object.assign(new Error("unavailable"), {
                    code: "DSH_UNAVAILABLE",
                    retryable: true
                });
            },
            now: () => 10
        });
        await worker.runOnce();
        expect(completions).toEqual([
            { status: "retry", availableAt: 60, errorCode: "DSH_UNAVAILABLE" }
        ]);

        completions.length = 0;
        const exhausted = createOutboxWorker({
            repository: {
                claimOutbox: async () => [item(2)],
                completeOutbox: async (input) => {
                    completions.push(input.completion);
                    return { id: input.id, status: input.completion.status };
                }
            },
            owner: "worker-1",
            ttlMs: 100,
            batchSize: 1,
            pollMs: 10,
            maxAttempts: 2,
            dispatch: async () => {
                throw new Error("bad");
            },
            now: () => 10
        });
        await exhausted.runOnce();
        expect(completions[0]).toMatchObject({
            status: "failed",
            errorCode: "DSH_DISPATCH_FAILED"
        });
    });

    it("does not retry a deterministic dispatch failure", async () => {
        const completions: { status: string }[] = [];
        const worker = createOutboxWorker({
            repository: {
                claimOutbox: async () => [item()],
                completeOutbox: async (input) => {
                    completions.push(input.completion);
                    return { id: input.id, status: input.completion.status };
                }
            },
            owner: "worker-1",
            ttlMs: 100,
            batchSize: 1,
            pollMs: 10,
            dispatch: async () => {
                throw Object.assign(new Error("stale"), { code: "STALE", retryable: false });
            }
        });
        await worker.runOnce();
        expect(completions[0]).toMatchObject({ status: "failed", errorCode: "STALE" });
    });
});
