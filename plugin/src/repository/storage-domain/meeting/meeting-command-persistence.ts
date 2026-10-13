import type {
    CommittedFactRecord,
    CommittedResult,
    JsonObject,
    RepositoryCommand
} from "@/repository/index.ts";
import { RepositoryError } from "@/repository/index.ts";
import {
    CommittedFactRecordSchema,
    PersistedEventSchema,
    PersistedOutboxSchema,
    PersistedReceiptSchema,
    receiptKey,
    seqKey,
    type PersistenceProjection
} from "@/repository/storage-domain/format/index.ts";
import { decodeProjection, encodeProjection } from "./projection.ts";
import { encodeCanonicalJson, type JsonValue } from "@/utils/index.ts";
import { MeetingPersistenceState } from "./meeting-persistence-state.ts";

const jsonValue = (value: unknown): JsonValue => {
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    ) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(jsonValue);
    }
    if (value !== undefined && typeof value === "object") {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new TypeError("Repository value contains a non-plain object");
        }
        const result: Record<string, JsonValue> = Object.create(null);
        for (const [key, item] of Object.entries(value)) {
            if (item !== undefined) {
                result[key] = jsonValue(item);
            }
        }
        return result;
    }
    throw new TypeError("Repository value is not JSON-compatible");
};

export class MeetingCommandPersistence<TState = JsonObject> {
    constructor(private readonly state: MeetingPersistenceState<TState>) {}
    async replayReceipt(
        command: Pick<
            RepositoryCommand<unknown, TState>,
            "requestId" | "commandKind" | "authorization" | "requestHash"
        >
    ): Promise<CommittedResult<unknown> | undefined> {
        this.state.ensureOpen();
        return this.state.enqueueMutation(async () => {
            if (!this.state.projection?.snapshot) {
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.state.meetingId,
                    "Meeting is not ready"
                );
            }
            const snapshot = this.state.decodeSnapshot(
                structuredClone(this.state.projection.snapshot)
            );
            this.state.authorizationValidator.validateCommand({ snapshot, command });
            const existing =
                this.state.projection.receipts[
                    receiptKey(
                        command.requestId,
                        command.commandKind,
                        command.authorization.callerBinding
                    )
                ];
            if (!existing) {
                return undefined;
            }
            if (existing.requestHash !== command.requestHash) {
                throw new RepositoryError(
                    "IDEMPOTENCY_CONFLICT",
                    false,
                    this.state.meetingId,
                    "Request hash conflicts with receipt"
                );
            }
            return {
                requestId: command.requestId,
                meetingId: this.state.meetingId,
                meetingVersion: existing.meetingVersion,
                result: existing.result,
                eventSeqs: [...existing.eventSeqs]
            };
        });
    }
    async execute<T>(command: RepositoryCommand<T, TState>): Promise<CommittedResult<T>> {
        this.state.ensureOpen();
        return this.state.enqueueMutation(() => this.executeCommand(command), command.commandKind);
    }

    private async executeCommand<T>(
        command: RepositoryCommand<T, TState>
    ): Promise<CommittedResult<T>> {
        if (!this.state.projection?.snapshot) {
            throw new RepositoryError(
                "INVALID_STATE",
                false,
                this.state.meetingId,
                "Meeting is not ready"
            );
        }
        const snapshot = this.state.decodeSnapshot(structuredClone(this.state.projection.snapshot));
        this.state.authorizationValidator.validateCommand({ snapshot, command });
        const key = receiptKey(
            command.requestId,
            command.commandKind,
            command.authorization.callerBinding
        );
        const replayed = this.replayCommandReceipt(command, key);
        if (replayed) {
            return replayed;
        }
        if (
            command.expectedMeetingVersion !== undefined &&
            snapshot.version !== command.expectedMeetingVersion
        ) {
            throw new RepositoryError(
                "VERSION_CONFLICT",
                true,
                this.state.meetingId,
                "Meeting version is stale"
            );
        }
        const archiveContext = this.validateArchiveSessionResult(command);
        const now = this.state.now();
        const transition = command.transition(snapshot, {
            ...(archiveContext.allSessionOwnershipClosedAfterResult === undefined
                ? {}
                : {
                      allSessionOwnershipClosedAfterResult:
                          archiveContext.allSessionOwnershipClosedAfterResult
                  })
        });
        const encoded = this.encodeTransition(transition);
        if (transition.events.length === 0 && (command.facts ?? []).length === 0) {
            return this.commitNoop(command, key, snapshot.version, transition, encoded.result, now);
        }
        return this.commitTransition(
            command,
            key,
            snapshot,
            transition,
            encoded,
            archiveContext.archiveSessionOwnershipKey,
            now
        );
    }

    private replayCommandReceipt<T>(
        command: RepositoryCommand<T, TState>,
        key: string
    ): CommittedResult<T> | undefined {
        const existing = this.state.projection!.receipts[key];
        if (!existing) {
            return undefined;
        }
        if (existing.requestHash !== command.requestHash) {
            throw new RepositoryError(
                "IDEMPOTENCY_CONFLICT",
                false,
                this.state.meetingId,
                "Request hash conflicts with receipt"
            );
        }
        return {
            requestId: command.requestId,
            meetingId: this.state.meetingId,
            meetingVersion: existing.meetingVersion,
            result: existing.result as T,
            eventSeqs: [...existing.eventSeqs]
        };
    }

    private validateArchiveSessionResult<T>(command: RepositoryCommand<T, TState>): {
        allSessionOwnershipClosedAfterResult?: boolean;
        archiveSessionOwnershipKey?: string;
    } {
        const closure = command.archiveSessionResult;
        if (closure === undefined) {
            return {};
        }
        const failureCode = closure.failureCode?.trim();
        if (
            command.commandKind !== "record_archive_session_result" ||
            (closure.status === "closed" && closure.failureCode !== undefined) ||
            (closure.status === "failed" && !failureCode)
        ) {
            throw new RepositoryError(
                "INVALID_INPUT",
                false,
                this.state.meetingId,
                "Archive Session result is invalid"
            );
        }
        const ownershipEntry = Object.entries(this.state.projection!.sessionOwnership).find(
            ([, candidate]) => candidate.id === closure.sessionOwnershipId
        );
        if (!ownershipEntry) {
            throw new RepositoryError(
                "RECOVERY_UNAVAILABLE",
                false,
                this.state.meetingId,
                "Archive Session ownership is unavailable"
            );
        }
        const [ownershipKey, ownership] = ownershipEntry;
        if (
            !ownership.id ||
            ownership.id !== closure.sessionOwnershipId ||
            ownership.meetingId !== this.state.meetingId ||
            !ownership.identityId ||
            ownership.lifecycleStatus === "closed" ||
            ownership.capabilityStatus !== "revoked"
        ) {
            throw new RepositoryError(
                "RECOVERY_UNAVAILABLE",
                false,
                this.state.meetingId,
                "Archive Session ownership is unavailable"
            );
        }
        return {
            archiveSessionOwnershipKey: ownershipKey,
            allSessionOwnershipClosedAfterResult:
                closure.status === "closed" &&
                Object.values(this.state.projection!.sessionOwnership).every(
                    (candidate) =>
                        candidate.meetingId !== this.state.meetingId ||
                        candidate.id === closure.sessionOwnershipId ||
                        candidate.lifecycleStatus === "closed"
                )
        };
    }

    private encodeTransition<T>(
        transition: ReturnType<RepositoryCommand<T, TState>["transition"]>
    ): { state: JsonObject; result: JsonValue } {
        try {
            return {
                state: this.state.encodeState(transition.state),
                result: jsonValue(transition.result)
            };
        } catch {
            throw new RepositoryError(
                "INVALID_INPUT",
                false,
                this.state.meetingId,
                "Command state or result is invalid"
            );
        }
    }

    private commitNoop<T>(
        command: RepositoryCommand<T, TState>,
        key: string,
        meetingVersion: number,
        transition: ReturnType<RepositoryCommand<T, TState>["transition"]>,
        transitionResult: JsonValue,
        now: number
    ): Promise<CommittedResult<T>> {
        if (!command.allowNoop) {
            throw new RepositoryError(
                "INVALID_STATE",
                false,
                this.state.meetingId,
                "State transitions must emit at least one domain event"
            );
        }
        return this.state.commit({
            operation: `command:${command.commandKind}`,
            now,
            mutate: (current) => {
                const next = decodeProjection(encodeProjection(current));
                const receipt = PersistedReceiptSchema.safeParse({
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
                if (!receipt.success) {
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.state.meetingId,
                        "Command result is invalid"
                    );
                }
                next.receipts[key] = receipt.data;
                return {
                    next,
                    result: {
                        requestId: command.requestId,
                        meetingId: this.state.meetingId,
                        meetingVersion,
                        result: transition.result,
                        eventSeqs: []
                    }
                };
            }
        });
    }

    private createTransitionProjection(
        snapshot: Parameters<RepositoryCommand<unknown, TState>["transition"]>[0],
        transitionState: JsonObject,
        nextVersion: number,
        now: number
    ): PersistenceProjection {
        try {
            return decodeProjection(
                encodeCanonicalJson({
                    ...this.state.projection,
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
                this.state.meetingId,
                "Command state is invalid"
            );
        }
    }

    private appendEvents(
        next: PersistenceProjection,
        events: ReturnType<RepositoryCommand<unknown, TState>["transition"]>["events"],
        nextVersion: number,
        now: number
    ): number[] {
        const eventSeqs: number[] = [];
        for (const event of events) {
            const eventSeq = next.nextEventSeq++;
            eventSeqs.push(eventSeq);
            const persisted = PersistedEventSchema.safeParse({
                formatVersion: 1,
                eventSeq,
                meetingVersion: nextVersion,
                type: event.type,
                payload: jsonValue(event.payload),
                turnId: event.turnId ?? null,
                attemptId: event.attemptId ?? null,
                createdAt: event.occurredAt ?? now
            });
            if (!persisted.success) {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.state.meetingId,
                    "Command event is invalid"
                );
            }
            next.events[seqKey(eventSeq)] = persisted.data;
        }
        return eventSeqs;
    }

    private appendFacts(
        next: PersistenceProjection,
        facts: readonly CommittedFactRecord<TState>[],
        nextVersion: number
    ): void {
        for (const fact of facts) {
            if (fact.meetingVersion !== nextVersion || next.facts[fact.factId] !== undefined) {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.state.meetingId,
                    "Command fact identity or version is invalid"
                );
            }
            const persisted = CommittedFactRecordSchema.safeParse({
                ...fact,
                relatedIds: [...fact.relatedIds],
                payload: jsonValue(fact.payload),
                resultingState: this.state.encodeState(fact.resultingState)
            });
            if (!persisted.success) {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.state.meetingId,
                    "Command fact is invalid"
                );
            }
            next.facts[fact.factId] = persisted.data;
        }
    }

    private applyArchiveSessionResult<T>(
        next: PersistenceProjection,
        command: RepositoryCommand<T, TState>,
        archiveSessionOwnershipKey: string | undefined,
        now: number
    ): void {
        const closure = command.archiveSessionResult;
        if (closure === undefined) {
            return;
        }
        if (!archiveSessionOwnershipKey) {
            throw new Error("validated ownership key is missing");
        }
        const ownership = next.sessionOwnership[archiveSessionOwnershipKey];
        if (!ownership) {
            throw new Error("validated ownership is missing");
        }
        if (closure.status === "closed") {
            next.sessionOwnership[archiveSessionOwnershipKey] = {
                ...ownership,
                lifecycleStatus: "closed",
                capabilityStatus: "revoked",
                updatedAt: now
            };
            return;
        }
        next.sessionOwnership[archiveSessionOwnershipKey] = {
            ...ownership,
            updatedAt: now
        };
    }

    private appendOutbox(
        next: PersistenceProjection,
        outbox: ReturnType<RepositoryCommand<unknown, TState>["transition"]>["outbox"],
        now: number
    ): void {
        const deliveryIds = new Set(Object.values(next.outbox).map((item) => item.deliveryId));
        for (const item of outbox) {
            if (item.kind !== "dispatch") {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.state.meetingId,
                    "Outbox kind is not registered"
                );
            }
            if (deliveryIds.has(item.deliveryId)) {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.state.meetingId,
                    "Outbox deliveryId already exists"
                );
            }
            deliveryIds.add(item.deliveryId);
            const id = item.id ?? crypto.randomUUID();
            const persisted = PersistedOutboxSchema.safeParse({
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
            if (!persisted.success) {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.state.meetingId,
                    "Command outbox item is invalid"
                );
            }
            next.outbox[id] = persisted.data;
        }
    }

    private appendReceipt<T>(
        next: PersistenceProjection,
        command: RepositoryCommand<T, TState>,
        key: string,
        nextVersion: number,
        transitionResult: JsonValue,
        eventSeqs: readonly number[],
        now: number
    ): void {
        const receipt = PersistedReceiptSchema.safeParse({
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
        if (!receipt.success) {
            throw new RepositoryError(
                "INVALID_INPUT",
                false,
                this.state.meetingId,
                "Command result is invalid"
            );
        }
        next.receipts[key] = receipt.data;
    }

    private commitTransition<T>(
        command: RepositoryCommand<T, TState>,
        key: string,
        snapshot: Parameters<RepositoryCommand<T, TState>["transition"]>[0],
        transition: ReturnType<RepositoryCommand<T, TState>["transition"]>,
        encoded: { state: JsonObject; result: JsonValue },
        archiveSessionOwnershipKey: string | undefined,
        now: number
    ): Promise<CommittedResult<T>> {
        const nextVersion = snapshot.version + 1;
        const next = this.createTransitionProjection(snapshot, encoded.state, nextVersion, now);
        const eventSeqs = this.appendEvents(next, transition.events, nextVersion, now);
        this.appendFacts(next, command.facts ?? [], nextVersion);
        this.applyArchiveSessionResult(next, command, archiveSessionOwnershipKey, now);
        this.appendOutbox(next, transition.outbox, now);
        this.appendReceipt(next, command, key, nextVersion, encoded.result, eventSeqs, now);
        return this.state.commit({
            operation: `command:${command.commandKind}`,
            now,
            mutate: () => ({
                next,
                result: {
                    requestId: command.requestId,
                    meetingId: this.state.meetingId,
                    meetingVersion: nextVersion,
                    result: transition.result,
                    eventSeqs
                }
            })
        });
    }
}
