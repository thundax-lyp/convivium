import {
    emitDiagnostic,
    observeCommit,
    type DiagnosticSink,
    type JsonObject,
    type MeetingSnapshot,
    type MeetingStateCodec,
    type RepositoryAuthorizationValidator
} from "@/repository/index.ts";
import type {
    CatalogDomain,
    MeetingDomain,
    PersistenceProjection
} from "@/repository/storage-domain/format/index.ts";
import {
    JsonObjectSchema,
    PersistenceProjectionSchema,
    UnsupportedMeetingStateFormatError,
    seqKey
} from "@/repository/storage-domain/format/index.ts";
import { diff, decodeCanonicalJson, encodeCanonicalJson } from "@/utils/index.ts";
import { RepositoryError } from "@/repository/index.ts";
import {
    createCommitRecord,
    decodeProjection,
    encodeProjection,
    projectionDigest,
    loadProjection,
    APPLICATION_CHECKPOINT_TRIGGER_BYTES,
    APPLICATION_CHECKPOINT_TRIGGER_COMMITS,
    APPLICATION_TAIL_HARD_BYTES,
    APPLICATION_TAIL_HARD_COMMITS
} from "./projection.ts";
import { writeCheckpoint } from "./checkpoint.ts";

const canonicalStateObject = (value: unknown): JsonObject => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Meeting state must be an object");
    }
    const normalized = JSON.parse(JSON.stringify(value)) as unknown;
    return JsonObjectSchema.parse(normalized);
};

export interface StorageDomainMeetingRepositoryOpenOptions<TState = JsonObject> {
    readonly catalogDomain: CatalogDomain;
    readonly meetingDomain: MeetingDomain;
    readonly meetingId: string;
    readonly authorizationValidator: RepositoryAuthorizationValidator<TState>;
    readonly codec?: MeetingStateCodec<TState>;
    readonly now?: () => number;
    readonly onDiagnostic?: DiagnosticSink;
    readonly onProjectionCommitted?: (snapshot: MeetingSnapshot<TState>) => void;
}

export class MeetingPersistenceState<TState = JsonObject> {
    readonly meetingId: string;
    readonly catalogDomain: CatalogDomain;
    readonly meetingDomain: MeetingDomain;
    readonly authorizationValidator: RepositoryAuthorizationValidator<TState>;
    readonly codec: MeetingStateCodec<TState>;
    readonly now: () => number;
    readonly onProjectionCommitted: ((snapshot: MeetingSnapshot<TState>) => void) | undefined;
    readonly onDiagnostic: DiagnosticSink | undefined;
    closed = false;
    deletionCommitted = false;
    domainClosed = false;
    mutationChain: Promise<void> = Promise.resolve();
    projection: PersistenceProjection | undefined;
    headSeq = 0;
    headDigest: string | null = null;
    maintenanceRequested = false;
    maintenanceError: unknown;
    closePromise: Promise<void> | undefined;

