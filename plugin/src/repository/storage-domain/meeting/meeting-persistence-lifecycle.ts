import type { RecoverInput, RecoveryResult, JsonObject } from "@/repository/index.ts";
import { RepositoryError } from "@/repository/index.ts";
import {
    catalogKey,
    CatalogMeetingRecordSchema,
    type CatalogMeetingRecord
} from "@/repository/storage-domain/format/index.ts";
import { purgeMeetingData } from "./meeting-data-deletion.ts";
import { MeetingPersistenceState } from "./meeting-persistence-state.ts";

export class MeetingPersistenceLifecycle<TState = JsonObject> {
    constructor(private readonly state: MeetingPersistenceState<TState>) {}
    async recover(_input: RecoverInput = {}): Promise<RecoveryResult<TState>> {
        this.state.ensureOpen();
        return this.state.enqueueMutation(async () => {
            const creation = this.state.meetingDomain.table("creation").get("current");
            if (!creation) {
                throw new RepositoryError(
                    "CORRUPT_DATABASE",
                    false,
                    this.state.meetingId,
                    "Meeting bootstrap is missing"
                );
            }
            const now = _input.now ?? this.state.now();
            let reclaimedOutbox = 0;
            if (this.state.projection) {
                const expired = Object.values(this.state.projection.outbox).filter(
                    (item) => item.status === "leased" && (item.leaseDeadline ?? 0) <= now
                );
                if (expired.length) {
                    reclaimedOutbox = await this.state.commit({
                        operation: "outbox.recover",
                        now,
                        mutate: (projection) => {
                            for (const item of expired) {
                                projection.outbox[item.id] = {
                                    ...item,
                                    status: "pending",
                                    leaseOwner: null,
                                    leaseToken: null,
                                    leaseDeadline: null
                                };
                            }
                            return { next: projection, result: expired.length };
                        }
                    });
                }
            }
            const ready = creation.status === "ready" && this.state.projection !== undefined;
            const bootstrap = ready
                ? structuredClone(this.state.projection!.bootstrap)
                : {
                      status: creation.status,
                      creator: creation.creator,
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
            const pendingOutbox = Object.values(this.state.projection?.outbox ?? {}).filter(
                (item) => item.status === "pending" || item.status === "leased"
            ).length;
            const ownership = ready
                ? this.state.projection!.sessionOwnership
                : creation.sessionOwnership;
            return {
                ...(ready && this.state.projection!.snapshot
                    ? {
                          snapshot: this.state.decodeSnapshot(
                              structuredClone(this.state.projection!.snapshot)
                          )
                      }
                    : {}),
                bootstrap,
                sessionOwnership: Object.values(ownership).map((item) => structuredClone(item)),
                preparedDescriptors: structuredClone(
                    ready
                        ? this.state.projection!.preparedDescriptors
                        : creation.preparedDescriptors
                ),
                reclaimedOutbox,
                pendingOutbox
            };
        });
    }

    async beginDeletion(
        expectedVersion: number,
        validate: (
            recovery: RecoveryResult<TState>
        ) => CatalogMeetingRecord["deletionSummary"] | void
    ): Promise<void> {
        return this.state.enqueueMutation(async () => {
            const projection = this.state.projection;
            if (!projection?.snapshot) {
                throw new RepositoryError(
                    "INVALID_STATE",
                    false,
                    this.state.meetingId,
                    "Meeting is not ready"
                );
            }
            if (projection.snapshot.version !== expectedVersion) {
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    false,
                    this.state.meetingId,
                    "Meeting has changed"
                );
            }
            const summary = validate({
                snapshot: this.state.decodeSnapshot(structuredClone(projection.snapshot)),
                bootstrap: structuredClone(projection.bootstrap),
                sessionOwnership: structuredClone(Object.values(projection.sessionOwnership)),
                preparedDescriptors: structuredClone(projection.preparedDescriptors),
                reclaimedOutbox: 0,
                pendingOutbox: Object.values(projection.outbox).filter(
                    (item) => item.status === "pending" || item.status === "leased"
                ).length
            });
            const key = catalogKey(this.state.meetingId);
            const record = this.state.catalogDomain.table("meetings").get(key);
            if (!record) {
                throw new RepositoryError(
                    "MEETING_NOT_FOUND",
                    false,
                    this.state.meetingId,
                    "Meeting is not registered"
                );
            }
            await this.state.catalogDomain.table("meetings").put(
                key,
                CatalogMeetingRecordSchema.parse({
                    ...record,
                    status: "deleting",
                    ...(summary ? { deletionSummary: summary } : {})
                })
            );
            this.state.closed = true;
            this.state.deletionCommitted = true;
            this.state.maintenanceRequested = false;
        });
    }

    async purgeDeletedData(): Promise<void> {
        if (
            !this.state.closed ||
            this.state.catalogDomain.table("meetings").get(catalogKey(this.state.meetingId))
                ?.status !== "deleting"
        ) {
            throw new RepositoryError(
                "INVALID_STATE",
                false,
                this.state.meetingId,
                "Deletion is not committed"
            );
        }
        await this.state.mutationChain;
        await purgeMeetingData(this.state.meetingDomain);
        this.state.projection = undefined;
    }

    async close(): Promise<void> {
        if (this.state.closePromise) {
            return this.state.closePromise;
        }
        this.state.closed = true;
        this.state.closePromise = (async () => {
            await this.state.mutationChain;
            const maintenanceError = this.state.maintenanceError;
            let domainCloseError: unknown;
            try {
                if (!this.state.domainClosed) {
                    this.state.domainClosed = true;
                    await this.state.meetingDomain.close();
                }
            } catch (error) {
                domainCloseError = error;
            }
            if (maintenanceError) {
                throw maintenanceError;
            }
            if (domainCloseError !== undefined) {
                throw domainCloseError;
            }
        })();
        return this.state.closePromise;
    }
}
