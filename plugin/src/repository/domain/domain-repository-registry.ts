import type { Domain, DomainFacility, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { RepositoryError } from "../errors.js";
import type { CreateMeetingInput, RepositoryAuthorizationValidator } from "../types.js";
import { DomainMeetingRepository } from "./domain-meeting-repository.js";
import { catalogKey, meetingDomainName } from "./keys.js";
import { loadProjection } from "./projection.js";
import {
    catalogDomainSpec,
    createMeetingDomainSpec,
    type CatalogDomain,
    type MeetingDomain
} from "./specs.js";
import type { CatalogMeetingRecordV1, CreationRecordV1 } from "./schemas.js";

export interface DomainFacilityPort {
    open<S extends DomainSpec>(spec: S): Promise<Domain<S>>;
}

export interface DomainRepositoryRegistryOptions {
    readonly storageDomain: Pick<DomainFacility, "open"> | DomainFacilityPort;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly now?: () => number;
}

export interface OpenDomainMeetingInput {
    readonly teamId: string;
    readonly meetingId: string;
    readonly create?: CreateMeetingInput;
}

function corrupt(meetingId: string, message: string): RepositoryError {
    return new RepositoryError("CORRUPT_DATABASE", false, meetingId, message);
}

function validateCatalogIdentity(
    key: string,
    record: CatalogMeetingRecordV1,
    teamId: string,
    meetingId: string
): void {
    if (
        key !== catalogKey(record.teamId, record.meetingId) ||
        record.teamId !== teamId ||
        record.meetingId !== meetingId ||
        record.domainName !== meetingDomainName(teamId, meetingId)
    )
        throw corrupt(meetingId, "Catalog identity is invalid");
}

function validateCreationIdentity(
    creation: CreationRecordV1,
    catalog: CatalogMeetingRecordV1
): void {
    if (
        creation.teamId !== catalog.teamId ||
        creation.meetingId !== catalog.meetingId ||
        creation.requestId !== catalog.createRequestId ||
        creation.requestHash !== catalog.requestHash
    )
        throw corrupt(catalog.meetingId, "Creation identity is invalid");
}

export class DomainRepositoryRegistry {
    private readonly repositories = new Map<string, Promise<DomainMeetingRepository>>();
    private readonly opened = new Map<string, DomainMeetingRepository>();
    private closePromise: Promise<void> | undefined;
    private closed = false;

    private constructor(
        private readonly storageDomain: DomainFacilityPort,
        private readonly catalog: CatalogDomain,
        private readonly authorizationValidator: RepositoryAuthorizationValidator,
        private readonly now: () => number
    ) {}

    static async open(options: DomainRepositoryRegistryOptions): Promise<DomainRepositoryRegistry> {
        const catalog = await options.storageDomain.open(catalogDomainSpec);
        return new DomainRepositoryRegistry(
            options.storageDomain,
            catalog,
            options.authorizationValidator,
            options.now ?? Date.now
        );
    }

    listMeetings(teamId?: string): CatalogMeetingRecordV1[] {
        this.ensureOpen();
        const records: CatalogMeetingRecordV1[] = [];
        for (const [key, record] of this.catalog.table("meetings").entries()) {
            validateCatalogIdentity(key, record, record.teamId, record.meetingId);
            if (teamId === undefined || record.teamId === teamId)
                records.push(structuredClone(record));
        }
        return records.sort(
            (left, right) =>
                left.teamId.localeCompare(right.teamId) ||
                left.meetingId.localeCompare(right.meetingId)
        );
    }

    async openMeeting(input: OpenDomainMeetingInput): Promise<DomainMeetingRepository> {
        this.ensureOpen();
        const key = catalogKey(input.teamId, input.meetingId);
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
        validateCatalogIdentity(key, catalog, input.teamId, input.meetingId);
        if (repository.teamId !== input.teamId || repository.meetingId !== input.meetingId)
            throw corrupt(input.meetingId, "Cached repository identity is invalid");
        if (input.create) await repository.create(input.create);
        return repository;
    }

    private async openMeetingOnce(
        key: string,
        input: OpenDomainMeetingInput
    ): Promise<DomainMeetingRepository> {
        const catalog = this.catalog.table("meetings").get(key);
        if (!catalog && !input.create)
            throw new RepositoryError(
                "MEETING_NOT_FOUND",
                false,
                input.meetingId,
                "Meeting is not registered"
            );
        if (catalog) {
            validateCatalogIdentity(key, catalog, input.teamId, input.meetingId);
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
        const domainName = catalog?.domainName ?? meetingDomainName(input.teamId, input.meetingId);
        const domain = await this.storageDomain.open(createMeetingDomainSpec(domainName));
        try {
            if (catalog) await this.reconcile(domain, key, catalog);
            const repository = await DomainMeetingRepository.open({
                catalogDomain: this.catalog,
                meetingDomain: domain,
                teamId: input.teamId,
                meetingId: input.meetingId,
                authorizationValidator: this.authorizationValidator,
                now: this.now
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
        catalog: CatalogMeetingRecordV1
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
            if (!creation || creation.status !== "ready" || !first)
                throw corrupt(catalog.meetingId, "Ready meeting is missing seq one");
            try {
                loadProjection({ domain });
            } catch {
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
        } catch {
            throw corrupt(catalog.meetingId, "Creating commit chain is invalid");
        }
        if (
            first.seq !== 1 ||
            first.previousSeq !== 0 ||
            first.previousDigest !== null ||
            first.operation !== "create.complete" ||
            !projection.snapshot ||
            projection.snapshot.teamId !== catalog.teamId ||
            projection.snapshot.meetingId !== catalog.meetingId ||
            projection.bootstrap.status !== "ready"
        )
            throw corrupt(catalog.meetingId, "Seq one does not publish a ready meeting");
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
