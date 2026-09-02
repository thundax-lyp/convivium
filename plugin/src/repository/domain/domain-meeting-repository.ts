import type { CatalogDomain, MeetingDomain } from "./specs.js";
import type { MeetingRepositoryPort } from "../meeting-repository-port.js";
import {
    CatalogMeetingRecordV1Schema,
    CreationRecordV1Schema,
    type PersistenceProjectionV1,
    PersistedEventV1Schema,
    PersistedOutboxV1Schema,
    PersistedReceiptV1Schema,
    PersistenceProjectionV1Schema,
    JsonObjectSchema
} from "./schemas.js";
import type {
    CancelPrivateMeetingMailInput,
    ClaimOutboxInput,
    CommittedResult,
    CompleteOutboxInput,
    CreateMeetingInput,
    CreateMeetingResult,
    JsonObject,
    MeetingBootstrap,
    MeetingSnapshot,
    OutboxCompletionResult,
    OutboxItem,
    PrivateMeetingMail,
    RecoverInput,
    RecoveryResult,
    RepositoryAuthorizationValidator,
    RepositoryCommand,
    RenewOutboxLeaseInput,
    SendPrivateMeetingMailInput,
    SessionOwnership,
    SessionOwnershipInput,
    StartPrivateMeetingMailInput,
    FinishPrivateMeetingMailInput,
    UpdateBootstrapInput,
    UpdateCreateResultInput
} from "../types.js";
import {
    createProjection,
    createCommitRecord,
    decodeProjection,
    encodeProjection,
    projectionDigest
} from "./projection.js";
import { diff } from "./json-patch.js";
import { catalogKey, receiptKey, seqKey } from "./keys.js";
import { loadProjection } from "./projection.js";
import { decodeCanonicalJson, encodeCanonicalJson, type JsonValue } from "./canonical-json.js";
import { RepositoryError } from "../errors.js";
import {
    APPLICATION_CHECKPOINT_TRIGGER_BYTES,
    APPLICATION_CHECKPOINT_TRIGGER_COMMITS,
    APPLICATION_TAIL_HARD_BYTES,
    APPLICATION_TAIL_HARD_COMMITS
} from "./projection.js";
import { writeCheckpoint } from "./checkpoint.js";

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

