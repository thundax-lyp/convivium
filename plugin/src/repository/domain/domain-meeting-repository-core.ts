import {
    same,
    immutableOwnership,
    ownershipInput,
    matchesPendingAdmission,
    validateDescriptor,
    isOwnershipUpdateAllowed
} from "./session-ownership-validation.js";
import type { PreparedDescriptor } from "@/role-composition/model.js";
import { DomainError } from "@/domain/index.js";
import { emitDiagnostic, observeCommit, type DiagnosticSink } from "@/repository/diagnostics.js";
import type { CatalogDomain, MeetingDomain } from "./specs.js";
import {
    SessionOwnershipSchema,
    PreparedDescriptorSchema,
    CatalogMeetingRecordSchema,
    CreationRecordSchema,
    JsonObjectSchema,
    type PersistenceProjection,
    PersistedEventSchema,
    PersistedOutboxSchema,
    PersistedReceiptSchema,
    PersistenceProjectionSchema
} from "./schemas.js";
import type {
    CommittedResult,
    CreateMeetingInput,
    CreateMeetingResult,
    JsonObject,
    MeetingStateCodec,
    MeetingBootstrap,
    MeetingSnapshot,
    RepositoryAuthorizationValidator,
    SessionOwnership,
    SessionOwnershipInput,
    UpdateBootstrapInput,
    UpdateCreateResultInput
} from "@/repository/types.js";
import {
    createProjection,
    createCommitRecord,
    decodeProjection,
    encodeProjection,
    projectionDigest,
    UnsupportedMeetingStateFormatError
} from "./projection.js";
import { diff } from "./json-patch.js";
import { catalogKey, receiptKey, seqKey } from "./keys.js";
import { loadProjection } from "./projection.js";
import { decodeCanonicalJson, encodeCanonicalJson } from "./canonical-json.js";
import { RepositoryError } from "@/repository/errors.js";
import {
    APPLICATION_CHECKPOINT_TRIGGER_BYTES,
    APPLICATION_CHECKPOINT_TRIGGER_COMMITS,
    APPLICATION_TAIL_HARD_BYTES,
    APPLICATION_TAIL_HARD_COMMITS
} from "./projection.js";
import { writeCheckpoint } from "./checkpoint.js";

function canonicalStateObject(value: unknown): JsonObject {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        throw new TypeError("Meeting state must be an object");
    const normalized = JSON.parse(JSON.stringify(value)) as unknown;
    return JsonObjectSchema.parse(normalized);
}

export interface DomainMeetingRepositoryOpenOptions<TState = JsonObject> {
    readonly catalogDomain: CatalogDomain;
    readonly meetingDomain: MeetingDomain;
    readonly meetingId: string;
    readonly authorizationValidator: RepositoryAuthorizationValidator<TState>;
    readonly codec?: MeetingStateCodec<TState>;
    readonly now?: () => number;
    readonly onDiagnostic?: DiagnosticSink;
    readonly onProjectionCommitted?: (snapshot: MeetingSnapshot<TState>) => void;
}

export abstract class DomainMeetingRepositoryCore<TState = JsonObject> {
    readonly meetingId: string;
    protected readonly catalogDomain: CatalogDomain;
    protected readonly meetingDomain: MeetingDomain;
    protected readonly authorizationValidator: RepositoryAuthorizationValidator<TState>;
    protected readonly codec: MeetingStateCodec<TState>;
    protected readonly now: () => number;
    protected readonly onProjectionCommitted:
        ((snapshot: MeetingSnapshot<TState>) => void) | undefined;
    protected readonly onDiagnostic: DiagnosticSink | undefined;
    protected closed = false;
    protected domainClosed = false;
    protected mutationChain: Promise<void> = Promise.resolve();
    protected projection: PersistenceProjection | undefined;
    protected headSeq = 0;
    protected headDigest: string | null = null;
    protected maintenanceRequested = false;
    protected maintenanceError: unknown;
    protected closePromise: Promise<void> | undefined;

