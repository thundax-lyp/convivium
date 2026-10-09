import type { OutboxItem, WorkerLease } from "@/repository/index.ts";

export interface OutboxWorkerRepository {
    claimOutbox(input: WorkerLease & { batchSize: number; now?: number }): Promise<OutboxItem[]>;
    renewOutboxLease(input: {
        id: string;
        leaseOwner: string;
        leaseToken: string;
        ttlMs: number;
        now?: number;
    }): Promise<number>;
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
    readonly dispatch: (item: OutboxItem, signal: AbortSignal) => Promise<void>;
    readonly beforeRun?: (now: number) => Promise<void>;
    readonly onTerminalFailure?: (
        item: OutboxItem,
        errorCode: string,
        failedAt: number
    ) => Promise<void>;
    readonly now?: () => number;
    readonly sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

export type MeetingOutboxWakeup = Pick<ReturnType<typeof createOutboxWorker>, "wake">;

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
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason ?? new Error("Outbox worker stopped"));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);
        signal.addEventListener("abort", onAbort, { once: true });
    });

const errorCode = (error: unknown): string => {
    if (error && typeof error === "object" && "code" in error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === "string" && code.length > 0) {
            return code;
        }
    }
    return "DSH_DISPATCH_FAILED";
};

const isLeaseLost = (error: unknown): boolean => errorCode(error) === "LEASE_LOST";

const isRetryable = (error: unknown): boolean => {
    return !(
        error &&
        typeof error === "object" &&
        "retryable" in error &&
        (error as { retryable?: unknown }).retryable === false
    );
};

const terminatesOnAttemptLimit = (error: unknown): boolean => {
    return !(
        error &&
        typeof error === "object" &&
        "terminalOnAttemptLimit" in error &&
        (error as { terminalOnAttemptLimit?: unknown }).terminalOnAttemptLimit === false
    );
};

const retryAvailableAt = (error: unknown, fallback: number): number => {
    if (error && typeof error === "object" && "retryAt" in error) {
        const retryAt = (error as { retryAt?: unknown }).retryAt;
        if (typeof retryAt === "number" && Number.isSafeInteger(retryAt) && retryAt > fallback) {
            return retryAt;
        }
    }
    return fallback;
};

export const createOutboxWorker = (options: OutboxWorkerOptions) => {
    if (options.batchSize < 1 || options.ttlMs < 1 || options.pollMs < 1) {
        throw new Error("Outbox worker batchSize, ttlMs and pollMs must be positive");
    }
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? defaultSleep;
    const maxAttempts = options.maxAttempts ?? 5;
    const retryDelayMs = options.retryDelayMs ?? options.pollMs;
    const controller = new AbortController();
    let wake: (() => void) | undefined;
    let running: Promise<void> | undefined;

    const dispatchWithLeaseRenewal = async (item: OutboxItem): Promise<void> => {
        const deliveryController = new AbortController();
        const abortDelivery = () => deliveryController.abort(controller.signal.reason);
        controller.signal.addEventListener("abort", abortDelivery, { once: true });
        let renewalError: unknown;
        const renewUntilFinished = (async () => {
            try {
                while (!deliveryController.signal.aborted) {
                    await defaultSleep(
                        Math.max(1, Math.floor(options.ttlMs / 2)),
                        deliveryController.signal
                    );
                    if (deliveryController.signal.aborted) {
                        return;
                    }
                    await options.repository.renewOutboxLease({
                        id: item.id,
                        leaseOwner: item.leaseOwner,
                        leaseToken: item.leaseToken,
                        ttlMs: options.ttlMs,
                        now: now()
                    });
                }
            } catch (error) {
                if (!deliveryController.signal.aborted) {
                    renewalError = error;
                    deliveryController.abort(error);
                }
            }
        })();
        try {
            await options.dispatch(item, deliveryController.signal);
            if (renewalError !== undefined) {
                throw renewalError;
            }
        } catch (error) {
            throw renewalError ?? error;
        } finally {
            deliveryController.abort(new Error("Outbox delivery finished"));
            controller.signal.removeEventListener("abort", abortDelivery);
            await renewUntilFinished;
        }
    };

    const runOnce = async (at = now()): Promise<OutboxPollResult> => {
        if (controller.signal.aborted) {
            return { claimed: 0, delivered: 0, retried: 0, failed: 0 };
        }
        await options.beforeRun?.(at);
        if (controller.signal.aborted) {
            return { claimed: 0, delivered: 0, retried: 0, failed: 0 };
        }
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
            let dispatchError: unknown;
            let dispatchSucceeded = false;
            try {
                // deliveryId is supplied by the committed outbox record. The dispatch adapter
                // must pass it unchanged so a lease retry cannot create another meeting fact.
                await dispatchWithLeaseRenewal(item);
                dispatchSucceeded = true;
            } catch (error) {
                dispatchError = error;
            }
            if (controller.signal.aborted) {
                return { claimed: items.length, delivered, retried, failed };
            }
            if (!dispatchSucceeded && isLeaseLost(dispatchError)) {
                continue;
            }
            if (dispatchSucceeded) {
                try {
                    await options.repository.completeOutbox({
                        id: item.id,
                        leaseOwner: item.leaseOwner,
                        leaseToken: item.leaseToken,
                        completion: { status: "delivered", deliveredAt: now() },
                        now: now()
                    });
                } catch (error) {
                    if (isLeaseLost(error)) {
                        continue;
                    }
                    throw error;
                }
                delivered += 1;
                continue;
            }
            const code = errorCode(dispatchError);
            const terminal =
                !isRetryable(dispatchError) ||
                (terminatesOnAttemptLimit(dispatchError) && item.attempts >= maxAttempts);
            const completionNow = now();
            const availableAt = retryAvailableAt(dispatchError, completionNow + retryDelayMs);
            try {
                await options.repository.completeOutbox({
                    id: item.id,
                    leaseOwner: item.leaseOwner,
                    leaseToken: item.leaseToken,
                    completion: terminal
                        ? { status: "failed", failedAt: completionNow, errorCode: code }
                        : { status: "retry", availableAt, errorCode: code },
                    now: completionNow
                });
            } catch (error) {
                if (isLeaseLost(error)) {
                    continue;
                }
                throw error;
            }
            if (terminal) {
                failed += 1;
                await options.onTerminalFailure?.(item, code, completionNow);
            } else {
                retried += 1;
            }
        }
        return { claimed: items.length, delivered, retried, failed };
    };

    const start = async (): Promise<void> => {
        running = (async () => {
            while (!controller.signal.aborted) {
                try {
                    await runOnce();
                } catch (error) {
                    if (!isRetryable(error)) {
                        throw error;
                    }
                }
                if (!controller.signal.aborted) {
                    const wakePromise = new Promise<void>((resolve) => {
                        wake = resolve;
                    });
                    await Promise.race([sleep(options.pollMs, controller.signal), wakePromise]);
                    wake = undefined;
                }
            }
        })();
        try {
            await running;
        } catch (error) {
            if (!controller.signal.aborted) {
                throw error;
            }
        }
    };

    const stop = (): void => {
        controller.abort(new Error("Outbox worker stopped"));
        wake?.();
    };

    const wait = async (): Promise<void> => {
        try {
            await running;
        } catch (error) {
            if (!controller.signal.aborted) {
                throw error;
            }
        }
    };

    return { runOnce, start, stop, wait, wake: () => wake?.(), signal: controller.signal };
};
