import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { CURRENT_SCHEMA_VERSION, migrate } from "./migrations.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type MeetingEventType =
    | "meeting.created"
    | "turn.planned"
    | "speaker.assigned"
    | "speaker_attempt.revoked"
    | "message.added"
    | "meeting.paused"
    | "meeting.waiting"
    | "meeting.resumed"
    | "meeting.replanned"
    | "meeting.ended"
    | "meeting.archiving"
    | "archive.sessions_closed"
    | "meeting.archived";

export interface MeetingSnapshot {
    teamId: string;
    meetingId: string;
    version: number;
    state: JsonObject;
    createdAt: number;
    updatedAt: number;
}

export interface DomainEventInput {
    type: MeetingEventType;
    payload: JsonObject;
    turnId?: string;
    attemptId?: string;
}

export interface OutboxInput {
    id?: string;
    deliveryId: string;
    kind: string;
    payload: JsonObject;
    availableAt?: number;
}

export interface TransitionResult<T> {
    state: JsonObject;
    result: T;
    events: DomainEventInput[];
    outbox: OutboxInput[];
}

export interface RepositoryCommand<T> {
    requestId: string;
    commandKind: string;
    callerBinding: string;
    requestHash: string;
    expectedMeetingVersion: number;
    transition: (snapshot: MeetingSnapshot) => TransitionResult<T>;
}

export interface CreateMeetingInput {
    requestId: string;
    callerBinding: string;
    requestHash: string;
    initialState: JsonObject;
    outbox?: OutboxInput[];
    createdAt?: number;
}

export interface CreateMeetingResult {
    meetingId: string;
    meetingVersion: number;
}

export interface CommittedResult<T> {
    requestId: string;
    meetingId: string;
    meetingVersion: number;
    result: T;
    eventSeqs: number[];
}

export interface WorkerLease {
    owner: string;
    ttlMs: number;
}

export interface ClaimOutboxInput extends WorkerLease {
    batchSize: number;
    now?: number;
}

export interface OutboxItem {
    id: string;
    deliveryId: string;
    kind: string;
    payload: JsonObject;
    attempts: number;
    leaseOwner: string;
    leaseToken: string;
    leaseDeadline: number;
}

export type OutboxCompletion =
    | { status: "delivered"; deliveredAt?: number }
    | { status: "retry"; availableAt: number; errorCode: string }
    | { status: "failed"; failedAt?: number; errorCode: string };

export interface CompleteOutboxInput {
    id: string;
    leaseOwner: string;
    leaseToken: string;
    completion: OutboxCompletion;
}

export interface OutboxCompletionResult {
    id: string;
    status: OutboxCompletion["status"];
}

export interface RecoverInput {
    now?: number;
}

export interface RecoveryResult {
    snapshot: MeetingSnapshot;
    reclaimedOutbox: number;
    pendingOutbox: number;
}

export type RepositoryErrorCode =
    | "MEETING_NOT_FOUND"
    | "MEETING_EXISTS"
    | "VERSION_CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
    | "SQLITE_BUSY"
    | "SCHEMA_VERSION_UNSUPPORTED"
    | "CORRUPT_DATABASE"
    | "LEASE_LOST"
    | "OUTBOX_NOT_FOUND"
    | "INVALID_STATE"
    | "CLOSED";

export class RepositoryError extends Error {
    readonly name = "RepositoryError";

    constructor(
        readonly code: RepositoryErrorCode,
        readonly retryable: boolean,
        readonly meetingId: string,
        message: string
    ) {
        super(message);
    }
}

interface MeetingRow {
    team_id: string;
    meeting_id: string;
    version: number;
    state_json: string;
    created_at: number;
    updated_at: number;
}

interface ReceiptRow {
    request_id: string;
    result_json: string;
    request_hash: string;
    meeting_version: number;
    event_seqs_json: string;
}

interface OutboxRow {
    id: string;
    delivery_id: string;
    kind: string;
    payload_json: string;
    attempts: number;
    lease_owner: string | null;
    lease_token: string | null;
    lease_deadline: number | null;
}

function json(value: JsonValue | unknown): string {
    return JSON.stringify(value);
}

function parseObject(value: string): JsonObject {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Expected JSON object");
    }
    return parsed as JsonObject;
}

