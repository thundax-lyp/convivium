import { DomainError as StorageDomainError } from "@deepseek-ai/dsh-storage-domain";
import type { DiagnosticSink } from "@/repository/diagnostics.js";
import type { Domain, DomainFacility, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { RepositoryError } from "@/repository/errors.js";
import { UnsupportedMeetingStateFormatError } from "./projection.js";
import type {
    CreateMeetingInput,
    JsonObject,
    MeetingStateCodec,
    MeetingSnapshot,
    RepositoryAuthorizationValidator
} from "@/repository/types.js";
import { DomainMeetingRepository } from "./domain-meeting-repository.js";
import { catalogKey, meetingDomainName } from "./keys.js";
import { loadProjection } from "./projection.js";
import {
    catalogDomainSpec,
    createMeetingDomainSpec,
    type CatalogDomain,
    type MeetingDomain
} from "./specs.js";
import type { CatalogMeetingRecord, CreationRecord } from "./schemas.js";

export interface DomainFacilityPort {
    open<S extends DomainSpec>(spec: S): Promise<Domain<S>>;
}

export interface DomainRepositoryRegistryOptions<TState = JsonObject> {
    readonly storageDomain: Pick<DomainFacility, "open"> | DomainFacilityPort;
    readonly authorizationValidator: RepositoryAuthorizationValidator<TState>;
    readonly codec?: MeetingStateCodec<TState>;
    readonly now?: () => number;
    readonly onDiagnostic?: DiagnosticSink;
    readonly onProjectionCommitted?: (snapshot: MeetingSnapshot<TState>) => void;
}

export interface OpenDomainMeetingInput<TState = JsonObject> {
    readonly meetingId: string;
    readonly create?: CreateMeetingInput<TState>;
}

function corrupt(meetingId: string, message: string): RepositoryError {
    return new RepositoryError("CORRUPT_DATABASE", false, meetingId, message);
}

function validateCatalogIdentity(
    key: string,
    record: CatalogMeetingRecord,
    meetingId: string
): void {
    if (
        key !== catalogKey(record.meetingId) ||
        record.meetingId !== meetingId ||
        record.domainName !== meetingDomainName(meetingId)
    )
        throw corrupt(meetingId, "Catalog identity is invalid");
}

function validateCreationIdentity(creation: CreationRecord, catalog: CatalogMeetingRecord): void {
    if (
        creation.meetingId !== catalog.meetingId ||
        creation.requestId !== catalog.createRequestId ||
        creation.requestHash !== catalog.requestHash
    )
        throw corrupt(catalog.meetingId, "Creation identity is invalid");
}

export class DomainRepositoryRegistry<TState = JsonObject> {
    private readonly repositories = new Map<string, Promise<DomainMeetingRepository<TState>>>();
    private readonly opened = new Map<string, DomainMeetingRepository<TState>>();
    private closePromise: Promise<void> | undefined;
    private closed = false;

    private constructor(
        private readonly storageDomain: DomainFacilityPort,
        private readonly catalog: CatalogDomain,
        private readonly authorizationValidator: RepositoryAuthorizationValidator<TState>,
        private readonly codec: MeetingStateCodec<TState> | undefined,
        private readonly now: () => number,
        private readonly onDiagnostic: DiagnosticSink | undefined,
        private readonly onProjectionCommitted:
            ((snapshot: MeetingSnapshot<TState>) => void) | undefined
    ) {}

    static async open<TState = JsonObject>(
        options: DomainRepositoryRegistryOptions<TState>
    ): Promise<DomainRepositoryRegistry<TState>> {
        const catalog = await options.storageDomain.open(catalogDomainSpec);
        return new DomainRepositoryRegistry(
            options.storageDomain,
            catalog,
            options.authorizationValidator,
            options.codec,
            options.now ?? Date.now,
            options.onDiagnostic,
            options.onProjectionCommitted
        );
    }

    listMeetings(): CatalogMeetingRecord[] {
        this.ensureOpen();
        const records: CatalogMeetingRecord[] = [];
        for (const [key, record] of this.catalog.table("meetings").entries()) {
            validateCatalogIdentity(key, record, record.meetingId);
            records.push(structuredClone(record));
        }
        return records.sort((left, right) => left.meetingId.localeCompare(right.meetingId));
    }

    async openMeeting(
        input: OpenDomainMeetingInput<TState>
    ): Promise<DomainMeetingRepository<TState>> {
        this.ensureOpen();
        const key = catalogKey(input.meetingId);
        let pending = this.repositories.get(key);
        if (!pending) {
            pending = this.openMeetingOnce(key, input);
            this.repositories.set(key, pending);
            pending.catch(() => {
                if (this.repositories.get(key) === pending) this.repositories.delete(key);
            });
        }
        const repository = await pending;
        const catalog = this.catalog.table("meetings").get(key);
        if (!catalog) throw corrupt(input.meetingId, "Cached catalog record is missing");
        validateCatalogIdentity(key, catalog, input.meetingId);
        if (repository.meetingId !== input.meetingId)
            throw corrupt(input.meetingId, "Cached repository identity is invalid");
        if (input.create) await repository.create(input.create);
        return repository;
    }

    private async openMeetingOnce(
        key: string,
        input: OpenDomainMeetingInput<TState>
    ): Promise<DomainMeetingRepository<TState>> {
        const catalog = this.catalog.table("meetings").get(key);
        if (!catalog && !input.create)
            throw new RepositoryError(
                "MEETING_NOT_FOUND",
                false,
                input.meetingId,
                "Meeting is not registered"
            );
        if (catalog) {
            validateCatalogIdentity(key, catalog, input.meetingId);
            if (
                input.create &&
                (catalog.createRequestId !== input.create.requestId ||
                    catalog.requestHash !== input.create.requestHash)
            )
                throw new RepositoryError(
                    "IDEMPOTENCY_CONFLICT",
                    false,
                    input.meetingId,
                    "Request conflicts with catalog bootstrap"
                );
        }
        const domainName = catalog?.domainName ?? meetingDomainName(input.meetingId);
        const domain = await this.storageDomain
            .open(createMeetingDomainSpec(domainName))
            .catch((error: unknown) => {
                if (error instanceof StorageDomainError && error.code === "invalid-record") {
                    if (error.cause instanceof UnsupportedMeetingStateFormatError)
                        throw new RepositoryError(
                            "SCHEMA_VERSION_UNSUPPORTED",
                            false,
                            input.meetingId,
                            "Meeting storage format is unsupported"
                        );
                    throw corrupt(input.meetingId, "Meeting storage record is invalid");
                }
                throw error;
            });
        try {
            if (catalog) await this.reconcile(domain, key, catalog);
            const repository = await DomainMeetingRepository.open<TState>({
                catalogDomain: this.catalog,
                meetingDomain: domain,
                meetingId: input.meetingId,
                authorizationValidator: this.authorizationValidator,
                codec: this.codec,
                now: this.now,
                onDiagnostic: this.onDiagnostic,
                onProjectionCommitted: this.onProjectionCommitted
            });
            if (input.create) await repository.create(input.create);
            this.opened.set(domainName, repository);
            return repository;
        } catch (error) {
            await domain.close().catch(() => undefined);
            throw error;
        }
    }

    private async reconcile(
        domain: MeetingDomain,
        key: string,
        catalog: CatalogMeetingRecord
    ): Promise<void> {
        const creation = domain.table("creation").get("current");
        if (creation) validateCreationIdentity(creation, catalog);
        if (catalog.status === "creation_failed") {
            if (!creation || creation.status !== "creation_failed")
                throw corrupt(catalog.meetingId, "Failed creation record is missing");
            return;
        }
        const first = domain.table("commits").get("00000000000000000001");
        if (catalog.status === "ready") {
            const checkpoint = domain.table("checkpoint_pointer").get("current");
            if (!creation || creation.status !== "ready" || (!first && !checkpoint))
                throw corrupt(catalog.meetingId, "Ready meeting is missing seq one");
            try {
                const projection = loadProjection({ domain });
                this.validateTargetOwnership(projection.sessionOwnership, catalog.meetingId);
            } catch (error) {
                if (error instanceof RepositoryError) throw error;
                if (error instanceof UnsupportedMeetingStateFormatError) {
                    throw new RepositoryError(
                        "SCHEMA_VERSION_UNSUPPORTED",
                        false,
                        catalog.meetingId,
                        "Meeting state format is unsupported"
                    );
                }
                throw corrupt(catalog.meetingId, "Ready commit chain is invalid");
            }
            return;
        }
        if (!first && creation?.status === "creation_failed") {
            await this.catalog.table("meetings").put(key, {
                ...catalog,
                status: "creation_failed",
                updatedAt: creation.updatedAt,
                failureCode: creation.failureCode
            });
            return;
        }
        if (!first) {
            if (creation && creation.status !== "creating")
                throw corrupt(catalog.meetingId, "Creating record status is invalid");
            return;
        }
        if (!creation) throw corrupt(catalog.meetingId, "Seq one has no creation record");
        let projection;
        try {
            projection = loadProjection({ domain });
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            if (error instanceof UnsupportedMeetingStateFormatError) {
                throw new RepositoryError(
                    "SCHEMA_VERSION_UNSUPPORTED",
                    false,
                    catalog.meetingId,
                    "Meeting state format is unsupported"
                );
            }
            throw corrupt(catalog.meetingId, "Creating commit chain is invalid");
        }
        if (
            first.seq !== 1 ||
            first.previousSeq !== 0 ||
            first.previousDigest !== null ||
            first.operation !== "create.complete" ||
            !projection.snapshot ||
            projection.snapshot.meetingId !== catalog.meetingId ||
            projection.bootstrap.status !== "ready"
        )
            throw corrupt(catalog.meetingId, "Seq one does not publish a ready meeting");
        this.validateTargetOwnership(projection.sessionOwnership, catalog.meetingId);
        await domain.table("creation").put("current", {
            ...creation,
            status: "ready",
            createResult: projection.bootstrap.createResult ?? null,
            updatedAt: projection.bootstrap.updatedAt,
            failureCode: null
        });
        await this.catalog.table("meetings").put(key, {
            ...catalog,
            status: "ready",
            updatedAt: projection.bootstrap.updatedAt,
            failureCode: null
        });
    }

    private validateTargetOwnership(
        ownerships: Readonly<
            Record<string, { id?: string; meetingId?: string; identityId?: string }>
        >,
        meetingId: string
    ): void {
        if (this.codec === undefined) return;
        for (const ownership of Object.values(ownerships))
            if (!ownership.id || ownership.meetingId !== meetingId || !ownership.identityId)
                throw new RepositoryError(
                    "RECOVERY_UNAVAILABLE",
                    false,
                    meetingId,
                    "Target Session ownership is incomplete"
                );
    }

    async close(): Promise<void> {
        if (this.closePromise) return this.closePromise;
        this.closed = true;
        this.closePromise = (async () => {
            let failure: unknown;
            for (const [, repository] of [...this.opened.entries()].sort(([left], [right]) =>
                left.localeCompare(right)
            ))
                try {
                    await repository.close();
                } catch (error) {
                    failure ??= error;
                }
            try {
                await this.catalog.close();
            } catch (error) {
                failure ??= error;
            }
            if (failure) throw failure;
        })();
        return this.closePromise;
    }

    private ensureOpen(): void {
        if (this.closed) throw new Error("Domain repository registry is closed");
    }
}
