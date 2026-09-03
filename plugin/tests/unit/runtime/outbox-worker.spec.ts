import { describe, expect, it } from "vitest";
import type { OutboxItem } from "../../../src/repository/types.js";
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
    it("stops and waits without exposing the expected abort", async () => {
        let sleeping!: () => void;
        const enteredSleep = new Promise<void>((resolve) => {
            sleeping = resolve;
        });
        const worker = createOutboxWorker({
            repository: {
                claimOutbox: async () => [],
                completeOutbox: async (input) => ({
                    id: input.id,
                    status: input.completion.status
                })
            },
            owner: "worker-1",
            ttlMs: 100,
            batchSize: 1,
            pollMs: 10,
            dispatch: async () => undefined,
            sleep: async (_delay, signal) => {
                sleeping();
                await new Promise<void>((_resolve, reject) => {
                    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                });
            }
        });
        const started = worker.start();
        await enteredSleep;
        worker.stop();
        await expect(started).resolves.toBeUndefined();
        await expect(worker.wait()).resolves.toBeUndefined();
    });

    it("continues polling after a retryable repository failure", async () => {
        let claims = 0;
        const worker = createOutboxWorker({
            repository: {
                claimOutbox: async () => {
                    claims += 1;
                    if (claims === 1) throw Object.assign(new Error("busy"), { retryable: true });
                    worker.stop();
                    return [];
                },
                completeOutbox: async (input) => ({
                    id: input.id,
                    status: input.completion.status
                })
            },
            owner: "worker-1",
            ttlMs: 100,
            batchSize: 1,
            pollMs: 10,
            dispatch: async () => undefined,
            sleep: async () => undefined
        });

        await worker.start();
        expect(claims).toBe(2);
    });

    it("aborts an in-flight dispatch when stopped", async () => {
        let dispatchSignal: AbortSignal | undefined;
        const worker = createOutboxWorker({
            repository: {
                claimOutbox: async () => [item()],
                completeOutbox: async (input) => ({
                    id: input.id,
                    status: input.completion.status
                })
            },
            owner: "worker-1",
            ttlMs: 100,
            batchSize: 1,
            pollMs: 10,
            dispatch: async (_item, signal) => {
                dispatchSignal = signal;
                await new Promise<void>((_resolve, reject) => {
                    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                    worker.stop();
                });
            }
        });

        await expect(worker.start()).resolves.toBeUndefined();
        expect(dispatchSignal?.aborted).toBe(true);
    });

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

    it("notifies the owner after terminal delivery failure is durably recorded", async () => {
        const failures: unknown[] = [];
        const worker = createOutboxWorker({
            repository: {
                claimOutbox: async () => [item(2)],
                completeOutbox: async (input) => {
                    failures.push({ kind: "completion", completion: input.completion });
                    return { id: input.id, status: input.completion.status };
                }
            },
            owner: "worker-1",
            ttlMs: 100,
            batchSize: 1,
            pollMs: 10,
            maxAttempts: 2,
            dispatch: async () => {
                throw Object.assign(new Error("bad"), { code: "MANAGER_UNAVAILABLE" });
            },
            onTerminalFailure: async (failed, errorCode, failedAt) => {
                failures.push({ kind: "callback", id: failed.id, errorCode, failedAt });
            },
            now: () => 10
        });

        await worker.runOnce();
        expect(failures).toEqual([
            {
                kind: "completion",
                completion: { status: "failed", failedAt: 10, errorCode: "MANAGER_UNAVAILABLE" }
            },
            { kind: "callback", id: "outbox-1", errorCode: "MANAGER_UNAVAILABLE", failedAt: 10 }
        ]);
    });
});
