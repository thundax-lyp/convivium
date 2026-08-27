import type { OutboxItem, WorkerLease } from "../repository/index.js";

export interface OutboxWorkerRepository {
    claimOutbox(input: WorkerLease & { batchSize: number; now?: number }): Promise<OutboxItem[]>;
    completeOutbox(input: {
        id: string;
        leaseOwner: string;
        leaseToken: string;
        completion:
            | { status: "delivered"; deliveredAt?: number }
            | { status: "retry"; availableAt: number; errorCode: string }
            | { status: "failed"; failedAt?: number; errorCode: string };
        now?: number;
    }): Promise<{ id: string; status: "delivered" | "retry" | "failed" }>;
}

export interface OutboxWorkerOptions {
    readonly repository: OutboxWorkerRepository;
    readonly owner: string;
    readonly ttlMs: number;
    readonly batchSize: number;
    readonly pollMs: number;
    readonly maxAttempts?: number;
    readonly retryDelayMs?: number;
    readonly dispatch: (item: OutboxItem) => Promise<void>;
    readonly now?: () => number;
    readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

export interface OutboxPollResult {
    readonly claimed: number;
    readonly delivered: number;
    readonly retried: number;
    readonly failed: number;
}

const defaultSleep = (delayMs: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason ?? new Error("Outbox worker stopped"));
            return;
        }
        const timer = setTimeout(resolve, delayMs);
        signal.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(signal.reason ?? new Error("Outbox worker stopped"));
            },
            { once: true }
        );
    });

function errorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === "string" && code.length > 0) return code;
    }
    return "DSH_DISPATCH_FAILED";
}

export function createOutboxWorker(options: OutboxWorkerOptions) {
    if (options.batchSize < 1 || options.ttlMs < 1 || options.pollMs < 1) {
        throw new Error("Outbox worker batchSize, ttlMs and pollMs must be positive");
    }
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? defaultSleep;
    const maxAttempts = options.maxAttempts ?? 5;
    const retryDelayMs = options.retryDelayMs ?? options.pollMs;
    const controller = new AbortController();

    async function runOnce(at = now()): Promise<OutboxPollResult> {
        const items = await options.repository.claimOutbox({
            owner: options.owner,
            ttlMs: options.ttlMs,
            batchSize: options.batchSize,
            now: at
        });
        let delivered = 0;
        let retried = 0;
        let failed = 0;
        for (const item of items) {
            try {
                // deliveryId is supplied by the committed outbox record. The dispatch adapter
                // must pass it unchanged so a lease retry cannot create another meeting fact.
                await options.dispatch(item);
                await options.repository.completeOutbox({
                    id: item.id,
                    leaseOwner: item.leaseOwner,
                    leaseToken: item.leaseToken,
                    completion: { status: "delivered", deliveredAt: now() },
                    now: now()
                });
                delivered += 1;
            } catch (error) {
                const code = errorCode(error);
                const terminal = item.attempts >= maxAttempts;
                await options.repository.completeOutbox({
                    id: item.id,
                    leaseOwner: item.leaseOwner,
                    leaseToken: item.leaseToken,
                    completion: terminal
                        ? { status: "failed", failedAt: now(), errorCode: code }
                        : { status: "retry", availableAt: now() + retryDelayMs, errorCode: code },
                    now: now()
                });
                if (terminal) failed += 1;
                else retried += 1;
            }
        }
        return { claimed: items.length, delivered, retried, failed };
    }

    async function start(): Promise<void> {
        while (!controller.signal.aborted) {
            await runOnce();
            if (!controller.signal.aborted) await sleep(options.pollMs, controller.signal);
        }
    }

    function stop(): void {
        controller.abort(new Error("Outbox worker stopped"));
    }

    return { runOnce, start, stop, signal: controller.signal };
}
