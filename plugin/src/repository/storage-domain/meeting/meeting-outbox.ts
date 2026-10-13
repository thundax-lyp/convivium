import type {
    ClaimOutboxInput,
    CompleteOutboxInput,
    OutboxCompletionResult,
    OutboxItem,
    RenewOutboxLeaseInput,
    JsonObject
} from "@/repository/index.ts";
import { RepositoryError } from "@/repository/index.ts";
import { PersistenceProjectionSchema } from "@/repository/storage-domain/format/index.ts";
import { MeetingPersistenceState } from "./meeting-persistence-state.ts";

export class MeetingOutbox<TState = JsonObject> {
    constructor(private readonly state: MeetingPersistenceState<TState>) {}
    async claimOutbox(_input: ClaimOutboxInput): Promise<OutboxItem[]> {
        const input = _input;
        this.state.ensureOpen();
        return this.state.enqueueMutation(async () => {
            if (input.ttlMs < 1 || !Number.isSafeInteger(input.batchSize) || input.batchSize < 1) {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.state.meetingId,
                    "Outbox lease bounds are invalid"
                );
            }
            const now = input.now ?? this.state.now();
            const candidates = Object.values(this.state.projection?.outbox ?? {})
                .filter(
                    (item) =>
                        (item.status === "pending" && item.availableAt <= now) ||
                        (item.status === "leased" && (item.leaseDeadline ?? Infinity) <= now)
                )
                .sort(
                    (a, b) =>
                        b.priority - a.priority ||
                        a.createdAt - b.createdAt ||
                        (a.id < b.id ? -1 : 1)
                )
                .slice(0, input.batchSize);
            if (candidates.length === 0) {
                return [];
            }
            return this.state.commit({
                operation: "outbox.claim",
                now,
                mutate: (current) => {
                    const result: OutboxItem[] = [];
                    for (const item of candidates) {
                        const leaseToken = crypto.randomUUID();
                        const next = {
                            ...item,
                            status: "leased" as const,
                            attempts: item.attempts + 1,
                            leaseOwner: input.owner,
                            leaseToken,
                            leaseDeadline: now + input.ttlMs
                        };
                        current.outbox[item.id] = next;
                        result.push({
                            id: next.id,
                            deliveryId: next.deliveryId,
                            kind: next.kind,
                            priority: next.priority,
                            payload: next.payload,
                            attempts: next.attempts,
                            leaseOwner: input.owner,
                            leaseToken,
                            leaseDeadline: next.leaseDeadline
                        });
                    }
                    return { next: current, result };
                }
            });
        });
    }
    async completeOutbox(_input: CompleteOutboxInput): Promise<OutboxCompletionResult> {
        const input = _input;
        this.state.ensureOpen();
        return this.state.enqueueMutation(async () => {
            const now = input.now ?? this.state.now();
            const current = this.state.projection?.outbox[input.id];
            if (!current) {
                throw new RepositoryError(
                    "OUTBOX_NOT_FOUND",
                    false,
                    this.state.meetingId,
                    "Outbox item does not exist"
                );
            }
            if (
                current.status !== "leased" ||
                current.leaseOwner !== input.leaseOwner ||
                current.leaseToken !== input.leaseToken ||
                (current.leaseDeadline ?? 0) <= now
            ) {
                throw new RepositoryError(
                    "LEASE_LOST",
                    false,
                    this.state.meetingId,
                    "Outbox lease is no longer valid"
                );
            }
            return this.state.commit({
                operation: "outbox.complete",
                now,
                mutate: (projection) => {
                    const item = projection.outbox[input.id];
                    const completion = input.completion;
                    projection.outbox[input.id] =
                        completion.status === "delivered"
                            ? {
                                  ...item,
                                  status: "delivered",
                                  deliveredAt: completion.deliveredAt ?? now,
                                  leaseOwner: null,
                                  leaseToken: null,
                                  leaseDeadline: null
                              }
                            : completion.status === "retry"
                              ? {
                                    ...item,
                                    status: "pending",
                                    availableAt: completion.availableAt,
                                    lastError: completion.errorCode,
                                    leaseOwner: null,
                                    leaseToken: null,
                                    leaseDeadline: null
                                }
                              : {
                                    ...item,
                                    status: "failed",
                                    failedAt: completion.failedAt ?? now,
                                    lastError: completion.errorCode,
                                    leaseOwner: null,
                                    leaseToken: null,
                                    leaseDeadline: null
                                };
                    return {
                        next: projection,
                        result: { id: input.id, status: completion.status }
                    };
                }
            });
        });
    }
    async renewOutboxLease(_input: RenewOutboxLeaseInput): Promise<number> {
        const input = _input;
        this.state.ensureOpen();
        return this.state.enqueueMutation(async () => {
            if (input.ttlMs < 1) {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.state.meetingId,
                    "Outbox lease ttlMs must be positive"
                );
            }
            const now = input.now ?? this.state.now();
            const item = this.state.projection?.outbox[input.id];
            if (
                !item ||
                item.status !== "leased" ||
                item.leaseOwner !== input.leaseOwner ||
                item.leaseToken !== input.leaseToken ||
                (item.leaseDeadline ?? 0) <= now
            ) {
                throw new RepositoryError(
                    "LEASE_LOST",
                    false,
                    this.state.meetingId,
                    "Outbox lease is no longer valid"
                );
            }
            return this.state.commit({
                operation: "outbox.renew",
                now,
                mutate: (projection) => ({
                    next: PersistenceProjectionSchema.parse({
                        ...projection,
                        outbox: {
                            ...projection.outbox,
                            [input.id]: { ...item, leaseDeadline: now + input.ttlMs }
                        }
                    }),
                    result: now + input.ttlMs
                })
            });
        });
    }
}
