import {
    same,
    immutableOwnership,
    ownershipInput,
    validateDescriptor
} from "./session-ownership-validation.ts";
import { captainActorIdFor, type MeetingEventInput } from "@/domain/index.ts";
import {
    SessionOwnershipSchema,
    CatalogMeetingRecordSchema,
    CreationRecordSchema,
    PersistedEventSchema,
    PersistedOutboxSchema,
    PersistedReceiptSchema,
    catalogKey,
    receiptKey,
    seqKey
} from "@/repository/storage-domain/format/index.ts";
import type {
    CommittedResult,
    CreateMeetingInput,
    CreateMeetingResult,
    JsonObject,
    MeetingBootstrap,
    UpdateBootstrapInput
} from "@/repository/index.ts";
import { RepositoryError } from "@/repository/index.ts";
import { createCommitRecord, createProjection } from "./projection.ts";
import { decodeCanonicalJson, encodeCanonicalJson } from "@/utils/index.ts";
import { observeCommit } from "@/repository/index.ts";
import { MeetingPersistenceState } from "./meeting-persistence-state.ts";

export class MeetingCreation<TState = JsonObject> {
    constructor(private readonly state: MeetingPersistenceState<TState>) {}
    async create(input: CreateMeetingInput<TState>): Promise<MeetingBootstrap> {
        this.state.ensureOpen();
        return this.state.enqueueMutation(async () => {
            this.state.authorizationValidator.validateCreate({
                meetingId: this.state.meetingId,
                authorization: input.authorization
            });
            const now = input.createdAt ?? this.state.now();
            const initialState = this.state.encodeState(input.initialState);
            const identities = initialState.identities;
            const ownerships = input.initialOwnership;
            const descriptors = input.preparedDescriptors;
            const initialCount = Array.isArray(identities) ? identities.length : 0;
            const valid =
                Array.isArray(identities) &&
                Array.isArray(ownerships) &&
                Array.isArray(descriptors) &&
                initialCount >= 2 &&
                initialCount <= 7 &&
                ownerships.length === initialCount &&
                descriptors.length === initialCount &&
                new Set(ownerships.map((o) => o.id)).size === initialCount &&
                new Set(ownerships.map((o) => o.sessionId)).size === initialCount &&
                new Set(ownerships.map((o) => o.identityId)).size === initialCount &&
                ownerships.every(
                    (o) =>
                        o.meetingId === this.state.meetingId &&
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
            if (!valid) {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.state.meetingId,
                    "Valid peer bindings must match the initial identities."
                );
            }
            const table = this.state.meetingDomain.table("creation");
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
                ) {
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.state.meetingId,
                        "Request hash conflicts with bootstrap"
                    );
                }
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
                if (item.kind !== "dispatch") {
                    throw new RepositoryError(
                        "INVALID_INPUT",
                        false,
                        this.state.meetingId,
                        "Outbox kind is not registered"
                    );
                }
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
                meetingId: this.state.meetingId,
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
                meetingId: this.state.meetingId,
                domainName: this.state.meetingDomain.name,
                status: "creating",
                createRequestId: input.requestId,
                requestHash: input.requestHash,
                createdAt: now,
                updatedAt: now,
                failureCode: null
            });
            await this.state.catalogDomain
                .table("meetings")
                .put(catalogKey(this.state.meetingId), catalog);
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
        return this.state.enqueueMutation(async () => {
            this.state.authorizationValidator.validateCreate({
                meetingId: this.state.meetingId,
                authorization: input.authorization
            });
            const creation = this.state.meetingDomain.table("creation").get("current");
            if (
                !creation ||
                creation.requestId !== input.requestId ||
                creation.requestHash !== input.requestHash
            ) {
                throw new RepositoryError(
                    "IDEMPOTENCY_CONFLICT",
                    false,
                    this.state.meetingId,
                    "Request hash conflicts with bootstrap"
                );
            }
            const createReceiptKey = receiptKey(
                input.requestId,
                "create_meeting",
                input.authorization.callerBinding
            );
            const result = creation.createResult ?? {
                meetingId: this.state.meetingId,
                meetingVersion: 0
            };
            const initialVersion = result.meetingVersion;
            const existingReceipt = this.state.projection?.receipts[createReceiptKey];
            if (existingReceipt) {
                const replayResult = this.state.projection?.bootstrap.createResult;
                if (!replayResult) {
                    throw new RepositoryError(
                        "CORRUPT_DATABASE",
                        false,
                        this.state.meetingId,
                        "Create result is missing"
                    );
                }
                return {
                    requestId: input.requestId,
                    meetingId: this.state.meetingId,
                    meetingVersion: existingReceipt.meetingVersion,
                    result: replayResult,
                    eventSeqs: [...existingReceipt.eventSeqs]
                };
            }
            if (
                creation.status !== "creating" ||
                !Array.isArray(creation.initialState.identities) ||
                Object.values(creation.sessionOwnership).length !==
                    creation.initialState.identities.length ||
                Object.values(creation.sessionOwnership).some(
                    (o) => o.lifecycleStatus !== "active" || o.capabilityStatus !== "active"
                )
            ) {
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.state.meetingId,
                    "Meeting bootstrap cannot be completed"
                );
            }
            const now = creation.createdAt;
            const next = createProjection({
                snapshot: {
                    meetingId: this.state.meetingId,
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
            const createdEvent: MeetingEventInput = {
                type: "meeting.created",
                occurredAt: now,
                payload: {
                    logVersion: 1,
                    actor: { kind: "captain", actorId: captainActorIdFor(this.state.meetingId) },
                    subject: { kind: "meeting", id: this.state.meetingId },
                    relatedObjects: [],
                    data: {}
                }
            };
            next.events[seqKey(1)] = PersistedEventSchema.parse({
                formatVersion: 1,
                eventSeq: 1,
                meetingVersion: initialVersion,
                type: createdEvent.type,
                payload: createdEvent.payload,
                turnId: null,
                attemptId: null,
                createdAt: createdEvent.occurredAt
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
            for (const item of creation.initialOutbox) {
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
            }
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
            await this.state.meetingDomain.table("commits").put(seqKey(1), record);
            this.state.projection = next;
            this.state.headSeq = 1;
            this.state.headDigest = record.digest;
            await this.state.meetingDomain.table("creation").put("current", {
                ...creation,
                status: "ready",
                createResult: result,
                updatedAt: now
            });
            await this.state.catalogDomain
                .table("meetings")
                .update(catalogKey(this.state.meetingId), (catalog) => ({
                    ...catalog,
                    status: "ready",
                    updatedAt: now
                }));
            observeCommit(
                this.state.onDiagnostic,
                this.state.meetingId,
                undefined,
                this.state.projection,
                now
            );
            if (this.state.onProjectionCommitted && this.state.projection.snapshot) {
                this.state.onProjectionCommitted(
                    this.state.decodeSnapshot(structuredClone(this.state.projection.snapshot))
                );
            }
            return {
                requestId: input.requestId,
                meetingId: this.state.meetingId,
                meetingVersion: initialVersion,
                result,
                eventSeqs: [1]
            };
        });
    }
    async updateBootstrap(_input: UpdateBootstrapInput): Promise<MeetingBootstrap> {
        const input = _input;
        this.state.ensureOpen();
        return this.state.enqueueMutation(async () => {
            const creation = this.state.meetingDomain.table("creation").get("current");
            const committedBootstrap = this.state.projection?.bootstrap;
            if (creation && committedBootstrap?.status === "ready") {
                const updatedAt = committedBootstrap.updatedAt;
                if (creation.status !== "ready") {
                    await this.state.meetingDomain.table("creation").put("current", {
                        ...creation,
                        status: "ready",
                        createResult: committedBootstrap.createResult ?? null,
                        updatedAt,
                        failureCode: null
                    });
                }
                await this.state.catalogDomain
                    .table("meetings")
                    .update(catalogKey(this.state.meetingId), (catalog) => ({
                        ...catalog,
                        status: "ready",
                        updatedAt,
                        failureCode: null
                    }));
                return structuredClone(committedBootstrap);
            }
            if (!creation || creation.status === "ready") {
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.state.meetingId,
                    "Bootstrap cannot be updated"
                );
            }
            const now = input.now ?? this.state.now();
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
            await this.state.meetingDomain.table("creation").put("current", next);
            await this.state.catalogDomain
                .table("meetings")
                .update(catalogKey(this.state.meetingId), (catalog) => ({
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
}