function parseSessionLabel(
    label: string
): { teamId: string; meetingId: string; participantId?: string } | undefined {
    const parts = label.split(":");
    if (parts[0] !== "convivium") return undefined;
    if (parts[1] === "meeting-manager" && parts.length === 4 && parts[2] && parts[3])
        return { teamId: parts[2], meetingId: parts[3] };
    if (
        parts[1] === "meeting-participant" &&
        parts.length === 5 &&
        parts[2] &&
        parts[3] &&
        parts[4]
    )
        return { teamId: parts[2], meetingId: parts[3], participantId: parts[4] };
    return undefined;
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

export interface DomainMeetingRepositoryOpenOptions {
    readonly catalogDomain: CatalogDomain;
    readonly meetingDomain: MeetingDomain;
    readonly teamId: string;
    readonly meetingId: string;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly now?: () => number;
}

export class DomainMeetingRepository implements MeetingRepositoryPort {
    readonly teamId: string;
    readonly meetingId: string;
    private readonly catalogDomain: CatalogDomain;
    private readonly meetingDomain: MeetingDomain;
    private readonly authorizationValidator: RepositoryAuthorizationValidator;
    private readonly now: () => number;
    private closed = false;
    private domainClosed = false;
    private mutationChain: Promise<void> = Promise.resolve();
    private projection: PersistenceProjectionV1 | undefined;
    private headSeq = 0;
    private headDigest: string | null = null;
    private maintenanceRequested = false;
    private maintenanceError: unknown;
    private closePromise: Promise<void> | undefined;

    private constructor(options: DomainMeetingRepositoryOpenOptions) {
        this.catalogDomain = options.catalogDomain;
        this.meetingDomain = options.meetingDomain;
        this.teamId = options.teamId;
        this.meetingId = options.meetingId;
        this.authorizationValidator = options.authorizationValidator;
        this.now = options.now ?? Date.now;
    }

    static async open(
        options: DomainMeetingRepositoryOpenOptions
    ): Promise<DomainMeetingRepository> {
        const repository = new DomainMeetingRepository(options);
        const creation = options.meetingDomain.table("creation").get("current");
        if (creation?.status === "ready") {
            try {
                repository.projection = loadProjection({ domain: options.meetingDomain });
                const pointer = options.meetingDomain.table("checkpoint_pointer").get("current");
                const tail = [...options.meetingDomain.table("commits").entries()]
                    .filter(([, record]) => record.seq > (pointer?.baseSeq ?? 0))
                    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
                const last = tail.at(-1)?.[1];
                repository.headSeq = last?.seq ?? pointer?.baseSeq ?? 0;
                repository.headDigest =
                    last?.digest ?? (pointer ? projectionDigest(repository.projection) : null);
            } catch {
                throw new RepositoryError(
                    "CORRUPT_DATABASE",
                    false,
                    options.meetingId,
                    "Meeting projection is corrupt"
                );
            }
        }
        return repository;
    }

    private ensureOpen(): void {
        if (this.closed)
            throw new RepositoryError("CLOSED", false, this.meetingId, "Repository is closed");
    }

    private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
        this.ensureOpen();
        const committed = this.mutationChain.then(operation);
        const maintenance = committed.then(
            () => this.runMaintenance(),
            () => undefined
        );
        this.mutationChain = maintenance.then(
            () => undefined,
            () => undefined
        );
        return committed;
    }

    private async runMaintenance(): Promise<void> {
        if (!this.maintenanceRequested || !this.projection) return;
        this.maintenanceRequested = false;
        const projection = this.projection;
        const baseSeq = this.headSeq;
        try {
            await writeCheckpoint({
                domain: this.meetingDomain,
                projection,
                baseSeq,
                createdAt: this.now()
            });
            this.headDigest = projectionDigest(projection);
            this.maintenanceError = undefined;
        } catch (error) {
            this.maintenanceError = error;
        }
    }

    private async commit<T>(_input: {
        operation: string;
        now: number;
        mutate(current: PersistenceProjectionV1): { next: PersistenceProjectionV1; result: T };
    }): Promise<T> {
        this.ensureOpen();
        if (!this.projection)
            throw new RepositoryError(
                "INVALID_STATE",
                false,
                this.meetingId,
                "Meeting is not ready"
            );
        const current = decodeProjection(encodeProjection(this.projection));
        const previousJson = decodeCanonicalJson(encodeCanonicalJson(current));
        const changed = _input.mutate(current);
        const nextProjection = PersistenceProjectionV1Schema.parse(changed.next);
        const nextJson = decodeCanonicalJson(encodeCanonicalJson(nextProjection));
        const patch = diff(previousJson, nextJson).map((operation) => {
            if (operation.op === "splice")
                return { ...operation, path: [...operation.path], items: [...operation.items] };
            return { ...operation, path: [...operation.path] };
        });
        if (patch.length === 0) return changed.result;
        const seq = this.headSeq + 1;
        let record = createCommitRecord({
            formatVersion: 1,
            seq,
            previousSeq: this.headSeq,
            previousDigest: this.headDigest,
            operation: _input.operation,
            patch,
            committedAt: _input.now
        });
        let pointerBase =
            this.meetingDomain.table("checkpoint_pointer").get("current")?.baseSeq ?? 0;
        let tail = [...this.meetingDomain.table("commits").entries()].filter(
            ([, item]) => item.seq > pointerBase
        );
        let tailBytes =
            tail.reduce((total, [, item]) => total + encodeCanonicalJson(item).byteLength, 0) +
            encodeCanonicalJson(record).byteLength;
        if (
            tail.length + 1 > APPLICATION_TAIL_HARD_COMMITS ||
            tailBytes > APPLICATION_TAIL_HARD_BYTES
        ) {
            try {
                await writeCheckpoint({
                    domain: this.meetingDomain,
                    projection: this.projection,
                    baseSeq: this.headSeq,
                    createdAt: _input.now
                });
                this.headDigest = projectionDigest(this.projection);
                this.maintenanceRequested = false;
                this.maintenanceError = undefined;
                record = createCommitRecord({
                    formatVersion: 1,
                    seq,
                    previousSeq: this.headSeq,
                    previousDigest: this.headDigest,
                    operation: _input.operation,
                    patch,
                    committedAt: _input.now
                });
                pointerBase =
                    this.meetingDomain.table("checkpoint_pointer").get("current")?.baseSeq ?? 0;
                tail = [...this.meetingDomain.table("commits").entries()].filter(
                    ([, item]) => item.seq > pointerBase
                );
                tailBytes =
                    tail.reduce(
                        (total, [, item]) => total + encodeCanonicalJson(item).byteLength,
                        0
                    ) + encodeCanonicalJson(record).byteLength;
            } catch (error) {
                this.maintenanceError = error;
            }
            if (
                tail.length + 1 > APPLICATION_TAIL_HARD_COMMITS ||
                tailBytes > APPLICATION_TAIL_HARD_BYTES
            )
                throw new RepositoryError(
                    "CONSTRAINT_VIOLATION",
                    false,
                    this.meetingId,
                    "Application commit tail is too large"
                );
        }
        await this.meetingDomain.table("commits").put(seqKey(seq), record);
        this.projection = nextProjection;
        this.headSeq = seq;
        this.headDigest = record.digest;
        const nextTailCount = tail.length + 1;
        if (
            nextTailCount >= APPLICATION_CHECKPOINT_TRIGGER_COMMITS ||
            tailBytes >= APPLICATION_CHECKPOINT_TRIGGER_BYTES
        )
            this.maintenanceRequested = true;
        return changed.result;
    }

    async create(input: CreateMeetingInput): Promise<MeetingBootstrap> {
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            this.authorizationValidator.validateCreate({
                teamId: this.teamId,
                meetingId: this.meetingId,
                authorization: input.authorization
            });
            const table = this.meetingDomain.table("creation");
            const existing = table.get("current");
            if (existing) {
                if (
                    existing.requestId !== input.requestId ||
                    existing.requestHash !== input.requestHash
                )
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with bootstrap"
                    );
                return {
                    status: existing.status,
                    createRequestId: existing.requestId,
                    requestHash: existing.requestHash,
                    ...(existing.createResult === null
                        ? {}
                        : { createResult: existing.createResult }),
                    createdAt: existing.createdAt,
                    updatedAt: existing.updatedAt,
                    ...(existing.failureCode === null ? {} : { failureCode: existing.failureCode })
                };
            }
            const now = input.createdAt ?? this.now();
            const initialOutbox = (input.outbox ?? []).map((item) => {
                if (item.kind !== "dispatch")
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.meetingId,
                        "Outbox kind is not registered"
                    );
                return {
                    formatVersion: 1 as const,
                    id: item.id ?? crypto.randomUUID(),
                    deliveryId: item.deliveryId,
                    kind: "dispatch" as const,
                    priority: item.priority ?? 50,
                    payload: item.payload,
                    availableAt: item.availableAt ?? now,
                    createdAt: now
                };
            });
            const creation = CreationRecordV1Schema.parse({
                formatVersion: 1,
                teamId: this.teamId,
                meetingId: this.meetingId,
                status: "creating",
                requestId: input.requestId,
                requestHash: input.requestHash,
                authorization: input.authorization,
                initialState: input.initialState,
                createResult: null,
                initialOutbox,
                sessionOwnership: Object.create(null),
                createdAt: now,
                updatedAt: now,
                failureCode: null
            });
            const catalog = CatalogMeetingRecordV1Schema.parse({
                formatVersion: 1,
                teamId: this.teamId,
                meetingId: this.meetingId,
                domainName: this.meetingDomain.name,
                status: "creating",
                createRequestId: input.requestId,
                requestHash: input.requestHash,
                createdAt: now,
                updatedAt: now,
                failureCode: null
            });
            await this.catalogDomain
                .table("meetings")
                .put(catalogKey(this.teamId, this.meetingId), catalog);
            await table.put("current", creation);
            return {
                status: creation.status,
                createRequestId: creation.requestId,
                requestHash: creation.requestHash,
                ...(creation.createResult === null ? {} : { createResult: creation.createResult }),
                createdAt: creation.createdAt,
                updatedAt: creation.updatedAt,
                ...(creation.failureCode === null ? {} : { failureCode: creation.failureCode })
            };
        });
    }
    async completeCreate(input: CreateMeetingInput): Promise<CommittedResult<CreateMeetingResult>> {
        return this.enqueueMutation(async () => {
            this.ensureOpen();
            this.authorizationValidator.validateCreate({
                teamId: this.teamId,
                meetingId: this.meetingId,
                authorization: input.authorization
            });
            const creation = this.meetingDomain.table("creation").get("current");
            if (
                !creation ||
                creation.requestId !== input.requestId ||
                creation.requestHash !== input.requestHash
            )
                throw new RepositoryError(
                    "IDEMPOTENCY_CONFLICT",
                    false,
                    this.meetingId,
                    "Request hash conflicts with bootstrap"
                );
            const createReceiptKey = receiptKey(
                input.requestId,
                "create_meeting",
                input.authorization.callerBinding
            );
            const result = input.createResult ?? { meetingId: this.meetingId, meetingVersion: 0 };
            const existingReceipt = this.projection?.receipts[createReceiptKey];
            if (existingReceipt) {
                const replayResult = this.projection?.bootstrap.createResult;
                if (!replayResult)
                    throw new RepositoryError(
                        "CORRUPT_DATABASE",
                        false,
                        this.meetingId,
                        "Create result is missing"
                    );
                return {
                    requestId: input.requestId,
                    meetingId: this.meetingId,
                    meetingVersion: existingReceipt.meetingVersion,
                    result: replayResult,
                    eventSeqs: [...existingReceipt.eventSeqs]
                };
            }
            if (creation.status !== "creating")
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Meeting bootstrap cannot be completed"
                );
            const now = input.createdAt ?? this.now();
            const next = createProjection({
                snapshot: {
                    teamId: this.teamId,
                    meetingId: this.meetingId,
                    version: 0,
                    state: creation.initialState,
                    createdAt: now,
                    updatedAt: now
                },
                bootstrap: {
                    status: "ready",
                    createRequestId: creation.requestId,
                    requestHash: creation.requestHash,
                    createResult: result,
                    createdAt: creation.createdAt,
                    updatedAt: now
                },
                sessionOwnership: creation.sessionOwnership
            });
            next.events[seqKey(1)] = PersistedEventV1Schema.parse({
                formatVersion: 1,
                eventSeq: 1,
                meetingVersion: 0,
                type: "meeting.created",
                payload: { meetingId: this.meetingId },
                turnId: null,
                attemptId: null,
                createdAt: now
            });
            next.receipts[createReceiptKey] = PersistedReceiptV1Schema.parse({
                formatVersion: 1,
                requestId: input.requestId,
                commandKind: "create_meeting",
                callerBinding: input.authorization.callerBinding,
                requestHash: input.requestHash,
                meetingVersion: 0,
                result,
                eventSeqs: [1],
                createdAt: now
            });
            for (const item of creation.initialOutbox)
                next.outbox[item.id] = PersistedOutboxV1Schema.parse({
                    ...item,
                    status: "pending",
                    attempts: 0,
                    leaseOwner: null,
                    leaseToken: null,
                    leaseDeadline: null,
                    deliveredAt: null,
                    failedAt: null,
                    lastError: null
                });
            next.nextEventSeq = 2;
            const record = createCommitRecord({
                formatVersion: 1,
                seq: 1,
                previousSeq: 0,
                previousDigest: null,
                operation: "create.complete",
                patch: [
                    { op: "set", path: [], value: decodeCanonicalJson(encodeCanonicalJson(next)) }
                ],
                committedAt: now
            });
            await this.meetingDomain.table("commits").put(seqKey(1), record);
            this.projection = next;
            this.headSeq = 1;
            this.headDigest = record.digest;
            await this.meetingDomain.table("creation").put("current", {
                ...creation,
                status: "ready",
                createResult: result,
                updatedAt: now
            });
            await this.catalogDomain
                .table("meetings")
                .update(catalogKey(this.teamId, this.meetingId), (catalog) => ({
                    ...catalog,
                    status: "ready",
                    updatedAt: now
                }));
            return {
                requestId: input.requestId,
                meetingId: this.meetingId,
                meetingVersion: 0,
                result,
                eventSeqs: [1]
            };
        });
    }
    async updateCreateResult(_input: UpdateCreateResultInput): Promise<CreateMeetingResult> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const creation = this.meetingDomain.table("creation").get("current");
            const snapshot = this.projection?.snapshot;
            if (!creation || !snapshot || creation.status !== "ready")
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Create result can only be updated for a ready meeting"
                );
            if (
                snapshot.version !== input.expectedMeetingVersion ||
                input.result.meetingId !== this.meetingId ||
                input.result.meetingVersion !== snapshot.version
            )
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Create result version does not match the current meeting"
                );
            const now = input.now ?? this.now();
            return this.commit({
                operation: "create.result",
                now,
                mutate: (current) => {
                    const key = receiptKey(
                        creation.requestId,
                        "create_meeting",
                        creation.authorization.callerBinding
                    );
                    const receipt = current.receipts[key];
                    if (!receipt)
                        throw new RepositoryError(
                            "CORRUPT_DATABASE",
                            false,
                            this.meetingId,
                            "Create receipt is missing"
                        );
                    const next = PersistenceProjectionV1Schema.parse({
                        ...current,
                        bootstrap: {
                            ...current.bootstrap,
                            createResult: input.result,
                            updatedAt: now
                        },
                        receipts: {
                            ...current.receipts,
                            [key]: {
                                ...receipt,
                                meetingVersion: snapshot.version,
                                result: input.result
                            }
                        }
                    });
                    return { next, result: input.result };
                }
            });
        });
    }
    async updateBootstrap(_input: UpdateBootstrapInput): Promise<MeetingBootstrap> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const creation = this.meetingDomain.table("creation").get("current");
            if (!creation || creation.status === "ready")
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Bootstrap cannot be updated"
                );
            const now = input.now ?? this.now();
            const next = {
                ...creation,
                status: "creation_failed" as const,
                failureCode: input.failureCode ?? null,
                updatedAt: now
            };
            await this.meetingDomain.table("creation").put("current", next);
            await this.catalogDomain
                .table("meetings")
                .update(catalogKey(this.teamId, this.meetingId), (catalog) => ({
                    ...catalog,
                    status: "creation_failed",
                    failureCode: input.failureCode ?? null,
                    updatedAt: now
                }));
            return {
                status: next.status,
                createRequestId: next.requestId,
                requestHash: next.requestHash,
                createdAt: next.createdAt,
                updatedAt: next.updatedAt,
                ...(next.failureCode === null ? {} : { failureCode: next.failureCode })
            };
        });
    }
    async recordSessionOwnership(
        _input: SessionOwnershipInput,
        _now?: number
    ): Promise<SessionOwnership> {
        const input = _input;
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
            const now = _now ?? this.now();
            const parsed = parseSessionLabel(input.sessionLabel);
            if (
                !input.parentSessionId ||
                !input.provider ||
                !parsed ||
                parsed.teamId !== this.teamId ||
                parsed.meetingId !== this.meetingId
            )
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Session label does not match the repository identity"
                );
            const existing =
                creation.status === "ready"
                    ? this.projection?.sessionOwnership[input.sessionId]
                    : creation.sessionOwnership[input.sessionId];
            if (
                existing &&
                (!isLifecycleTransitionAllowed(existing.lifecycleStatus, input.lifecycleStatus) ||
                    !isCapabilityTransitionAllowed(
                        existing.capabilityStatus,
                        input.capabilityStatus
                    ) ||
                    existing.sessionLabel !== input.sessionLabel ||
                    existing.parentSessionId !== input.parentSessionId ||
                    existing.provider !== input.provider ||
                    existing.role !== input.role ||
                    existing.participantId !== input.participantId ||
                    (existing.initialMessageId !== undefined &&
                        input.initialMessageId !== undefined &&
                        existing.initialMessageId !== input.initialMessageId))
            )
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Session ownership identity, initial message, lifecycle or capability cannot move backward"
                );
            if (
                !existing &&
                ((input.role === "manager" &&
                    (parsed.participantId !== undefined || input.participantId !== undefined)) ||
                    (input.role === "participant" &&
                        (parsed.participantId === undefined ||
                            parsed.participantId !== input.participantId)))
            )
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Session role does not match the repository identity"
                );
            if (
                input.lifecycleStatus === "active" &&
                !input.initialMessageId &&
                !existing?.initialMessageId
            )
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Active sessions must have an initial message"
                );
            const ownership = {
                ...input,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now
            };
            if (existing?.initialMessageId !== undefined)
                ownership.initialMessageId = existing.initialMessageId;
            if (creation.status !== "ready") {
                const next = {
                    ...creation,
                    sessionOwnership: {
                        ...creation.sessionOwnership,
                        [input.sessionId]: ownership
                    },
                    updatedAt: now
                };
                await this.meetingDomain.table("creation").put("current", next);
                return ownership;
            }
            const result = await this.commit({
                operation: "session.ownership",
                now,
                mutate: (current) => {
                    const next = PersistenceProjectionV1Schema.parse({
                        ...current,
                        sessionOwnership: {
                            ...current.sessionOwnership,
                            [input.sessionId]: ownership
                        }
                    });
                    return { next, result: ownership };
                }
            });
            return result;
        });
    }
    async read(): Promise<MeetingSnapshot> {
        this.ensureOpen();
        const snapshot = this.projection?.snapshot;
        if (!snapshot)
            throw new RepositoryError(
                "MEETING_NOT_FOUND",
                false,
                this.meetingId,
                "Meeting does not exist"
            );
        return decodeProjection(encodeProjection(this.projection!)).snapshot!;
    }
    async readPrivateMeetingMail(_mailId: string): Promise<PrivateMeetingMail | undefined> {
        this.ensureOpen();
        const mail = this.projection?.privateMail[_mailId];
        return mail === undefined ? undefined : structuredClone(mail);
    }
    async listOverduePrivateMeetingMail(_now: number): Promise<PrivateMeetingMail[]> {
        this.ensureOpen();
        return Object.values(this.projection?.privateMail ?? {})
            .filter(
                (mail) =>
                    mail.status === "processing" &&
                    mail.deadlineAt !== undefined &&
                    mail.deadlineAt <= _now
            )
            .sort(
                (a, b) =>
                    a.deadlineAt! - b.deadlineAt! ||
                    a.createdAt - b.createdAt ||
                    (a.mailId < b.mailId ? -1 : 1)
            )
            .map((mail) => structuredClone(mail));
    }
    async hasUnfinishedPrivateMeetingMail(): Promise<boolean> {
        this.ensureOpen();
        return Object.values(this.projection?.privateMail ?? {}).some(
            (mail) => mail.status === "pending" || mail.status === "processing"
        );
    }
    async sendPrivateMeetingMail(
        _input: SendPrivateMeetingMailInput
    ): Promise<CommittedResult<{ mailId: string; handlingAttemptId: string }>> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            if (!this.projection?.snapshot)
                throw new RepositoryError(
                    "MEETING_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Meeting does not exist"
                );
            const snapshot = structuredClone(this.projection.snapshot);
            this.authorizationValidator.validateCommand({
                snapshot,
                command: { commandKind: "send_meeting_message", authorization: input.authorization }
            });
            const key = receiptKey(
                input.requestId,
                "send_meeting_message",
                input.authorization.callerBinding
            );
            const existing = this.projection.receipts[key];
            if (existing) {
                if (existing.requestHash !== input.requestHash)
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                const replay = this.projection.privateMail[input.mail.mailId];
                if (!replay)
                    throw new RepositoryError(
                        "CORRUPT_DATABASE",
                        false,
                        this.meetingId,
                        "Mail receipt points to a missing mail"
                    );
                return {
                    requestId: input.requestId,
                    meetingId: this.meetingId,
                    meetingVersion: existing.meetingVersion,
                    result: {
                        mailId: replay.mailId,
                        handlingAttemptId: replay.handlingAttemptId
                    },
                    eventSeqs: [...existing.eventSeqs]
                };
            }
            if (!input.isNewDeliveryAvailable())
                throw new RepositoryError(
                    "UNSUPPORTED_CAPABILITY",
                    false,
                    this.meetingId,
                    "Meeting delivery is unavailable until the Captain Session is rebound"
                );
            if (snapshot.version !== input.expectedMeetingVersion)
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            const state = snapshot.state;
            const participants = state.participants;
            const transcript = state.transcript;
            const messageSeq = state.messageSeq;
            const context = input.mail.meetingContext;
            const contextFromSeq = context.contextFromSeq;
            const contextThroughSeq = context.contextThroughSeq;
            const relevantMessageIds = context.relevantMessageIds;
            const terminal = [
                "paused",
                "completed",
                "partial",
                "no_consensus",
                "cancelled",
                "failed",
                "archiving",
                "archived"
            ].includes(typeof state.status === "string" ? state.status : "");
            const hasParticipant = (participantId: string): boolean =>
                Array.isArray(participants) &&
                participants.some(
                    (participant) =>
                        typeof participant === "object" &&
                        participant !== null &&
                        !Array.isArray(participant) &&
                        participant.id === participantId
                );
            const recipientOwned = Object.values(this.projection.sessionOwnership).some(
                (ownership) =>
                    ownership.role === "participant" &&
                    ownership.participantId === input.mail.recipientParticipantId &&
                    ownership.lifecycleStatus === "active" &&
                    ownership.capabilityStatus === "active"
            );
            const contextValid =
                context.meetingId === this.meetingId &&
                typeof contextFromSeq === "number" &&
                Number.isSafeInteger(contextFromSeq) &&
                typeof contextThroughSeq === "number" &&
                Number.isSafeInteger(contextThroughSeq) &&
                contextFromSeq >= 0 &&
                contextFromSeq <= contextThroughSeq &&
                typeof messageSeq === "number" &&
                contextThroughSeq <= messageSeq &&
                input.mail.snapshotThroughSeq === contextThroughSeq;
            const messagesValid =
                contextValid &&
                Array.isArray(relevantMessageIds) &&
                relevantMessageIds.every(
                    (messageId) =>
                        typeof messageId === "string" &&
                        Array.isArray(transcript) &&
                        transcript.some(
                            (message) =>
                                typeof message === "object" &&
                                message !== null &&
                                !Array.isArray(message) &&
                                message.id === messageId &&
                                typeof message.seq === "number" &&
                                message.seq >= contextFromSeq &&
                                message.seq <= contextThroughSeq
                        )
                );
            const parent =
                input.mail.replyToMailId === undefined
                    ? undefined
                    : this.projection.privateMail[input.mail.replyToMailId];
            const replyValid =
                input.mail.replyToMailId === undefined ||
                (parent !== undefined &&
                    new Set([parent.senderParticipantId, parent.recipientParticipantId]).size ===
                        new Set([input.mail.senderParticipantId, input.mail.recipientParticipantId])
                            .size &&
                    [parent.senderParticipantId, parent.recipientParticipantId].every(
                        (participantId) =>
                            participantId === input.mail.senderParticipantId ||
                            participantId === input.mail.recipientParticipantId
                    ));
            if (
                terminal ||
                !hasParticipant(input.mail.senderParticipantId) ||
                !hasParticipant(input.mail.recipientParticipantId) ||
                !recipientOwned ||
                !messagesValid ||
                !replyValid ||
                input.mail.meetingId !== this.meetingId ||
                input.outbox.kind !== "dispatch" ||
                input.outbox.priority !== 0 ||
                input.outbox.payload.role !== "meeting_mail" ||
                input.outbox.payload.mailId !== input.mail.mailId ||
                input.outbox.payload.participantId !== input.mail.recipientParticipantId
            )
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Meeting mail participants, context, or delivery are invalid"
                );
            const now = input.mail.createdAt;
            return this.commit({
                operation: "mail.send",
                now,
                mutate: (projection) => {
                    const mail = { ...input.mail, status: "pending" as const, updatedAt: now };
                    projection.privateMail[mail.mailId] = mail;
                    const outboxId = input.outbox.id ?? crypto.randomUUID();
                    projection.outbox[outboxId] = {
                        formatVersion: 1,
                        id: outboxId,
                        deliveryId: input.outbox.deliveryId,
                        kind: "dispatch",
                        priority: input.outbox.priority ?? 50,
                        payload: input.outbox.payload,
                        status: "pending",
                        attempts: 0,
                        availableAt: input.outbox.availableAt ?? now,
                        leaseOwner: null,
                        leaseToken: null,
                        leaseDeadline: null,
                        deliveredAt: null,
                        failedAt: null,
                        lastError: null,
                        createdAt: now
                    };
                    const result = {
                        mailId: mail.mailId,
                        handlingAttemptId: mail.handlingAttemptId
                    };
                    projection.receipts[key] = {
                        formatVersion: 1,
                        requestId: input.requestId,
                        commandKind: "send_meeting_message",
                        callerBinding: input.authorization.callerBinding,
                        requestHash: input.requestHash,
                        meetingVersion: projection.snapshot!.version,
                        result,
                        eventSeqs: [],
                        createdAt: now
                    };
                    return {
                        next: projection,
                        result: {
                            requestId: input.requestId,
                            meetingId: this.meetingId,
                            meetingVersion: projection.snapshot!.version,
                            result,
                            eventSeqs: []
                        }
                    };
                }
            });
        });
    }
    async startPrivateMeetingMail(
        _input: StartPrivateMeetingMailInput
    ): Promise<PrivateMeetingMail> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const snapshot = this.projection?.snapshot;
            if (!snapshot)
                throw new RepositoryError(
                    "MEETING_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Meeting does not exist"
                );
            this.authorizationValidator.validateCommand({
                snapshot,
                command: {
                    commandKind: "start_meeting_message",
                    authorization: input.authorization
                }
            });
            const key = receiptKey(
                input.requestId,
                "start_meeting_message",
                input.authorization.callerBinding
            );
            const receipt = this.projection?.receipts[key];
            const mail = this.projection?.privateMail[input.mailId];
            if (receipt) {
                if (receipt.requestHash !== input.requestHash)
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                if (!mail)
                    throw new RepositoryError(
                        "CORRUPT_DATABASE",
                        false,
                        this.meetingId,
                        "Mail receipt points to a missing mail"
                    );
                return structuredClone(mail);
            }
            if (snapshot.version !== input.expectedMeetingVersion)
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            if (!mail)
                throw new RepositoryError(
                    "OUTBOX_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Private mail does not exist"
                );
            const now = input.now ?? this.now();
            const status = snapshot.state.status;
            if (
                mail.status !== "pending" ||
                status === "paused" ||
                [
                    "completed",
                    "partial",
                    "no_consensus",
                    "cancelled",
                    "failed",
                    "archiving",
                    "archived"
                ].includes(typeof status === "string" ? status : "")
            )
                throw new RepositoryError(
                    "INVALID_STATE",
                    status === "paused",
                    this.meetingId,
                    "Meeting mail is not dispatchable"
                );
            const messageSeq = snapshot.state.messageSeq;
            if (
                !Number.isSafeInteger(input.processingThroughSeq) ||
                input.processingThroughSeq < 0 ||
                typeof messageSeq !== "number" ||
                input.processingThroughSeq > messageSeq ||
                !Number.isFinite(input.deadlineAt) ||
                input.deadlineAt <= now
            )
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Meeting mail processing bounds are invalid"
                );
            return this.commit({
                operation: "mail.start",
                now,
                mutate: (projection) => {
                    const next = {
                        ...mail,
                        status: "processing" as const,
                        processingThroughSeq: input.processingThroughSeq,
                        deliveryId: input.deliveryId,
                        deadlineAt: input.deadlineAt,
                        updatedAt: now
                    };
                    projection.privateMail[input.mailId] = next;
                    projection.receipts[key] = {
                        formatVersion: 1,
                        requestId: input.requestId,
                        commandKind: "start_meeting_message",
                        callerBinding: input.authorization.callerBinding,
                        requestHash: input.requestHash,
                        meetingVersion: snapshot.version,
                        result: { mailId: input.mailId },
                        eventSeqs: [],
                        createdAt: now
                    };
                    return { next: projection, result: next };
                }
            });
        });
    }
    async finishPrivateMeetingMail(
        _input: FinishPrivateMeetingMailInput
    ): Promise<PrivateMeetingMail> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const snapshot = this.projection?.snapshot;
            if (!snapshot)
                throw new RepositoryError(
                    "MEETING_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Meeting does not exist"
                );
            const commandKind =
                input.status === "timed_out" ? "timeout_meeting_message" : "finish_meeting_message";
            this.authorizationValidator.validateCommand({
                snapshot,
                command: { commandKind, authorization: input.authorization }
            });
            const key = receiptKey(input.requestId, commandKind, input.authorization.callerBinding);
            const receipt = this.projection?.receipts[key];
            const mail = this.projection?.privateMail[input.mailId];
            if (receipt) {
                if (receipt.requestHash !== input.requestHash)
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                if (!mail)
                    throw new RepositoryError(
                        "CORRUPT_DATABASE",
                        false,
                        this.meetingId,
                        "Mail receipt points to a missing mail"
                    );
                return structuredClone(mail);
            }
            if (snapshot.version !== input.expectedMeetingVersion)
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            if (
                !mail ||
                mail.status !== "processing" ||
                mail.handlingAttemptId !== input.handlingAttemptId ||
                mail.deliveryId !== input.deliveryId
            )
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Mail handling is stale or terminal"
                );
            const now = input.now ?? this.now();
            return this.commit({
                operation: "mail.finish",
                now,
                mutate: (projection) => {
                    const next = {
                        ...mail,
                        status: input.status,
                        deliveryId: input.deliveryId,
                        updatedAt: now
                    };
                    projection.privateMail[input.mailId] = next;
                    projection.receipts[key] = {
                        formatVersion: 1,
                        requestId: input.requestId,
                        commandKind,
                        callerBinding: input.authorization.callerBinding,
                        requestHash: input.requestHash,
                        meetingVersion: snapshot.version,
                        result: { mailId: input.mailId, status: input.status },
                        eventSeqs: [],
                        createdAt: now
                    };
                    return { next: projection, result: next };
                }
            });
        });
    }
    async cancelUnfinishedPrivateMeetingMail(
        _input: CancelPrivateMeetingMailInput
    ): Promise<number> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const snapshot = this.projection?.snapshot;
            if (!snapshot)
                throw new RepositoryError(
                    "MEETING_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Meeting does not exist"
                );
            const commandKind = "cancel_unfinished_meeting_message";
            this.authorizationValidator.validateCommand({
                snapshot,
                command: { commandKind, authorization: input.authorization }
            });
            const key = receiptKey(input.requestId, commandKind, input.authorization.callerBinding);
            const receipt = this.projection?.receipts[key];
            if (receipt) {
                if (receipt.requestHash !== input.requestHash)
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                const result = receipt.result;
                if (
                    typeof result !== "object" ||
                    result === null ||
                    Array.isArray(result) ||
                    typeof result.cancelled !== "number"
                )
                    throw new RepositoryError(
                        "CORRUPT_DATABASE",
                        false,
                        this.meetingId,
                        "Cancel receipt is invalid"
                    );
                return result.cancelled;
            }
            if (snapshot.version !== input.expectedMeetingVersion)
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            const now = input.now ?? this.now();
            const count = Object.values(this.projection?.privateMail ?? {}).filter(
                (mail) => mail.status === "pending" || mail.status === "processing"
            ).length;
            if (count === 0) return 0;
            return this.commit({
                operation: "mail.cancel",
                now,
                mutate: (projection) => {
                    let cancelled = 0;
                    for (const [id, mail] of Object.entries(projection.privateMail))
                        if (mail.status === "pending" || mail.status === "processing") {
                            projection.privateMail[id] = {
                                ...mail,
                                status: "cancelled",
                                updatedAt: now
                            };
                            cancelled += 1;
                        }
                    projection.receipts[key] = {
                        formatVersion: 1,
                        requestId: input.requestId,
                        commandKind,
                        callerBinding: input.authorization.callerBinding,
                        requestHash: input.requestHash,
                        meetingVersion: snapshot.version,
                        result: { cancelled },
                        eventSeqs: [],
                        createdAt: now
                    };
                    return { next: projection, result: cancelled };
                }
            });
        });
    }
    async execute<T>(_command: RepositoryCommand<T>): Promise<CommittedResult<T>> {
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
            const snapshot = structuredClone(this.projection.snapshot);
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
            const now = this.now();
            const transition = command.transition(snapshot);
            let transitionState: JsonObject;
            let transitionResult: JsonValue;
            try {
                transitionState = JsonObjectSchema.parse(jsonValue(transition.state));
                transitionResult = jsonValue(transition.result);
            } catch {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Command state or result is invalid"
                );
            }
            if (transition.events.length === 0) {
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
            for (const item of transition.outbox) {
                if (item.kind !== "dispatch")
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.meetingId,
                        "Outbox kind is not registered"
                    );
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
        });
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
    async recover(_input: RecoverInput = {}): Promise<RecoveryResult> {
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
                    ? { snapshot: structuredClone(this.projection!.snapshot) }
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