    constructor(options: StorageDomainMeetingRepositoryOpenOptions<TState>) {
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

    async initialize(): Promise<void> {
        const options = { meetingDomain: this.meetingDomain, meetingId: this.meetingId };
        const creation = options.meetingDomain.table("creation").get("current");
        if (creation?.status === "ready") {
            try {
                this.projection = loadProjection({ domain: options.meetingDomain });
                if (this.projection.snapshot) {
                    this.decodeState(this.projection.snapshot.state);
                }
                const pointer = options.meetingDomain.table("checkpoint_pointer").get("current");
                const tail = [...options.meetingDomain.table("commits").entries()]
                    .filter(([, record]) => record.seq > (pointer?.baseSeq ?? 0))
                    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
                const last = tail.at(-1)?.[1];
                this.headSeq = last?.seq ?? pointer?.baseSeq ?? 0;
                this.headDigest =
                    last?.digest ?? (pointer ? projectionDigest(this.projection) : null);
            } catch (error) {
                if (error instanceof RepositoryError) {
                    throw error;
                }
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

    ensureOpen(queued = false): void {
        if (this.closed && (!queued || this.deletionCommitted)) {
            throw new RepositoryError("CLOSED", false, this.meetingId, "Repository is closed");
        }
    }

    encodeState(state: TState): JsonObject {
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

    decodeState(state: JsonObject): TState {
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

    decodeSnapshot(snapshot: MeetingSnapshot<JsonObject>): MeetingSnapshot<TState> {
        return { ...snapshot, state: this.decodeState(snapshot.state) };
    }

    enqueueMutation<T>(operation: () => Promise<T>, commandKind?: string): Promise<T> {
        this.ensureOpen();
        const committed = this.mutationChain
            .then(() => {
                this.ensureOpen(true);
                return operation();
            })
            .catch((error) => {
                const state = this.projection?.snapshot?.state;
                const code = error instanceof RepositoryError ? error.code : "INTERNAL_ERROR";
                emitDiagnostic(this.onDiagnostic, {
                    meetingId: this.meetingId,
                    meetingVersion: this.projection?.snapshot?.version ?? 0,
                    eventSeq: typeof state?.eventSeq === "number" ? state.eventSeq : 0,
                    eventType: "repository.failed",
                    ...(commandKind === undefined ? {} : { commandKind }),
                    timestamp: this.now(),
                    errorCode: code,
                    metrics: {
                        failures: 1
                    }
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

    async runMaintenance(): Promise<void> {
        if (!this.maintenanceRequested || !this.projection) {
            return;
        }
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

    async commit<T>(_input: {
        operation: string;
        now: number;
        mutate(current: PersistenceProjection): { next: PersistenceProjection; result: T };
    }): Promise<T> {
        if (!this.projection) {
            throw new RepositoryError(
                "INVALID_STATE",
                false,
                this.meetingId,
                "Meeting is not ready"
            );
        }
        const current = decodeProjection(encodeProjection(this.projection));
        const previousJson = decodeCanonicalJson(encodeCanonicalJson(current));
        const changed = _input.mutate(current);
        const nextProjection = PersistenceProjectionSchema.parse(changed.next);
        const nextJson = decodeCanonicalJson(encodeCanonicalJson(nextProjection));
        const patch = diff(previousJson, nextJson).map((operation) => {
            if (operation.op === "splice") {
                return { ...operation, path: [...operation.path], items: [...operation.items] };
            }
            return { ...operation, path: [...operation.path] };
        });
        if (patch.length === 0) {
            return changed.result;
        }
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
            if (!(error instanceof RangeError) || error.message !== "commit is too large") {
                throw error;
            }
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
            if (this.onProjectionCommitted && this.projection.snapshot) {
                this.onProjectionCommitted(
                    this.decodeSnapshot(structuredClone(this.projection.snapshot))
                );
            }
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
            ) {
                throw new RepositoryError(
                    "CONSTRAINT_VIOLATION",
                    false,
                    this.meetingId,
                    "Application commit tail is too large"
                );
            }
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
        if (this.onProjectionCommitted && this.projection.snapshot) {
            this.onProjectionCommitted(
                this.decodeSnapshot(structuredClone(this.projection.snapshot))
            );
        }
        const nextTailCount = tail.length + 1;
        if (
            nextTailCount >= APPLICATION_CHECKPOINT_TRIGGER_COMMITS ||
            tailBytes >= APPLICATION_CHECKPOINT_TRIGGER_BYTES
        ) {
            this.maintenanceRequested = true;
        }
        return changed.result;
    }

    async read(): Promise<MeetingSnapshot<TState>> {
        this.ensureOpen();
        const snapshot = this.projection?.snapshot;
        if (!snapshot) {
            throw new RepositoryError(
                "MEETING_NOT_FOUND",
                false,
                this.meetingId,
                "Meeting does not exist"
            );
        }
        // A read must not serialize unrelated receipts, events, or outbox.
        const result = PersistenceProjectionSchema.shape.snapshot
            .unwrap()
            .parse(decodeCanonicalJson(encodeCanonicalJson(snapshot)));
        if (
            Object.prototype.hasOwnProperty.call(result.state, "formatVersion") &&
            result.state.formatVersion !== 2
        ) {
            throw new UnsupportedMeetingStateFormatError(result.state.formatVersion);
        }
        return this.decodeSnapshot(result);
    }
}
