import { createOutboxWorker } from "../../../src/runtime/outbox-worker.js";
import { describe, expect, it } from "vitest";

describe("outbox dispatch integration", () => {
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
