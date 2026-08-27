import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { RepositoryError } from "./errors.js";
import { CURRENT_SCHEMA_VERSION, migrate } from "./migrations.js";
import type { DomainEventType } from "../domain/model.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type MeetingEventType = DomainEventType;

export const OUTBOX_KINDS = ["dispatch"] as const;
export type OutboxKind = (typeof OUTBOX_KINDS)[number];

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
    kind: OutboxKind;
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
    authorization: CommandAuthorization;
    requestHash: string;
    expectedMeetingVersion: number;
    transition: (snapshot: MeetingSnapshot) => TransitionResult<T>;
}

export interface CommandAuthorization {
    callerBinding: string;
    capabilityId: string;
    attemptId?: string;
}

export interface RepositoryAuthorizationValidator {
    validateCreate(input: {
        teamId: string;
        meetingId: string;
        authorization: CommandAuthorization;
    }): void;
    validateCommand(input: {
        snapshot: MeetingSnapshot;
        command: Pick<RepositoryCommand<unknown>, "commandKind" | "authorization">;
    }): void;
}

export interface CreateMeetingInput {
    requestId: string;
    authorization: CommandAuthorization;
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
    kind: OutboxKind;
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
    now?: number;
}

export interface OutboxCompletionResult {
    id: string;
    status: OutboxCompletion["status"];
}

export interface RecoverInput {
    now?: number;
}

export interface RecoveryResult {
    snapshot?: MeetingSnapshot;
    bootstrap: MeetingBootstrap;
    sessionOwnership: SessionOwnership[];
    reclaimedOutbox: number;
    pendingOutbox: number;
}

export interface MeetingBootstrap {
    status: "creating" | "ready" | "creation_failed";
    createRequestId: string;
    requestHash: string;
    createResult?: CreateMeetingResult;
    createdAt: number;
    updatedAt: number;
    failureCode?: string;
}

export interface SessionOwnership {
    sessionId: string;
    parentSessionId: string;
    sessionLabel: string;
    provider: string;
    initialMessageId?: string;
    role: "manager" | "participant";
    participantId?: string;
    lifecycleStatus: "provisioning" | "active" | "closed";
    capabilityStatus: "active" | "revoked";
    createdAt: number;
    updatedAt: number;
}

export interface SessionOwnershipInput {
    sessionId: string;
    parentSessionId: string;
    sessionLabel: string;
    provider: string;
    initialMessageId?: string;
    role: "manager" | "participant";
    participantId?: string;
    lifecycleStatus: SessionOwnership["lifecycleStatus"];
    capabilityStatus: SessionOwnership["capabilityStatus"];
}