function toSnapshot(row: MeetingRow): MeetingSnapshot {
    return {
        teamId: row.team_id,
        meetingId: row.meeting_id,
        version: row.version,
        state: parseObject(row.state_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function sqliteError(error: unknown, meetingId: string): RepositoryError {
    const message = error instanceof Error ? error.message : String(error);
    if (/busy|locked/i.test(message)) {
        return new RepositoryError("SQLITE_BUSY", true, meetingId, "SQLite is busy");
    }
    return new RepositoryError("CORRUPT_DATABASE", false, meetingId, "SQLite operation failed");
}

function row<T>(value: unknown): T | undefined {
    return value as T | undefined;
}

export class MeetingRepository {
    private closed = false;

    private constructor(
        private readonly db: DatabaseSync,
        readonly teamId: string,
        readonly meetingId: string
    ) {}

    static async open(input: {
        databasePath: string;
        teamId: string;
        meetingId: string;
    }): Promise<MeetingRepository> {
        await mkdir(dirname(input.databasePath), { recursive: true });
        const db = new DatabaseSync(input.databasePath);
        try {
            db.exec(
                "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2500;"
            );
            migrate(db);
            return new MeetingRepository(db, input.teamId, input.meetingId);
        } catch (error) {
            db.close();
            if (error instanceof RepositoryError) throw error;
            throw sqliteError(error, input.meetingId);
        }
    }

    private ensureOpen(): void {
        if (this.closed)
            throw new RepositoryError("CLOSED", false, this.meetingId, "Repository is closed");
    }

    private getMeeting(): MeetingSnapshot {
        const meeting = row<MeetingRow>(
            this.db
                .prepare("SELECT * FROM meetings WHERE meeting_id = ? AND team_id = ?")
                .get(this.meetingId, this.teamId)
        );
        if (!meeting)
            throw new RepositoryError(
                "MEETING_NOT_FOUND",
                false,
                this.meetingId,
                "Meeting does not exist"
            );
        return toSnapshot(meeting);
    }

    async create(input: CreateMeetingInput): Promise<CommittedResult<CreateMeetingResult>> {
        this.ensureOpen();
        const now = input.createdAt ?? Date.now();
        try {
            this.db.exec("BEGIN IMMEDIATE");
            const existing = row<ReceiptRow>(
                this.db
                    .prepare(
                        "SELECT * FROM idempotency_receipts WHERE request_id = ? AND command_kind = ? AND caller_binding = ?"
                    )
                    .get(input.requestId, "create_meeting", input.callerBinding)
            );
            if (existing) {
                if (existing.request_hash !== input.requestHash) {
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                }
                this.db.exec("COMMIT");
                return this.receiptResult(existing);
            }
            if (
                row(
                    this.db
                        .prepare("SELECT 1 FROM meetings WHERE meeting_id = ?")
                        .get(this.meetingId)
                )
            ) {
                throw new RepositoryError(
                    "MEETING_EXISTS",
                    false,
                    this.meetingId,
                    "Meeting already exists"
                );
            }
            this.db
                .prepare(
                    "INSERT INTO meetings(team_id, meeting_id, version, state_json, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)"
                )
                .run(this.teamId, this.meetingId, json(input.initialState), now, now);
            const eventSeq = this.insertEvent(
                { type: "meeting.created", payload: { meetingId: this.meetingId } },
                0,
                now
            );
            for (const item of input.outbox ?? []) this.insertOutbox(item, now);
            const result = {
                meetingId: this.meetingId,
                meetingVersion: 0
            } satisfies CreateMeetingResult;
            this.insertReceipt(
                input.requestId,
                "create_meeting",
                input.callerBinding,
                input.requestHash,
                result,
                [eventSeq],
                now
            );
            this.db.exec("COMMIT");
            return {
                requestId: input.requestId,
                meetingId: this.meetingId,
                meetingVersion: 0,
                result,
                eventSeqs: [eventSeq]
            };
        } catch (error) {
            this.rollback();
            if (error instanceof RepositoryError) throw error;
            throw sqliteError(error, this.meetingId);
        }
    }

    async read(): Promise<MeetingSnapshot> {
        this.ensureOpen();
        return this.getMeeting();
    }

    async execute<T>(command: RepositoryCommand<T>): Promise<CommittedResult<T>> {
        this.ensureOpen();
        const now = Date.now();
        try {
            this.db.exec("BEGIN IMMEDIATE");
            const existing = row<ReceiptRow>(
                this.db
                    .prepare(
                        "SELECT * FROM idempotency_receipts WHERE request_id = ? AND command_kind = ? AND caller_binding = ?"
                    )
                    .get(command.requestId, command.commandKind, command.callerBinding)
            );
            if (existing) {
                if (existing.request_hash !== command.requestHash) {
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                }
                this.db.exec("COMMIT");
                return this.receiptResult(existing) as CommittedResult<T>;
            }
            const snapshot = this.getMeeting();
            if (snapshot.version !== command.expectedMeetingVersion) {
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            }
            const transition = command.transition(snapshot);
            const nextVersion = snapshot.version + 1;
            this.db
                .prepare(
                    "UPDATE meetings SET version = ?, state_json = ?, updated_at = ? WHERE meeting_id = ?"
                )
                .run(nextVersion, json(transition.state), now, this.meetingId);
            const eventSeqs = transition.events.map((event) =>
                this.insertEvent(event, nextVersion, now)
            );
            for (const item of transition.outbox) this.insertOutbox(item, now);
            this.insertReceipt(
                command.requestId,
                command.commandKind,
                command.callerBinding,
                command.requestHash,
                transition.result,
                eventSeqs,
                now
            );
            this.db.exec("COMMIT");
            return {
                requestId: command.requestId,
                meetingId: this.meetingId,
                meetingVersion: nextVersion,
                result: transition.result,
                eventSeqs
            };
        } catch (error) {
            this.rollback();
            if (error instanceof RepositoryError) throw error;
            throw sqliteError(error, this.meetingId);
        }
    }

    async claimOutbox(input: ClaimOutboxInput): Promise<OutboxItem[]> {
        this.ensureOpen();
        const now = input.now ?? Date.now();
        const deadline = now + input.ttlMs;
        try {
            this.db.exec("BEGIN IMMEDIATE");
            const batchSize = Math.max(1, Math.floor(input.batchSize));
            const rows = this.db
                .prepare(
                    `SELECT * FROM outbox WHERE (status = 'pending' AND available_at <= ?) OR (status = 'leased' AND lease_deadline <= ?) ORDER BY available_at, created_at LIMIT ${batchSize}`
                )
                .all(now, now) as unknown as OutboxRow[];
            const items = rows.map((item) => {
                const token = randomUUID();
                this.db
                    .prepare(
                        "UPDATE outbox SET status = 'leased', attempts = attempts + 1, lease_owner = ?, lease_token = ?, lease_deadline = ? WHERE id = ?"
                    )
                    .run(input.owner, token, deadline, item.id);
                return {
                    id: item.id,
                    deliveryId: item.delivery_id,
                    kind: item.kind,
                    payload: parseObject(item.payload_json),
                    attempts: item.attempts + 1,
                    leaseOwner: input.owner,
                    leaseToken: token,
                    leaseDeadline: deadline
                };
            });
            this.db.exec("COMMIT");
            return items;
        } catch (error) {
            this.rollback();
            if (error instanceof RepositoryError) throw error;
            throw sqliteError(error, this.meetingId);
        }
    }

    async completeOutbox(input: CompleteOutboxInput): Promise<OutboxCompletionResult> {
        this.ensureOpen();
        const now = Date.now();
        try {
            this.db.exec("BEGIN IMMEDIATE");
            const current = row<OutboxRow>(
                this.db.prepare("SELECT * FROM outbox WHERE id = ?").get(input.id)
            );
            if (!current)
                throw new RepositoryError(
                    "OUTBOX_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Outbox item does not exist"
                );
            if (
                current.lease_owner !== input.leaseOwner ||
                current.lease_token !== input.leaseToken
            ) {
                throw new RepositoryError(
                    "LEASE_LOST",
                    true,
                    this.meetingId,
                    "Outbox lease is no longer owned"
                );
            }
            const completion = input.completion;
            if (completion.status === "delivered") {
                this.db
                    .prepare(
                        "UPDATE outbox SET status = 'delivered', delivered_at = ?, lease_owner = NULL, lease_token = NULL, lease_deadline = NULL, last_error = NULL WHERE id = ?"
                    )
                    .run(completion.deliveredAt ?? now, input.id);
            } else if (completion.status === "retry") {
                this.db
                    .prepare(
                        "UPDATE outbox SET status = 'pending', available_at = ?, lease_owner = NULL, lease_token = NULL, lease_deadline = NULL, last_error = ? WHERE id = ?"
                    )
                    .run(completion.availableAt, completion.errorCode, input.id);
            } else {
                this.db
                    .prepare(
                        "UPDATE outbox SET status = 'failed', failed_at = ?, lease_owner = NULL, lease_token = NULL, lease_deadline = NULL, last_error = ? WHERE id = ?"
                    )
                    .run(completion.failedAt ?? now, completion.errorCode, input.id);
            }
            this.db.exec("COMMIT");
            return { id: input.id, status: completion.status };
        } catch (error) {
            this.rollback();
            if (error instanceof RepositoryError) throw error;
            throw sqliteError(error, this.meetingId);
        }
    }

    async recover(input: RecoverInput = {}): Promise<RecoveryResult> {
        this.ensureOpen();
        const now = input.now ?? Date.now();
        try {
            this.db.exec("BEGIN IMMEDIATE");
            const reclaimed = this.db
                .prepare(
                    "UPDATE outbox SET status = 'pending', lease_owner = NULL, lease_token = NULL, lease_deadline = NULL WHERE status = 'leased' AND lease_deadline <= ?"
                )
                .run(now).changes;
            const pending = row<{ count: number }>(
                this.db
                    .prepare(
                        "SELECT COUNT(*) AS count FROM outbox WHERE status IN ('pending', 'leased')"
                    )
                    .get()
            );
            const snapshot = this.getMeeting();
            this.db.exec("COMMIT");
            return {
                snapshot,
                reclaimedOutbox: Number(reclaimed),
                pendingOutbox: pending?.count ?? 0
            };
        } catch (error) {
            this.rollback();
            if (error instanceof RepositoryError) throw error;
            throw sqliteError(error, this.meetingId);
        }
    }

    async close(): Promise<void> {
        if (!this.closed) {
            this.closed = true;
            this.db.close();
        }
    }

    private insertEvent(
        event: DomainEventInput,
        meetingVersion: number,
        createdAt: number
    ): number {
        const result = this.db
            .prepare(
                "INSERT INTO meeting_events(meeting_id, meeting_version, event_type, payload_json, turn_id, attempt_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )
            .run(
                this.meetingId,
                meetingVersion,
                event.type,
                json(event.payload),
                event.turnId ?? null,
                event.attemptId ?? null,
                createdAt
            );
        return Number(result.lastInsertRowid);
    }

    private insertOutbox(item: OutboxInput, createdAt: number): void {
        this.db
            .prepare(
                "INSERT INTO outbox(id, meeting_id, delivery_id, kind, payload_json, status, attempts, available_at, created_at) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)"
            )
            .run(
                item.id ?? randomUUID(),
                this.meetingId,
                item.deliveryId,
                item.kind,
                json(item.payload),
                item.availableAt ?? createdAt,
                createdAt
            );
    }

    private insertReceipt(
        requestId: string,
        commandKind: string,
        callerBinding: string,
        requestHash: string,
        result: unknown,
        eventSeqs: number[],
        createdAt: number
    ): void {
        this.db
            .prepare(
                "INSERT INTO idempotency_receipts(request_id, command_kind, caller_binding, result_json, request_hash, meeting_version, event_seqs_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .run(
                requestId,
                commandKind,
                callerBinding,
                json(result),
                requestHash,
                this.getMeeting().version,
                json(eventSeqs),
                createdAt
            );
    }

    private receiptResult<T>(receipt: ReceiptRow): CommittedResult<T> {
        return {
            requestId: receipt.request_id,
            meetingId: this.meetingId,
            meetingVersion: receipt.meeting_version,
            result: JSON.parse(receipt.result_json) as T,
            eventSeqs: JSON.parse(receipt.event_seqs_json) as number[]
        };
    }

    private rollback(): void {
        try {
            this.db.exec("ROLLBACK");
        } catch {
            // There may be no active transaction after a connection-level failure.
        }
    }
}

export { CURRENT_SCHEMA_VERSION };