    protected constructor(options: DomainMeetingRepositoryOpenOptions<TState>) {
        this.catalogDomain = options.catalogDomain;
        this.meetingDomain = options.meetingDomain;
        this.meetingId = options.meetingId;
        this.authorizationValidator = options.authorizationValidator;
        this.codec =
            options.codec ??
            ({
                encode: (state: TState) => encodeCanonicalJson(canonicalStateObject(state)),
                decode: (bytes: Uint8Array) => decodeCanonicalJson(bytes) as TState
            } satisfies MeetingStateCodec<TState>);
        this.now = options.now ?? Date.now;
        this.onProjectionCommitted = options.onProjectionCommitted;
        this.onDiagnostic = options.onDiagnostic;
    }

    protected async initialize(): Promise<void> {
        const options = { meetingDomain: this.meetingDomain, meetingId: this.meetingId };
        const creation = options.meetingDomain.table("creation").get("current");
        if (creation?.status === "ready") {
            try {
                this.projection = loadProjection({ domain: options.meetingDomain });
                if (this.projection.snapshot) this.decodeState(this.projection.snapshot.state);
                const pointer = options.meetingDomain.table("checkpoint_pointer").get("current");
                const tail = [...options.meetingDomain.table("commits").entries()]
                    .filter(([, record]) => record.seq > (pointer?.baseSeq ?? 0))
                    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
                const last = tail.at(-1)?.[1];
                this.headSeq = last?.seq ?? pointer?.baseSeq ?? 0;
                this.headDigest =
                    last?.digest ?? (pointer ? projectionDigest(this.projection) : null);
            } catch (error) {
                if (error instanceof RepositoryError) throw error;
                if (error instanceof UnsupportedMeetingStateFormatError) {
                    throw new RepositoryError(
                        "SCHEMA_VERSION_UNSUPPORTED",
                        false,
                        options.meetingId,
                        "Meeting state format is unsupported"
                    );
                }
                throw new RepositoryError(
                    "CORRUPT_DATABASE",
                    false,
                    options.meetingId,
                    "Meeting projection is corrupt"
                );
            }
        }
        if (this.projection !== undefined) {
            observeCommit(
                this.onDiagnostic,
                this.meetingId,
                this.projection,
                this.projection,
                this.now()
            );
        }
    }

    protected ensureOpen(): void {
        if (this.closed)
            throw new RepositoryError("CLOSED", false, this.meetingId, "Repository is closed");
    }

    protected encodeState(state: TState): JsonObject {
        try {
            return JsonObjectSchema.parse(decodeCanonicalJson(this.codec.encode(state)));
        } catch {
            throw new RepositoryError(
                "SCHEMA_VERSION_UNSUPPORTED",
                false,
                this.meetingId,
                "Meeting state format is unsupported"
            );
        }
    }

    protected decodeState(state: JsonObject): TState {
        try {
            return this.codec.decode(encodeCanonicalJson(state));
        } catch {
            throw new RepositoryError(
                "SCHEMA_VERSION_UNSUPPORTED",
                false,
                this.meetingId,
                "Meeting state format is unsupported"
            );
        }
    }

    protected decodeSnapshot(snapshot: MeetingSnapshot<JsonObject>): MeetingSnapshot<TState> {
        return { ...snapshot, state: this.decodeState(snapshot.state) };
    }

