import type { Domain, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { describe, expect, it } from "vitest";
import {
    DomainRepositoryRegistry,
    type DomainFacilityPort
} from "../../src/repository/domain/domain-repository-registry.js";
import { catalogKey, meetingDomainName } from "../../src/repository/domain/keys.js";
import { RepositoryError } from "../../src/repository/errors.js";
import {
    createFakeCatalogDomain,
    createFakeMeetingDomain,
    type FakeCatalogDomain
} from "../fixtures/domain-storage.js";

const allow = { validateCreate: () => undefined, validateCommand: () => undefined };

function catalogRecord(teamId: string, meetingId: string) {
    return {
        formatVersion: 1 as const,
        teamId,
        meetingId,
        domainName: meetingDomainName(teamId, meetingId),
        status: "creating" as const,
        createRequestId: `create-${meetingId}`,
        requestHash: `hash-${meetingId}`,
        createdAt: 1,
        updatedAt: 1,
        failureCode: null
    };
}

function creationRecord(teamId: string, meetingId: string) {
    return {
        formatVersion: 1 as const,
        teamId,
        meetingId,
        status: "creating" as const,
        requestId: `create-${meetingId}`,
        requestHash: `hash-${meetingId}`,
        authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
        initialState: {},
        createResult: null,
        initialOutbox: [],
        sessionOwnership: {},
        createdAt: 1,
        updatedAt: 1,
        failureCode: null
    };
}

class Facility implements DomainFacilityPort {
    readonly calls: string[] = [];
    readonly closeOrder: string[] = [];
    private readonly domains = new Map<string, Domain<DomainSpec>>();
    private readonly failures = new Set<string>();
    private readonly blocks = new Map<string, Promise<void>>();

    constructor(readonly catalog: FakeCatalogDomain) {
        this.register(catalog);
    }

    register<S extends DomainSpec>(domain: Domain<S>): void {
        const wrapped = new Proxy(domain, {
            get: (target, property, receiver) => {
                if (property === "close")
                    return async () => {
                        this.closeOrder.push(target.name);
                        await target.close();
                    };
                return Reflect.get(target, property, receiver);
            }
        });
        this.domains.set(domain.name, wrapped as Domain<DomainSpec>);
    }

    failOnce(name: string): void {
        this.failures.add(name);
    }

    block(name: string, pending: Promise<void>): void {
        this.blocks.set(name, pending);
    }

    async open<S extends DomainSpec>(spec: S): Promise<Domain<S>> {
        this.calls.push(spec.name);
        const pending = this.blocks.get(spec.name);
        if (pending) {
            this.blocks.delete(spec.name);
            await pending;
        }
        if (this.failures.delete(spec.name)) throw new Error("scripted open failure");
        const domain = this.domains.get(spec.name);
        if (!domain) throw new Error(`missing fake domain: ${spec.name}`);
        return domain as Domain<S>;
    }
}

function fixture(records: ReturnType<typeof catalogRecord>[] = []) {
    const catalog = createFakeCatalogDomain({
        meetings: new Map(
            records.map((record) => [catalogKey(record.teamId, record.meetingId), record])
        )
    });
    const facility = new Facility(catalog);
    for (const record of records)
        facility.register(
            createFakeMeetingDomain({
                name: record.domainName,
                initial: {
                    creation: new Map([
                        ["current", creationRecord(record.teamId, record.meetingId)]
                    ])
                }
            })
        );
    return { catalog, facility };
}

describe("DomainRepositoryRegistry contract", () => {
    it("opens the catalog once and returns a deterministic sorted list", async () => {
        const records = [
            catalogRecord("team-b", "meeting-2"),
            catalogRecord("team-a", "meeting-2"),
            catalogRecord("team-a", "meeting-1")
        ];
        const { facility } = fixture(records);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });

        expect(registry.listMeetings().map(({ teamId, meetingId }) => [teamId, meetingId])).toEqual(
            [
                ["team-a", "meeting-1"],
                ["team-a", "meeting-2"],
                ["team-b", "meeting-2"]
            ]
        );
        expect(facility.calls.filter((name) => name === "convivium_catalog")).toHaveLength(1);
        await registry.close();
    });

    it("shares one in-flight open for the same CatalogKey", async () => {
        const record = catalogRecord("team-1", "meeting-1");
        const { facility } = fixture([record]);
        let release = () => undefined;
        const pending = new Promise<void>((resolve) => {
            release = resolve;
        });
        facility.block(record.domainName, pending);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });

        const first = registry.openMeeting({ teamId: "team-1", meetingId: "meeting-1" });
        const second = registry.openMeeting({ teamId: "team-1", meetingId: "meeting-1" });
        release();
        expect(await first).toBe(await second);
        expect(facility.calls.filter((name) => name === record.domainName)).toHaveLength(1);
        await registry.close();
    });

    it("publishes a durable creation failure left behind a creating catalog", async () => {
        const record = catalogRecord("team-1", "meeting-1");
        const failedCreation = {
            ...creationRecord("team-1", "meeting-1"),
            status: "creation_failed" as const,
            updatedAt: 2,
            failureCode: "SESSION_FAILED"
        };
        const catalog = createFakeCatalogDomain({
            meetings: new Map([[catalogKey("team-1", "meeting-1"), record]])
        });
        const facility = new Facility(catalog);
        facility.register(
            createFakeMeetingDomain({
                name: record.domainName,
                initial: { creation: new Map([["current", failedCreation]]) }
            })
        );
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });

        await expect(
            registry.openMeeting({ teamId: "team-1", meetingId: "meeting-1" })
        ).resolves.toBeTruthy();
        expect(catalog.table("meetings").get(catalogKey("team-1", "meeting-1"))).toMatchObject({
            status: "creation_failed",
            updatedAt: 2,
            failureCode: "SESSION_FAILED"
        });
        await registry.close();
    });

    it("removes a rejected in-flight open before retry", async () => {
        const record = catalogRecord("team-1", "meeting-1");
        const { facility } = fixture([record]);
        facility.failOnce(record.domainName);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });

        await expect(
            registry.openMeeting({ teamId: "team-1", meetingId: "meeting-1" })
        ).rejects.toThrow("scripted open failure");
        await expect(
            registry.openMeeting({ teamId: "team-1", meetingId: "meeting-1" })
        ).resolves.toMatchObject({ teamId: "team-1", meetingId: "meeting-1" });
        expect(facility.calls.filter((name) => name === record.domainName)).toHaveLength(2);
        await registry.close();
    });

    it("passes the projection callback to a meeting repository", async () => {
        const { facility } = fixture([catalogRecord("team-1", "meeting-1")]);
        const snapshots: unknown[] = [];
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow,
            onProjectionCommitted: (snapshot) => snapshots.push(snapshot)
        });
        const repository = await registry.openMeeting({
            teamId: "team-1",
            meetingId: "meeting-1",
            create: {
                requestId: "create-meeting-1",
                requestHash: "hash-meeting-1",
                authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
                initialState: { status: "created" },
                createdAt: 1
            }
        });
        await repository.completeCreate({
            requestId: "create-meeting-1",
            requestHash: "hash-meeting-1",
            authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
            initialState: { status: "created" },
            createdAt: 1
        });
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]).toMatchObject({ teamId: "team-1", meetingId: "meeting-1" });
        await registry.close();
    });

    it("rejects cached identity or domainName mismatch", async () => {
        const record = catalogRecord("team-1", "meeting-1");
        const { catalog, facility } = fixture([record]);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });
        await registry.openMeeting({ teamId: "team-1", meetingId: "meeting-1" });
        await catalog.table("meetings").put(catalogKey("team-1", "meeting-1"), {
            ...record,
            domainName: "convivium_m_wrong"
        });

        await expect(
            registry.openMeeting({ teamId: "team-1", meetingId: "meeting-1" })
        ).rejects.toMatchObject<RepositoryError>({ code: "CORRUPT_DATABASE" });
        await registry.close();
    });

    it("closes Meeting domains in domainName order before catalog exactly once", async () => {
        const records = [
            catalogRecord("team-1", "meeting-b"),
            catalogRecord("team-1", "meeting-a")
        ];
        const { facility } = fixture(records);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });
        await registry.openMeeting({ teamId: "team-1", meetingId: "meeting-b" });
        await registry.openMeeting({ teamId: "team-1", meetingId: "meeting-a" });

        await Promise.all([registry.close(), registry.close()]);

        expect(facility.closeOrder).toEqual([
            ...records.map((record) => record.domainName).sort(),
            "convivium_catalog"
        ]);
    });
});
