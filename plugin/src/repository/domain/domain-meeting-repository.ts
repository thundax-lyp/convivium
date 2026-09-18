import { DomainMeetingRepositoryMail } from "./domain-meeting-repository-mail.js";
import type { DomainMeetingRepositoryOpenOptions } from "./domain-meeting-repository-core.js";
export type { DomainMeetingRepositoryOpenOptions } from "./domain-meeting-repository-core.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type {
    ClaimOutboxInput,
    CommittedFactRecordV1,
    CommittedResult,
    CompleteOutboxInput,
    JsonObject,
    OutboxCompletionResult,
    OutboxItem,
    RecoverInput,
    RecoveryResult,
    RepositoryCommand,
    RenewOutboxLeaseInput
} from "@/repository/types.js";
import {
    CommittedFactRecordV1Schema,
    PersistedEventV1Schema,
    PersistedOutboxV1Schema,
    PersistedReceiptV1Schema,
    PersistenceProjectionV1Schema,
    type PersistenceProjectionV1
} from "./schemas.js";
import { decodeProjection, encodeProjection } from "./projection.js";
import { receiptKey, seqKey } from "./keys.js";
import { encodeCanonicalJson, type JsonValue } from "./canonical-json.js";
import { RepositoryError } from "@/repository/errors.js";

function jsonValue(value: unknown): JsonValue {
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    )
        return value;
    if (Array.isArray(value)) return value.map(jsonValue);
    if (value !== undefined && typeof value === "object") {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null)
            throw new TypeError("Repository value contains a non-plain object");
        const result: Record<string, JsonValue> = Object.create(null);
        for (const [key, item] of Object.entries(value)) {
            if (item !== undefined) result[key] = jsonValue(item);
        }
        return result;
    }
    throw new TypeError("Repository value is not JSON-compatible");
}