    protected enqueueMutation<T>(operation: () => Promise<T>, commandKind?: string): Promise<T> {
        this.ensureOpen();
        const committed = this.mutationChain.then(operation).catch((error) => {
            const state = this.projection?.snapshot?.state;
            const code =
                error instanceof RepositoryError || error instanceof DomainError
                    ? error.code
                    : "INTERNAL_ERROR";
            emitDiagnostic(this.onDiagnostic, {
                meetingId: this.meetingId,
                meetingVersion: this.projection?.snapshot?.version ?? 0,
                eventSeq: typeof state?.eventSeq === "number" ? state.eventSeq : 0,
                eventType: "repository.failed",
                ...(commandKind === undefined ? {} : { commandKind }),
                timestamp: this.now(),
                errorCode: code,
                metrics: { failures: 1, ...(code === "STALE_ATTEMPT" ? { staleSubmits: 1 } : {}) }
            });
            throw error;
        });
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

    protected async runMaintenance(): Promise<void> {
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

    protected async commit<T>(_input: {
        operation: string;
        now: number;
        mutate(current: PersistenceProjection): { next: PersistenceProjection; result: T };
    }): Promise<T> {
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
        const nextProjection = PersistenceProjectionSchema.parse(changed.next);
        const nextJson = decodeCanonicalJson(encodeCanonicalJson(nextProjection));
        const patch = diff(previousJson, nextJson).map((operation) => {
            if (operation.op === "splice")
                return { ...operation, path: [...operation.path], items: [...operation.items] };
            return { ...operation, path: [...operation.path] };
        });
        if (patch.length === 0) return changed.result;
        const seq = this.headSeq + 1;
        let record;
        try {
            record = createCommitRecord({
                formatVersion: 1,
                seq,
                previousSeq: this.headSeq,
                previousDigest: this.headDigest,
                operation: _input.operation,
                patch,
                committedAt: _input.now
            });
        } catch (error) {
            if (!(error instanceof RangeError) || error.message !== "commit is too large")
                throw error;
            await writeCheckpoint({
                domain: this.meetingDomain,
                projection: nextProjection,
                baseSeq: seq,
                createdAt: _input.now
            });
            const previous = this.projection;
            this.projection = nextProjection;
            this.headSeq = seq;
            this.headDigest = projectionDigest(nextProjection);
            this.maintenanceRequested = false;
            this.maintenanceError = undefined;
            observeCommit(
                this.onDiagnostic,
                this.meetingId,
                previous,
                this.projection,
                _input.now,
                _input.operation.startsWith("command:") ? _input.operation.slice(8) : undefined
            );
            if (this.onProjectionCommitted && this.projection.snapshot)
                this.onProjectionCommitted(
                    this.decodeSnapshot(structuredClone(this.projection.snapshot))
                );
            return changed.result;
        }
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
        const previous = this.projection;
        this.projection = nextProjection;
        this.headSeq = seq;
        this.headDigest = record.digest;
        observeCommit(
            this.onDiagnostic,
            this.meetingId,
            previous,
            this.projection,
            _input.now,
            _input.operation.startsWith("command:") ? _input.operation.slice(8) : undefined
        );
        if (this.onProjectionCommitted && this.projection.snapshot)
            this.onProjectionCommitted(
                this.decodeSnapshot(structuredClone(this.projection.snapshot))
            );
        const nextTailCount = tail.length + 1;
        if (
            nextTailCount >= APPLICATION_CHECKPOINT_TRIGGER_COMMITS ||
            tailBytes >= APPLICATION_CHECKPOINT_TRIGGER_BYTES
        )
            this.maintenanceRequested = true;
        return changed.result;
    }

    async create(input: CreateMeetingInput<TState>): Promise<MeetingBootstrap> {
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            this.authorizationValidator.validateCreate({
                meetingId: this.meetingId,
                authorization: input.authorization
            });
            const now = input.createdAt ?? this.now();
            const initialState = this.encodeState(input.initialState);
            const identities = initialState.identities;
            const ownerships = input.initialOwnership;
            const descriptors = input.preparedDescriptors;
            const valid =
                Array.isArray(identities) &&
                Array.isArray(ownerships) &&
                Array.isArray(descriptors) &&
                identities.length === 7 &&
                ownerships.length === 7 &&
                descriptors.length === 7 &&
                new Set(ownerships.map((o) => o.id)).size === 7 &&
                new Set(ownerships.map((o) => o.sessionId)).size === 7 &&
                new Set(ownerships.map((o) => o.identityId)).size === 7 &&
                ownerships.every(
                    (o) =>
                        o.meetingId === this.meetingId &&
                        o.lifecycleStatus === "provisioning" &&
                        o.capabilityStatus === "active" &&
                        o.admissionId === undefined &&
                        identities.some(
                            (i) =>
                                i &&
                                typeof i === "object" &&
                                !Array.isArray(i) &&
                                i.id === o.identityId &&
                                Array.isArray(i.roles) &&
                                (o.role === "participant"
                                    ? i.roles.includes("contributor")
                                    : i.roles.includes(o.role))
                        ) &&
                        SessionOwnershipSchema.safeParse({ ...o, createdAt: now, updatedAt: now })
                            .success &&
                        descriptors.some((d) => validateDescriptor(o, d))
                );
            if (!valid)
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Seven valid peer bindings are required."
                );
            const table = this.meetingDomain.table("creation");
            const existing = table.get("current");
            if (existing) {
                if (
                    existing.requestId !== input.requestId ||
                    existing.requestHash !== input.requestHash ||
                    !same(existing.creator, input.creator) ||
                    !same(existing.preparedDescriptors, input.preparedDescriptors) ||
                    !same(
                        Object.values(existing.sessionOwnership)
                            .map((o) => immutableOwnership(ownershipInput(o)))
                            .sort((a, b) => a.id.localeCompare(b.id)),
                        input.initialOwnership
                            .map(immutableOwnership)
                            .sort((a, b) => a.id.localeCompare(b.id))
                    )
                )
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with bootstrap"
                    );
                return {
                    status: existing.status,
                    creator: existing.creator,
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
            const creation = CreationRecordSchema.parse({
                formatVersion: 2,
                creator: input.creator,
                preparedDescriptors: descriptors,
                meetingId: this.meetingId,
                status: "creating",
                requestId: input.requestId,
                requestHash: input.requestHash,
                authorization: input.authorization,
                initialState,
                createResult: input.createResult ?? null,
                initialOutbox,
                sessionOwnership: Object.fromEntries(
                    ownerships.map((o) => [o.sessionId, { ...o, createdAt: now, updatedAt: now }])
                ),
                createdAt: now,
                updatedAt: now,
                failureCode: null
            });
            const catalog = CatalogMeetingRecordSchema.parse({
                formatVersion: 1,
                meetingId: this.meetingId,
                domainName: this.meetingDomain.name,
                status: "creating",
                createRequestId: input.requestId,
                requestHash: input.requestHash,
                createdAt: now,
                updatedAt: now,
                failureCode: null
            });
            await this.catalogDomain.table("meetings").put(catalogKey(this.meetingId), catalog);
            await table.put("current", creation);
            return {
                status: creation.status,
                creator: creation.creator,
                createRequestId: creation.requestId,
                requestHash: creation.requestHash,
                ...(creation.createResult === null ? {} : { createResult: creation.createResult }),
                createdAt: creation.createdAt,
                updatedAt: creation.updatedAt,
                ...(creation.failureCode === null ? {} : { failureCode: creation.failureCode })
            };
        });
    }
    async completeCreate(
        input: Pick<CreateMeetingInput<TState>, "requestId" | "requestHash" | "authorization">
    ): Promise<CommittedResult<CreateMeetingResult>> {
        return this.enqueueMutation(async () => {
            this.authorizationValidator.validateCreate({
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
            const result = creation.createResult ?? {
                meetingId: this.meetingId,
                meetingVersion: 0
            };
            const initialVersion = result.meetingVersion;
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
            if (
                creation.status !== "creating" ||
                Object.values(creation.sessionOwnership).length !== 7 ||
                Object.values(creation.sessionOwnership).some(
                    (o) => o.lifecycleStatus !== "active" || o.capabilityStatus !== "active"
                )
            )
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Meeting bootstrap cannot be completed"
                );
            const now = creation.createdAt;
            const next = createProjection({
                snapshot: {
                    meetingId: this.meetingId,
                    version: initialVersion,
                    state: creation.initialState,
                    createdAt: now,
                    updatedAt: now
                },
                bootstrap: {
                    status: "ready",
                    creator: creation.creator,
                    createRequestId: creation.requestId,
                    requestHash: creation.requestHash,
                    createResult: result,
                    createdAt: creation.createdAt,
                    updatedAt: now
                },
                sessionOwnership: creation.sessionOwnership,
                preparedDescriptors: creation.preparedDescriptors
            });
            next.events[seqKey(1)] = PersistedEventSchema.parse({
                formatVersion: 1,
                eventSeq: 1,
                meetingVersion: initialVersion,
                type: "meeting.created",
                payload: { meetingId: this.meetingId },
                turnId: null,
                attemptId: null,
                createdAt: now
            });
            next.receipts[createReceiptKey] = PersistedReceiptSchema.parse({
                formatVersion: 1,
                requestId: input.requestId,
                commandKind: "create_meeting",
                callerBinding: input.authorization.callerBinding,
                requestHash: input.requestHash,
                meetingVersion: initialVersion,
                result,
                eventSeqs: [1],
                createdAt: now
            });
            for (const item of creation.initialOutbox)
                next.outbox[item.id] = PersistedOutboxSchema.parse({
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
                .update(catalogKey(this.meetingId), (catalog) => ({
                    ...catalog,
                    status: "ready",
                    updatedAt: now
                }));
            observeCommit(this.onDiagnostic, this.meetingId, undefined, this.projection, now);
            if (this.onProjectionCommitted && this.projection.snapshot)
                this.onProjectionCommitted(
                    this.decodeSnapshot(structuredClone(this.projection.snapshot))
                );
            return {
                requestId: input.requestId,
                meetingId: this.meetingId,
                meetingVersion: initialVersion,
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
                    const matches = Object.entries(current.receipts).filter(
                        ([, candidate]) =>
                            candidate.requestId === creation.requestId &&
                            candidate.commandKind === "create_meeting"
                    );
                    if (matches.length !== 1)
                        throw new RepositoryError(
                            "CORRUPT_DATABASE",
                            false,
                            this.meetingId,
                            "Create receipt is missing"
                        );
                    const [key, receipt] = matches[0]!;
                    const next = PersistenceProjectionSchema.parse({
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
            const committedBootstrap = this.projection?.bootstrap;
            if (creation && committedBootstrap?.status === "ready") {
                const updatedAt = committedBootstrap.updatedAt;
                if (creation.status !== "ready")
                    await this.meetingDomain.table("creation").put("current", {
                        ...creation,
                        status: "ready",
                        createResult: committedBootstrap.createResult ?? null,
                        updatedAt,
                        failureCode: null
                    });
                await this.catalogDomain
                    .table("meetings")
                    .update(catalogKey(this.meetingId), (catalog) => ({
                        ...catalog,
                        status: "ready",
                        updatedAt,
                        failureCode: null
                    }));
                return structuredClone(committedBootstrap);
            }
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
                sessionOwnership: Object.fromEntries(
                    Object.entries(creation.sessionOwnership).map(([id, o]) => [
                        id,
                        { ...o, capabilityStatus: "revoked" as const, updatedAt: now }
                    ])
                ),
                failureCode: input.failureCode ?? null,
                updatedAt: now
            };
            await this.meetingDomain.table("creation").put("current", next);
            await this.catalogDomain
                .table("meetings")
                .update(catalogKey(this.meetingId), (catalog) => ({
                    ...catalog,
                    status: "creation_failed",
                    failureCode: input.failureCode ?? null,
                    updatedAt: now
                }));
            return {
                status: next.status,
                creator: next.creator,
                createRequestId: next.requestId,
                requestHash: next.requestHash,
                createdAt: next.createdAt,
                updatedAt: next.updatedAt,
                ...(next.failureCode === null ? {} : { failureCode: next.failureCode })
            };
        });
    }
    async recordSessionOwnership(
        input: SessionOwnershipInput,
        suppliedNow?: number,
        descriptor?: PreparedDescriptor
    ): Promise<SessionOwnership> {
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const now = suppliedNow ?? this.now();
            const parsed = SessionOwnershipSchema.safeParse({
                ...input,
                createdAt: now,
                updatedAt: now
            });
            if (!parsed.success || input.meetingId !== this.meetingId)
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.meetingId,
                    "Invalid peer ownership."
                );
            const creation = this.meetingDomain.table("creation").get("current");
            if (!creation)
                throw new RepositoryError(
                    "CORRUPT_DATABASE",
                    false,
                    this.meetingId,
                    "Missing creation record."
                );
            const source = this.projection ?? creation;
            const existing = source.sessionOwnership[input.sessionId];
            const proof = source.preparedDescriptors.find(
                (d) => d.descriptorId === input.descriptorId
            );
            const admissionMatches =
                creation.status === "ready" &&
                matchesPendingAdmission(this.projection?.snapshot?.state, input);
            if (existing) {
                const previous = ownershipInput(existing);
                if (!isOwnershipUpdateAllowed(previous, input, descriptor, proof))
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        this.meetingId,
                        "Peer ownership is immutable and cannot move backward."
                    );
                if (same(previous, input)) return structuredClone(existing);
                if (
                    input.lifecycleStatus === "active" &&
                    previous.lifecycleStatus === "provisioning" &&
                    (!proof ||
                        now >= proof.expiresAt ||
                        creation.status === "creation_failed" ||
                        (input.admissionId !== undefined && !admissionMatches) ||
                        input.capabilityStatus !== "active")
                )
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        this.meetingId,
                        "Peer preflight expired or activation was revoked."
                    );
            } else {
                if (
                    creation.status !== "ready" ||
                    input.lifecycleStatus !== "provisioning" ||
                    input.capabilityStatus !== "active" ||
                    !input.admissionId ||
                    !descriptor ||
                    !validateDescriptor(input, descriptor) ||
                    now >= descriptor.expiresAt ||
                    !admissionMatches ||
                    Object.values(source.sessionOwnership).some(
                        (o) => o.id === input.id || o.identityId === input.identityId
                    )
                )
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        this.meetingId,
                        "Peer admission does not match a pending intent."
                    );
            }
            const ownership = { ...input, createdAt: existing?.createdAt ?? now, updatedAt: now };
            const descriptors = existing
                ? source.preparedDescriptors
                : [...source.preparedDescriptors, PreparedDescriptorSchema.parse(descriptor)];
            if (!this.projection) {
                await this.meetingDomain.table("creation").put("current", {
                    ...creation,
                    sessionOwnership: {
                        ...creation.sessionOwnership,
                        [input.sessionId]: ownership
                    },
                    preparedDescriptors: descriptors,
                    updatedAt: now
                });
                return ownership;
            }
            return this.commit({
                operation: "session.ownership",
                now,
                mutate: (current) => ({
                    next: PersistenceProjectionSchema.parse({
                        ...current,
                        sessionOwnership: {
                            ...current.sessionOwnership,
                            [input.sessionId]: ownership
                        },
                        preparedDescriptors: descriptors
                    }),
                    result: ownership
                })
            });
        });
    }
    async read(): Promise<MeetingSnapshot<TState>> {
        this.ensureOpen();
        const snapshot = this.projection?.snapshot;
        if (!snapshot)
            throw new RepositoryError(
                "MEETING_NOT_FOUND",
                false,
                this.meetingId,
                "Meeting does not exist"
            );
        // A read must not serialize unrelated receipts, events, outbox or private mail.
        const result = PersistenceProjectionSchema.shape.snapshot
            .unwrap()
            .parse(decodeCanonicalJson(encodeCanonicalJson(snapshot)));
        if (
            Object.prototype.hasOwnProperty.call(result.state, "formatVersion") &&
            result.state.formatVersion !== 2
        )
            throw new UnsupportedMeetingStateFormatError(result.state.formatVersion);
        return this.decodeSnapshot(result);
    }
}