export interface UpdateBootstrapInput {
    status: "creation_failed";
    failureCode?: string;
    now?: number;
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

interface BootstrapRow {
    status: MeetingBootstrap["status"];
    create_request_id: string | null;
    request_hash: string | null;
    result_json: string | null;
    created_at: number;
    updated_at: number;
    failure_code: string | null;
}

interface SessionOwnershipRow {
    session_id: string;
    meeting_id: string;
    parent_session_id: string;
    session_label: string;
    provider: string;
    initial_message_id: string | null;
    role: SessionOwnership["role"];
    participant_id: string | null;
    lifecycle_status: SessionOwnership["lifecycleStatus"];
    capability_status: SessionOwnership["capabilityStatus"];
    created_at: number;
    updated_at: number;
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

function toBootstrap(row: BootstrapRow): MeetingBootstrap {
    if (!row.create_request_id || !row.request_hash) {
        throw new Error("Bootstrap correlation is missing");
    }
    return {
        status: row.status,
        createRequestId: row.create_request_id,
        requestHash: row.request_hash,
        ...(row.result_json
            ? { createResult: JSON.parse(row.result_json) as CreateMeetingResult }
            : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(row.failure_code ? { failureCode: row.failure_code } : {})
    };
}

function toSessionOwnership(row: SessionOwnershipRow): SessionOwnership {
    return {
        sessionId: row.session_id,
        parentSessionId: row.parent_session_id,
        sessionLabel: row.session_label,
        provider: row.provider,
        ...(row.initial_message_id ? { initialMessageId: row.initial_message_id } : {}),
        role: row.role,
        ...(row.participant_id ? { participantId: row.participant_id } : {}),
        lifecycleStatus: row.lifecycle_status,
        capabilityStatus: row.capability_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function sqliteError(error: unknown, meetingId: string): RepositoryError {
    const message = error instanceof Error ? error.message : String(error);
    if (/busy|locked/i.test(message)) {
        return new RepositoryError("SQLITE_BUSY", true, meetingId, "SQLite is busy");
    }
    if (
        /UNIQUE constraint failed|CHECK constraint failed|FOREIGN KEY constraint failed/i.test(
            message
        )
    ) {
        return new RepositoryError(
            "CONSTRAINT_VIOLATION",
            false,
            meetingId,
            "SQLite constraint rejected the operation"
        );
    }
    if (/cannot be bound|NOT NULL constraint failed|datatype mismatch/i.test(message)) {
        return new RepositoryError(
            "INVALID_INPUT",
            false,
            meetingId,
            "Repository input is invalid"
        );
    }
    return new RepositoryError("CORRUPT_DATABASE", false, meetingId, "SQLite operation failed");
}

function row<T>(value: unknown): T | undefined {
    return value as T | undefined;
}

function parseSessionLabel(label: string): { teamId: string; meetingId: string } | undefined {
    const parts = label.split(":");
    if (parts[0] !== "convivium") return undefined;
    if (parts[1] === "meeting-manager" && parts.length === 4 && parts[2] && parts[3]) {
        return { teamId: parts[2], meetingId: parts[3] };
    }
    if (
        parts[1] === "meeting-participant" &&
        parts.length === 5 &&
        parts[2] &&
        parts[3] &&
        parts[4]
    ) {
        return { teamId: parts[2], meetingId: parts[3] };
    }
    return undefined;
}

function databaseVersion(db: DatabaseSync): number {
    return Number(
        (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version
    );
}

function validateDatabaseIdentity(
    db: DatabaseSync,
    teamId: string,
    meetingId: string,
    schemaVersion: number
): void {
    const meetings = db
        .prepare("SELECT team_id, meeting_id FROM meetings")
        .all() as unknown as Array<{ team_id: string; meeting_id: string }>;
    const hasMeeting = meetings.length > 0;
    let identityMatches =
        !hasMeeting ||
        (meetings.length === 1 &&
            meetings[0]?.team_id === teamId &&
            meetings[0]?.meeting_id === meetingId);
    if (schemaVersion >= 2) {
        const bootstrap = db
            .prepare("SELECT meeting_id FROM meeting_bootstrap")
            .all() as unknown as Array<{ meeting_id: string }>;
        const ownership = db
            .prepare("SELECT meeting_id, session_label FROM session_ownership")
            .all() as unknown as Array<{ meeting_id: string; session_label: string }>;
        identityMatches =
            identityMatches &&
            bootstrap.length <= 1 &&
            (!hasMeeting || bootstrap.length === 1) &&
            (bootstrap.length === 0 || bootstrap[0]?.meeting_id === meetingId) &&
            ownership.every((session) => {
                const label = parseSessionLabel(session.session_label);
                return (
                    session.meeting_id === meetingId &&
                    label?.teamId === teamId &&
                    label.meetingId === meetingId
                );
            });
    }
    if (!identityMatches) {
        throw new RepositoryError(
            "CORRUPT_DATABASE",
            false,
            meetingId,
            "Database identity does not match the requested meeting"
        );
    }
}

function validateDatabaseIdentityBeforeMigration(
    db: DatabaseSync,
    teamId: string,
    meetingId: string
): void {
    const version = databaseVersion(db);
    if (version >= 1 && version <= CURRENT_SCHEMA_VERSION) {
        validateDatabaseIdentity(db, teamId, meetingId, version);
    }
}

function assertOutboxKind(kind: string, meetingId: string): asserts kind is OutboxKind {
    if (!(OUTBOX_KINDS as readonly string[]).includes(kind)) {
        throw new RepositoryError(
            "INVALID_INPUT",
            false,
            meetingId,
            "Outbox kind is not registered"
        );
    }
}

function isLifecycleTransitionAllowed(
    from: SessionOwnership["lifecycleStatus"],
    to: SessionOwnership["lifecycleStatus"]
): boolean {
    return (
        from === to ||
        (from === "provisioning" && (to === "active" || to === "closed")) ||
        (from === "active" && to === "closed")
    );
}

function isCapabilityTransitionAllowed(
    from: SessionOwnership["capabilityStatus"],
    to: SessionOwnership["capabilityStatus"]
): boolean {
    return from === to || (from === "active" && to === "revoked");
}

export class MeetingRepository {
    private closed = false;

    private constructor(
        private readonly db: DatabaseSync,
        private readonly authorizationValidator: RepositoryAuthorizationValidator,
        readonly teamId: string,
        readonly meetingId: string
    ) {}

    static async open(input: {
        databasePath: string;
        teamId: string;
        meetingId: string;
        authorizationValidator: RepositoryAuthorizationValidator;
    }): Promise<MeetingRepository> {
        await mkdir(dirname(input.databasePath), { recursive: true });
        const db = new DatabaseSync(input.databasePath);
        try {
            validateDatabaseIdentityBeforeMigration(db, input.teamId, input.meetingId);
            db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2500;");
            migrate(db, input.meetingId);
            validateDatabaseIdentity(db, input.teamId, input.meetingId, CURRENT_SCHEMA_VERSION);
            db.exec("PRAGMA journal_mode = WAL;");
            return new MeetingRepository(
                db,
                input.authorizationValidator,
                input.teamId,
                input.meetingId
            );
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
        try {
            return toSnapshot(meeting);
        } catch (error) {
            throw sqliteError(error, this.meetingId);
        }
    }

    private getBootstrap(): MeetingBootstrap {
        const bootstrap = row<BootstrapRow>(
            this.db
                .prepare("SELECT * FROM meeting_bootstrap WHERE meeting_id = ?")
                .get(this.meetingId)
        );
        if (!bootstrap) {
            throw new RepositoryError(
                "CORRUPT_DATABASE",
                false,
                this.meetingId,
                "Meeting bootstrap record does not exist"
            );
        }
        return toBootstrap(bootstrap);
    }

    private listSessionOwnership(): SessionOwnership[] {
        return (
            this.db
                .prepare(
                    "SELECT * FROM session_ownership WHERE meeting_id = ? ORDER BY created_at, session_id"
                )
                .all(this.meetingId) as unknown as SessionOwnershipRow[]
        ).map(toSessionOwnership);
    }

    async create(input: CreateMeetingInput): Promise<MeetingBootstrap> {
        this.ensureOpen();
        const now = input.createdAt ?? Date.now();
        try {
            this.db.exec("BEGIN IMMEDIATE");
            this.authorizationValidator.validateCreate({
                teamId: this.teamId,
                meetingId: this.meetingId,
                authorization: input.authorization
            });
            validateDatabaseIdentity(this.db, this.teamId, this.meetingId, CURRENT_SCHEMA_VERSION);
            const existing = row<BootstrapRow>(
                this.db
                    .prepare("SELECT * FROM meeting_bootstrap WHERE meeting_id = ?")
                    .get(this.meetingId)
            );
            if (existing) {
                if (
                    existing.create_request_id !== input.requestId ||
                    existing.request_hash !== input.requestHash
                ) {
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                }
                this.db.exec("COMMIT");
                return toBootstrap(existing);
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
                    "INSERT INTO meeting_bootstrap(meeting_id, status, create_request_id, request_hash, created_at, updated_at) VALUES (?, 'creating', ?, ?, ?, ?)"
                )
                .run(this.meetingId, input.requestId, input.requestHash, now, now);
            const bootstrap = this.getBootstrap();
            this.db.exec("COMMIT");
            return bootstrap;
        } catch (error) {
            this.rollback();
            if (error instanceof RepositoryError) throw error;
            throw sqliteError(error, this.meetingId);
        }
    }

    async completeCreate(input: CreateMeetingInput): Promise<CommittedResult<CreateMeetingResult>> {
        this.ensureOpen();
        const now = input.createdAt ?? Date.now();
        try {
            this.db.exec("BEGIN IMMEDIATE");
            this.authorizationValidator.validateCreate({
                teamId: this.teamId,
                meetingId: this.meetingId,
                authorization: input.authorization
            });
            const bootstrap = this.getBootstrap();
            if (
                bootstrap.createRequestId !== input.requestId ||
                bootstrap.requestHash !== input.requestHash
            ) {
                throw new RepositoryError(
                    "IDEMPOTENCY_CONFLICT",
                    false,
                    this.meetingId,
                    "Request hash conflicts with bootstrap"
                );
            }
            const existing = row<ReceiptRow>(
                this.db
                    .prepare(
                        "SELECT * FROM idempotency_receipts WHERE request_id = ? AND command_kind = ? AND caller_binding = ?"
                    )
                    .get(input.requestId, "create_meeting", input.authorization.callerBinding)
            );
            if (existing) {
                this.db.exec("COMMIT");
                return this.receiptResult(existing);
            }
            if (bootstrap.status !== "creating") {
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Meeting bootstrap cannot be completed"
                );
            }
            const result = {
                meetingId: this.meetingId,
                meetingVersion: 0
            } satisfies CreateMeetingResult;
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
            this.insertReceipt(
                input.requestId,
                "create_meeting",
                input.authorization.callerBinding,
                input.requestHash,
                result,
                [eventSeq],
                now
            );
            this.db
                .prepare(
                    "UPDATE meeting_bootstrap SET status = 'ready', result_json = ?, updated_at = ?, failure_code = NULL WHERE meeting_id = ?"
                )
                .run(json(result), now, this.meetingId);
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
        try {
            return this.getMeeting();
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            throw sqliteError(error, this.meetingId);
        }
    }

    async updateBootstrap(input: UpdateBootstrapInput): Promise<MeetingBootstrap> {
        this.ensureOpen();
        const now = input.now ?? Date.now();
        try {
            this.db.exec("BEGIN IMMEDIATE");
            const bootstrap = this.getBootstrap();
            if (input.status !== "creation_failed" || bootstrap.status !== "creating") {
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Only an in-progress bootstrap can be marked as creation failed"
                );
            }
            this.db
                .prepare(
                    "UPDATE meeting_bootstrap SET status = ?, updated_at = ?, failure_code = ? WHERE meeting_id = ?"
                )
                .run(input.status, now, input.failureCode ?? null, this.meetingId);
            const updatedBootstrap = this.getBootstrap();
            this.db.exec("COMMIT");
            return updatedBootstrap;
        } catch (error) {
            this.rollback();
            if (error instanceof RepositoryError) throw error;
            throw sqliteError(error, this.meetingId);
        }
    }

    async recordSessionOwnership(
        input: SessionOwnershipInput,
        now = Date.now()
    ): Promise<SessionOwnership> {
        this.ensureOpen();
        try {
            this.db.exec("BEGIN IMMEDIATE");
            this.getBootstrap();
            const label = parseSessionLabel(input.sessionLabel);
            if (
                !input.parentSessionId ||
                !input.provider ||
                label?.teamId !== this.teamId ||
                label.meetingId !== this.meetingId
            ) {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Session label does not match the repository identity"
                );
            }
            const existing = row<SessionOwnershipRow>(
                this.db
                    .prepare("SELECT * FROM session_ownership WHERE session_id = ?")
                    .get(input.sessionId)
            );
            if (
                existing &&
                (existing.meeting_id !== this.meetingId ||
                    !isLifecycleTransitionAllowed(
                        existing.lifecycle_status,
                        input.lifecycleStatus
                    ) ||
                    !isCapabilityTransitionAllowed(
                        existing.capability_status,
                        input.capabilityStatus
                    ) ||
                    existing.session_label !== input.sessionLabel ||
                    existing.parent_session_id !== input.parentSessionId ||
                    existing.provider !== input.provider ||
                    existing.role !== input.role ||
                    existing.participant_id !== (input.participantId ?? null) ||
                    (existing.initial_message_id !== null &&
                        input.initialMessageId !== undefined &&
                        existing.initial_message_id !== input.initialMessageId))
            ) {
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Session ownership identity, initial message, lifecycle or capability cannot move backward"
                );
            }
            if (
                input.lifecycleStatus === "active" &&
                !input.initialMessageId &&
                !existing?.initial_message_id
            ) {
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "An active session ownership requires its initial message id"
                );
            }
            this.db
                .prepare(
                    "INSERT INTO session_ownership(session_id, meeting_id, parent_session_id, session_label, provider, initial_message_id, role, participant_id, lifecycle_status, capability_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET initial_message_id = COALESCE(session_ownership.initial_message_id, excluded.initial_message_id), lifecycle_status = excluded.lifecycle_status, capability_status = excluded.capability_status, updated_at = excluded.updated_at"
                )
                .run(
                    input.sessionId,
                    this.meetingId,
                    input.parentSessionId,
                    input.sessionLabel,
                    input.provider,
                    input.initialMessageId ?? null,
                    input.role,
                    input.participantId ?? null,
                    input.lifecycleStatus,
                    input.capabilityStatus,
                    now,
                    now
                );
            const record = row<SessionOwnershipRow>(
                this.db
                    .prepare("SELECT * FROM session_ownership WHERE session_id = ?")
                    .get(input.sessionId)
            );
            this.db.exec("COMMIT");
            if (!record)
                throw new RepositoryError(
                    "CORRUPT_DATABASE",
                    false,
                    this.meetingId,
                    "Session ownership was not persisted"
                );
            return toSessionOwnership(record);
        } catch (error) {
            this.rollback();
            if (error instanceof RepositoryError) throw error;
            throw sqliteError(error, this.meetingId);
        }
    }

    async execute<T>(command: RepositoryCommand<T>): Promise<CommittedResult<T>> {
        this.ensureOpen();
        const now = Date.now();
        try {
            this.db.exec("BEGIN IMMEDIATE");
            const snapshot = this.getMeeting();
            this.authorizationValidator.validateCommand({
                snapshot,
                command: {
                    commandKind: command.commandKind,
                    authorization: command.authorization
                }
            });
            const existing = row<ReceiptRow>(
                this.db
                    .prepare(
                        "SELECT * FROM idempotency_receipts WHERE request_id = ? AND command_kind = ? AND caller_binding = ?"
                    )
                    .get(
                        command.requestId,
                        command.commandKind,
                        command.authorization.callerBinding
                    )
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
            if (snapshot.version !== command.expectedMeetingVersion) {
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            }
            const transition = command.transition(snapshot);
            if (transition.events.length === 0) {
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "State transitions must emit at least one domain event"
                );
            }
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
                command.authorization.callerBinding,
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
                assertOutboxKind(item.kind, this.meetingId);
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
        const now = input.now ?? Date.now();
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
                current.lease_token !== input.leaseToken ||
                current.lease_deadline === null ||
                current.lease_deadline <= now
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
            const bootstrap = this.getBootstrap();
            const snapshot = bootstrap.status === "ready" ? this.getMeeting() : undefined;
            const sessionOwnership = this.listSessionOwnership();
            this.db.exec("COMMIT");
            return {
                ...(snapshot ? { snapshot } : {}),
                bootstrap,
                sessionOwnership,
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
        assertOutboxKind(item.kind, this.meetingId);
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
export { RepositoryError, type RepositoryErrorCode } from "./errors.js";
