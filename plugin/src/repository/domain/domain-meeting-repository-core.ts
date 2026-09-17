import { DomainError } from "@/domain/index.js";
import { emitDiagnostic, observeCommit, type DiagnosticSink } from "@/repository/diagnostics.js";
import type { CatalogDomain, MeetingDomain } from "./specs.js";
import {
    AgentDefinitionBindingSchema,
    CatalogMeetingRecordV1Schema,
    CreationRecordV1Schema,
    type PersistenceProjectionV1,
    PersistedEventV1Schema,
    PersistedOutboxV1Schema,
    PersistedReceiptV1Schema,
    PersistenceProjectionV1Schema
} from "./schemas.js";
import type {
    CommittedResult,
    CreateMeetingInput,
    CreateMeetingResult,
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

function hasInvalidOwnershipTransition(
    existing: SessionOwnership,
    input: SessionOwnershipInput
): boolean {
    return (
        !isLifecycleTransitionAllowed(existing.lifecycleStatus, input.lifecycleStatus) ||
        !isCapabilityTransitionAllowed(existing.capabilityStatus, input.capabilityStatus) ||
        existing.sessionLabel !== input.sessionLabel ||
        existing.parentSessionId !== input.parentSessionId ||
        existing.provider !== input.provider ||
        existing.agentDefinition?.agentDefinitionId !== input.agentDefinition?.agentDefinitionId ||
        existing.agentDefinition?.definitionVersion !== input.agentDefinition?.definitionVersion ||
        existing.agentDefinition?.definitionHash !== input.agentDefinition?.definitionHash ||
        existing.role !== input.role ||
        existing.participantId !== input.participantId ||
        (existing.initialMessageId !== undefined &&
            input.initialMessageId !== undefined &&
            existing.initialMessageId !== input.initialMessageId)
    );
}

export interface DomainMeetingRepositoryOpenOptions {
    readonly catalogDomain: CatalogDomain;
    readonly meetingDomain: MeetingDomain;
    readonly teamId: string;
    readonly meetingId: string;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly now?: () => number;
    readonly onDiagnostic?: DiagnosticSink;
    readonly onProjectionCommitted?: (snapshot: MeetingSnapshot) => void;
}

export abstract class DomainMeetingRepositoryCore {
    readonly teamId: string;
    readonly meetingId: string;
    protected readonly catalogDomain: CatalogDomain;
    protected readonly meetingDomain: MeetingDomain;
    protected readonly authorizationValidator: RepositoryAuthorizationValidator;
    protected readonly now: () => number;
    protected readonly onProjectionCommitted: ((snapshot: MeetingSnapshot) => void) | undefined;
    protected readonly onDiagnostic: DiagnosticSink | undefined;
    protected closed = false;
    protected domainClosed = false;
    protected mutationChain: Promise<void> = Promise.resolve();
    protected projection: PersistenceProjectionV1 | undefined;
    protected headSeq = 0;
    protected headDigest: string | null = null;
    protected maintenanceRequested = false;
    protected maintenanceError: unknown;
    protected closePromise: Promise<void> | undefined;

    protected constructor(options: DomainMeetingRepositoryOpenOptions) {
        this.catalogDomain = options.catalogDomain;
        this.meetingDomain = options.meetingDomain;
        this.teamId = options.teamId;
        this.meetingId = options.meetingId;
        this.authorizationValidator = options.authorizationValidator;
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
                const pointer = options.meetingDomain.table("checkpoint_pointer").get("current");
                const tail = [...options.meetingDomain.table("commits").entries()]
                    .filter(([, record]) => record.seq > (pointer?.baseSeq ?? 0))
                    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
                const last = tail.at(-1)?.[1];
                this.headSeq = last?.seq ?? pointer?.baseSeq ?? 0;
                this.headDigest =
                    last?.digest ?? (pointer ? projectionDigest(this.projection) : null);
            } catch (error) {
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
        mutate(current: PersistenceProjectionV1): { next: PersistenceProjectionV1; result: T };
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
        this.onProjectionCommitted?.(structuredClone(this.projection.snapshot!));
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
            await this.catalogDomain.table("meetings").put(catalogKey(this.meetingId), catalog);
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
                .update(catalogKey(this.meetingId), (catalog) => ({
                    ...catalog,
                    status: "ready",
                    updatedAt: now
                }));
            observeCommit(this.onDiagnostic, this.meetingId, undefined, this.projection, now);
            this.onProjectionCommitted?.(structuredClone(this.projection.snapshot!));
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
        const parsedBinding = AgentDefinitionBindingSchema.optional().safeParse(
            _input.agentDefinition
        );
        if (!parsedBinding.success)
            throw new RepositoryError(
                "INVALID_INPUT",
                false,
                this.meetingId,
                "Invalid agent definition binding"
            );
        const { agentDefinition, ...identity } = _input;
        const input = {
            ...identity,
            ...(agentDefinition === undefined ? {} : { agentDefinition: parsedBinding.data })
        };
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
            if (input.supersededBySessionId !== existing?.supersededBySessionId)
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.meetingId,
                    "Only atomic Session replacement may assign supersession."
                );
            if (existing && hasInvalidOwnershipTransition(existing, input))
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
    /** Retains revoked ownership and its replacement link through checkpoint compaction. */
    async replaceMissingSession(
        previousSessionId: string,
        replacementSessionId: string,
        now = this.now()
    ): Promise<SessionOwnership> {
        return this.enqueueMutation(async () =>
            this.commit({
                operation: "session.replaced",
                now,
                mutate: (current) => {
                    const previous = current.sessionOwnership[previousSessionId];
                    if (
                        current.snapshot?.state.status !== "paused" ||
                        previous === undefined ||
                        previous.capabilityStatus !== "revoked" ||
                        previous.lifecycleStatus !== "closed" ||
                        previous.supersededBySessionId !== undefined ||
                        !replacementSessionId ||
                        current.sessionOwnership[replacementSessionId] !== undefined
                    ) {
                        throw new RepositoryError(
                            "INVALID_STATE",
                            false,
                            this.meetingId,
                            "Session replacement requires a paused Meeting and retired ownership."
                        );
                    }
                    const replacement: SessionOwnership = {
                        ...previous,
                        sessionId: replacementSessionId,
                        lifecycleStatus: "provisioning",
                        capabilityStatus: "active",
                        createdAt: now,
                        updatedAt: now
                    };
                    delete replacement.initialMessageId;
                    const ownership = { ...current.sessionOwnership };
                    ownership[previousSessionId] = {
                        ...previous,
                        supersededBySessionId: replacementSessionId,
                        updatedAt: now
                    };
                    ownership[replacementSessionId] = replacement;
                    return {
                        next: { ...current, sessionOwnership: ownership },
                        result: replacement
                    };
                }
            })
        );
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
        // A read must not serialize unrelated receipts, events, outbox or private mail.
        const result = PersistenceProjectionV1Schema.shape.snapshot
            .unwrap()
            .parse(decodeCanonicalJson(encodeCanonicalJson(snapshot)));
        if (
            Object.prototype.hasOwnProperty.call(result.state, "formatVersion") &&
            result.state.formatVersion !== 2
        )
            throw new UnsupportedMeetingStateFormatError(result.state.formatVersion);
        return result;
    }
}