export class DomainMeetingRepository<TState = JsonObject>
    extends DomainMeetingRepositoryMail<TState>
    implements MeetingRepositoryPort<TState>
{
    static async open<TState = JsonObject>(
        options: DomainMeetingRepositoryOpenOptions<TState>
    ): Promise<DomainMeetingRepository<TState>> {
        const repository = new DomainMeetingRepository<TState>(options);
        await repository.initialize();
        return repository;
    }
    async replayReceipt(
        command: Pick<
            RepositoryCommand<unknown, TState>,
            "requestId" | "commandKind" | "authorization" | "requestHash"
        >
    ): Promise<CommittedResult<unknown> | undefined> {
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            if (!this.projection?.snapshot)
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Meeting is not ready"
                );
            const snapshot = this.decodeSnapshot(structuredClone(this.projection.snapshot));
            this.authorizationValidator.validateCommand({ snapshot, command });
            const existing =
                this.projection.receipts[
                    receiptKey(
                        command.requestId,
                        command.commandKind,
                        command.authorization.callerBinding
                    )
                ];
            if (!existing) return undefined;
            if (existing.requestHash !== command.requestHash)
                throw new RepositoryError(
                    "IDEMPOTENCY_CONFLICT",
                    false,
                    this.meetingId,
                    "Request hash conflicts with receipt"
                );
            return {
                requestId: command.requestId,
                meetingId: this.meetingId,
                meetingVersion: existing.meetingVersion,
                result: existing.result,
                eventSeqs: [...existing.eventSeqs]
            };
        });
    }
    async execute<T>(_command: RepositoryCommand<T, TState>): Promise<CommittedResult<T>> {
        const command = _command;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            if (!this.projection?.snapshot)
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Meeting is not ready"
                );
            const persistedSnapshot = structuredClone(this.projection.snapshot);
            const snapshot = this.decodeSnapshot(persistedSnapshot);
            this.authorizationValidator.validateCommand({ snapshot, command });
            const key = receiptKey(
                command.requestId,
                command.commandKind,
                command.authorization.callerBinding
            );
            const existing = this.projection.receipts[key];
            if (existing) {
                if (existing.requestHash !== command.requestHash)
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                return {
                    requestId: command.requestId,
                    meetingId: this.meetingId,
                    meetingVersion: existing.meetingVersion,
                    result: existing.result as T,
                    eventSeqs: [...existing.eventSeqs]
                };
            }
            if (snapshot.version !== command.expectedMeetingVersion)
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            const closure = command.archiveSessionResult;
            let allSessionOwnershipClosedAfterResult: boolean | undefined;
            if (closure !== undefined) {
                const failureCode = closure.failureCode?.trim();
                if (
                    command.commandKind !== "record_archive_session_result" ||
                    (closure.status === "closed" && closure.failureCode !== undefined) ||
                    (closure.status === "failed" && !failureCode)
                )
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.meetingId,
                        "Archive Session result is invalid"
                    );
                const ownership = this.projection.sessionOwnership[closure.sessionOwnershipId];
                if (
                    !ownership?.id ||
                    ownership.id !== closure.sessionOwnershipId ||
                    ownership.meetingId !== this.meetingId ||
                    !ownership.identityId ||
                    ownership.lifecycleStatus === "closed"
                )
                    throw new RepositoryError(
                        "RECOVERY_UNAVAILABLE",
                        false,
                        this.meetingId,
                        "Archive Session ownership is unavailable"
                    );
                allSessionOwnershipClosedAfterResult =
                    closure.status === "closed" &&
                    Object.values(this.projection.sessionOwnership).every(
                        (candidate) =>
                            candidate.meetingId !== this.meetingId ||
                            candidate.id === closure.sessionOwnershipId ||
                            candidate.lifecycleStatus === "closed"
                    );
            }
            const now = this.now();
            const transition = command.transition(snapshot, {
                ...(allSessionOwnershipClosedAfterResult === undefined
                    ? {}
                    : { allSessionOwnershipClosedAfterResult })
            });
            let transitionState: JsonObject;
            let transitionResult: JsonValue;
            try {
                transitionState = this.encodeState(transition.state);
                transitionResult = jsonValue(transition.result);
            } catch {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Command state or result is invalid"
                );
            }
            const facts = command.facts ?? [];
            if (transition.events.length === 0 && facts.length === 0) {
                if (!command.allowNoop)
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        this.meetingId,
                        "State transitions must emit at least one domain event"
                    );
                const meetingVersion = snapshot.version;
                return this.commit({
                    operation: `command:${command.commandKind}`,
                    now,
                    mutate: (current) => {
                        const next = decodeProjection(encodeProjection(current));
                        const receipt = PersistedReceiptV1Schema.safeParse({
                            formatVersion: 1,
                            requestId: command.requestId,
                            commandKind: command.commandKind,
                            callerBinding: command.authorization.callerBinding,
                            requestHash: command.requestHash,
                            meetingVersion,
                            result: transitionResult,
                            eventSeqs: [],
                            createdAt: now
                        });
                        if (!receipt.success)
                            throw new RepositoryError(
                                "INVALID_INPUT",
                                false,
                                this.meetingId,
                                "Command result is invalid"
                            );
                        next.receipts[key] = receipt.data;
                        return {
                            next,
                            result: {
                                requestId: command.requestId,
                                meetingId: this.meetingId,
                                meetingVersion,
                                result: transition.result,
                                eventSeqs: []
                            }
                        };
                    }
                });
            }
            const nextVersion = snapshot.version + 1;
            let next: PersistenceProjectionV1;
            try {
                next = decodeProjection(
                    encodeCanonicalJson({
                        ...this.projection,
                        snapshot: {
                            ...snapshot,
                            version: nextVersion,
                            state: { ...transitionState, version: nextVersion },
                            updatedAt: now
                        }
                    })
                );
            } catch {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Command state is invalid"
                );
            }
            const eventSeqs: number[] = [];
            for (const event of transition.events) {
                const eventSeq = next.nextEventSeq++;
                eventSeqs.push(eventSeq);
                const persisted = PersistedEventV1Schema.safeParse({
                    formatVersion: 1,
                    eventSeq,
                    meetingVersion: nextVersion,
                    type: event.type,
                    payload: jsonValue(event.payload),
                    turnId: event.turnId ?? null,
                    attemptId: event.attemptId ?? null,
                    createdAt: now
                });
                if (!persisted.success)
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.meetingId,
                        "Command event is invalid"
                    );
                next.events[seqKey(eventSeq)] = persisted.data;
            }
            for (const fact of facts) {
                if (fact.meetingVersion !== nextVersion || next.facts[fact.factId] !== undefined)
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.meetingId,
                        "Command fact identity or version is invalid"
                    );
                const persisted = CommittedFactRecordV1Schema.safeParse({
                    ...fact,
                    relatedIds: [...fact.relatedIds],
                    payload: jsonValue(fact.payload),
                    resultingState: this.encodeState(fact.resultingState)
                });
                if (!persisted.success)
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.meetingId,
                        "Command fact is invalid"
                    );
                next.facts[fact.factId] = persisted.data;
            }
            if (closure !== undefined) {
                const failureCode = closure.failureCode?.trim();
                const ownership = next.sessionOwnership[closure.sessionOwnershipId];
                if (!ownership) throw new Error("validated ownership is missing");
                if (closure.status === "closed") {
                    const { lastClosureFailureCode: _discarded, ...identity } = ownership;
                    next.sessionOwnership[closure.sessionOwnershipId] = {
                        ...identity,
                        lifecycleStatus: "closed",
                        capabilityStatus: "revoked",
                        updatedAt: now
                    };
                } else {
                    next.sessionOwnership[closure.sessionOwnershipId] = {
                        ...ownership,
                        lastClosureFailureCode: failureCode,
                        updatedAt: now
                    };
                }
            }
            const deliveryIds = new Set(Object.values(next.outbox).map((item) => item.deliveryId));
            for (const item of transition.outbox) {
                if (item.kind !== "dispatch")
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.meetingId,
                        "Outbox kind is not registered"
                    );
                if (deliveryIds.has(item.deliveryId))
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.meetingId,
                        "Outbox deliveryId already exists"
                    );
                deliveryIds.add(item.deliveryId);
                const id = item.id ?? crypto.randomUUID();
                const persisted = PersistedOutboxV1Schema.safeParse({
                    formatVersion: 1,
                    id,
                    deliveryId: item.deliveryId,
                    kind: "dispatch",
                    priority: item.priority ?? 50,
                    payload: jsonValue(item.payload),
                    status: "pending",
                    attempts: 0,
                    availableAt: item.availableAt ?? now,
                    leaseOwner: null,
                    leaseToken: null,
                    leaseDeadline: null,
                    deliveredAt: null,
                    failedAt: null,
                    lastError: null,
                    createdAt: now
                });
                if (!persisted.success)
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.meetingId,
                        "Command outbox item is invalid"
                    );
                next.outbox[id] = persisted.data;
            }
            const result = transition.result;
            const receipt = PersistedReceiptV1Schema.safeParse({
                formatVersion: 1,
                requestId: command.requestId,
                commandKind: command.commandKind,
                callerBinding: command.authorization.callerBinding,
                requestHash: command.requestHash,
                meetingVersion: nextVersion,
                result: transitionResult,
                eventSeqs,
                createdAt: now
            });
            if (!receipt.success)
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Command result is invalid"
                );
            next.receipts[key] = receipt.data;
            return this.commit({
                operation: `command:${command.commandKind}`,
                now,
                mutate: () => ({
                    next,
                    result: {
                        requestId: command.requestId,
                        meetingId: this.meetingId,
                        meetingVersion: nextVersion,
                        result,
                        eventSeqs
                    }
                })
            });
        }, command.commandKind);
    }
    async readCommittedFacts(): Promise<readonly CommittedFactRecordV1<TState>[]> {
        this.ensureOpen();
        return Object.values(this.projection?.facts ?? {})
            .sort(
                (left, right) =>
                    left.meetingVersion - right.meetingVersion ||
                    left.factId.localeCompare(right.factId)
            )
            .map((fact) => ({
                ...structuredClone(fact),
                resultingState: this.decodeState(fact.resultingState)
            }));
    }
    async claimOutbox(_input: ClaimOutboxInput): Promise<OutboxItem[]> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            if (input.ttlMs < 1 || !Number.isSafeInteger(input.batchSize) || input.batchSize < 1)
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Outbox lease bounds are invalid"
                );
            const now = input.now ?? this.now();
            const candidates = Object.values(this.projection?.outbox ?? {})
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
            if (candidates.length === 0) return [];
            return this.commit({
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
    /** Re-admit unfinished business deliveries after a Host restart, preserving identity. */
    async requeueAcceptedOutbox(input: {
        deliveryIds: readonly string[];
        expectedMeetingVersion: number;
        now?: number;
    }): Promise<number> {
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            if (this.projection?.snapshot?.version !== input.expectedMeetingVersion) {
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting changed during delivery recovery"
                );
            }
            const ids = new Set(input.deliveryIds);
            const items = Object.values(this.projection.outbox).filter(
                (item) =>
                    item.kind === "dispatch" &&
                    item.status === "delivered" &&
                    ids.has(item.deliveryId)
            );
            if (items.length === 0) return 0;
            const now = input.now ?? this.now();
            return this.commit({
                operation: "outbox.requeue-accepted",
                now,
                mutate: (current) => {
                    for (const item of items)
                        current.outbox[item.id] = {
                            ...item,
                            status: "pending",
                            availableAt: now,
                            deliveredAt: null,
                            leaseOwner: null,
                            leaseToken: null,
                            leaseDeadline: null
                        };
                    return { next: current, result: items.length };
                }
            });
        });
    }
    async completeOutbox(_input: CompleteOutboxInput): Promise<OutboxCompletionResult> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const now = input.now ?? this.now();
            const current = this.projection?.outbox[input.id];
            if (!current)
                throw new RepositoryError(
                    "OUTBOX_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Outbox item does not exist"
                );
            if (
                current.status !== "leased" ||
                current.leaseOwner !== input.leaseOwner ||
                current.leaseToken !== input.leaseToken ||
                (current.leaseDeadline ?? 0) <= now
            )
                throw new RepositoryError(
                    "LEASE_LOST",
                    false,
                    this.meetingId,
                    "Outbox lease is no longer valid"
                );
            return this.commit({
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
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            if (input.ttlMs < 1)
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Outbox lease ttlMs must be positive"
                );
            const now = input.now ?? this.now();
            const item = this.projection?.outbox[input.id];
            if (
                !item ||
                item.status !== "leased" ||
                item.leaseOwner !== input.leaseOwner ||
                item.leaseToken !== input.leaseToken ||
                (item.leaseDeadline ?? 0) <= now
            )
                throw new RepositoryError(
                    "LEASE_LOST",
                    false,
                    this.meetingId,
                    "Outbox lease is no longer valid"
                );
            return this.commit({
                operation: "outbox.renew",
                now,
                mutate: (projection) => ({
                    next: PersistenceProjectionV1Schema.parse({
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
    async recover(_input: RecoverInput = {}): Promise<RecoveryResult<TState>> {
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const creation = this.meetingDomain.table("creation").get("current");
            if (!creation)
                throw new RepositoryError(
                    "CORRUPT_DATABASE",
                    false,
                    this.meetingId,
                    "Meeting bootstrap is missing"
                );
            const now = _input.now ?? this.now();
            let reclaimedOutbox = 0;
            if (this.projection) {
                const expired = Object.values(this.projection.outbox).filter(
                    (item) => item.status === "leased" && (item.leaseDeadline ?? 0) <= now
                );
                if (expired.length)
                    reclaimedOutbox = await this.commit({
                        operation: "outbox.recover",
                        now,
                        mutate: (projection) => {
                            for (const item of expired)
                                projection.outbox[item.id] = {
                                    ...item,
                                    status: "pending",
                                    leaseOwner: null,
                                    leaseToken: null,
                                    leaseDeadline: null
                                };
                            return { next: projection, result: expired.length };
                        }
                    });
            }
            const ready = creation.status === "ready" && this.projection !== undefined;
            const bootstrap = ready
                ? structuredClone(this.projection!.bootstrap)
                : {
                      status: creation.status,
                      createRequestId: creation.requestId,
                      requestHash: creation.requestHash,
                      ...(creation.createResult === null
                          ? {}
                          : { createResult: creation.createResult }),
                      createdAt: creation.createdAt,
                      updatedAt: creation.updatedAt,
                      ...(creation.failureCode === null
                          ? {}
                          : { failureCode: creation.failureCode })
                  };
            const pendingOutbox = Object.values(this.projection?.outbox ?? {}).filter(
                (item) => item.status === "pending" || item.status === "leased"
            ).length;
            const ownership = ready ? this.projection!.sessionOwnership : creation.sessionOwnership;
            return {
                ...(ready && this.projection!.snapshot
                    ? { snapshot: this.decodeSnapshot(structuredClone(this.projection!.snapshot)) }
                    : {}),
                bootstrap,
                sessionOwnership: Object.values(ownership).map((item) => structuredClone(item)),
                reclaimedOutbox,
                pendingOutbox
            };
        });
    }

    async close(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.closed = true;
        this.closePromise = (async () => {
            await this.mutationChain;
            const maintenanceError = this.maintenanceError;
            let domainCloseError: unknown;
            try {
                if (!this.domainClosed) {
                    this.domainClosed = true;
                    await this.meetingDomain.close();
                }
            } catch (error) {
                domainCloseError = error;
            }
            if (maintenanceError) throw maintenanceError;
            if (domainCloseError !== undefined) throw domainCloseError;
        })();
        return this.closePromise;
    }
}
