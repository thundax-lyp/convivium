import { createOutboxWorker } from "../outbox-worker.js";
import type { MeetingDeliveryWorkerService } from "./types.js";

export interface MeetingDeliveryWorkerServiceOptions {
    readonly pollMs: number;
    readonly now?: () => number;
}

/** Owns worker lifecycle; it deliberately knows nothing about meeting commands. */
export function createMeetingDeliveryWorkerService(
    options: MeetingDeliveryWorkerServiceOptions
): MeetingDeliveryWorkerService {
    const workers = new Map<string, ReturnType<typeof createOutboxWorker>>();

    return {
        ensure(input) {
            if (input.parent === undefined || workers.has(input.meetingId)) return;
            const worker = createOutboxWorker({
                repository: input.repository,
                owner: `worker:${input.meetingId}`,
                ttlMs: 60_000,
                batchSize: 1,
                pollMs: options.pollMs,
                dispatch: input.dispatch,
                now: options.now
            });
            workers.set(input.meetingId, worker);
            void worker.start().catch(() => undefined);
        },
        wake(meetingId) {
            workers.get(meetingId)?.wake();
        },
        async dispose() {
            for (const worker of workers.values()) worker.stop();
            await Promise.all([...workers.values()].map((worker) => worker.wait()));
            workers.clear();
        }
    };
}
