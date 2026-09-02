import type { Domain, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { describe, expect, it } from "vitest";
import {
    DomainRepositoryRegistry,
    type DomainFacilityPort
} from "../../src/repository/domain/domain-repository-registry.js";
import { createCommitRecord, createProjection } from "../../src/repository/domain/projection.js";
import { catalogKey, meetingDomainName, seqKey } from "../../src/repository/domain/keys.js";
import { RepositoryError } from "../../src/repository/errors.js";
import {
    createFakeCatalogDomain,
    createFakeMeetingDomain,
    type FakeCatalogDomain,
    type FakeMeetingDomain
} from "../fixtures/domain-storage.js";

const allow = { validateCreate: () => undefined, validateCommand: () => undefined };

function catalogRecord(
    teamId: string,
    meetingId: string,
    status: "creating" | "ready" | "creation_failed" = "creating"
) {
    return {
        formatVersion: 1 as const,
        teamId,
        meetingId,
        domainName: meetingDomainName(teamId, meetingId),
        status,
        createRequestId: `create-${meetingId}`,
        requestHash: `hash-${meetingId}`,
        createdAt: 1,
        updatedAt: 1,
        failureCode: status === "creation_failed" ? "SESSION_FAILED" : null
    };
}

function ownership() {
    return {
        "session-1": {
            sessionId: "session-1",
            parentSessionId: "captain-session-1",
            sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
            provider: "continuable-provider",
            role: "manager" as const,
            lifecycleStatus: "provisioning" as const,
            capabilityStatus: "active" as const,
            createdAt: 2,
            updatedAt: 2
        }
    };
}

function creationRecord(
    teamId: string,
    meetingId: string,
    status: "creating" | "ready" | "creation_failed" = "creating",
    sessions: ReturnType<typeof ownership> | Record<string, never> = {}
) {
    return {
        formatVersion: 1 as const,
        teamId,
        meetingId,
        status,
        requestId: `create-${meetingId}`,
        requestHash: `hash-${meetingId}`,
        authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
        initialState: { count: 0 },
        createResult: status === "ready" ? { meetingId, meetingVersion: 0 } : null,
        initialOutbox: [],
        sessionOwnership: sessions,
        createdAt: 1,
        updatedAt: status === "ready" ? 3 : 1,
        failureCode: status === "creation_failed" ? "SESSION_FAILED" : null
    };
}

function createInput(meetingId: string, requestId = `create-${meetingId}`) {
    return {
        requestId,
        requestHash: requestId === `create-${meetingId}` ? `hash-${meetingId}` : "different-hash",
        authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
        initialState: { count: 0 },
        createdAt: 1
    };
}

function readyDomain(
    teamId: string,
    meetingId: string,
    options: { catalogStatus?: "creating" | "ready"; badDigest?: boolean; gap?: boolean } = {}
) {
    const projection = createProjection({
        snapshot: {
            teamId,
            meetingId,
            version: 0,
            state: { count: 0 },
            createdAt: 3,
            updatedAt: 3
        },
        bootstrap: {
            status: "ready",
            createRequestId: `create-${meetingId}`,
            requestHash: `hash-${meetingId}`,
            createResult: { meetingId, meetingVersion: 0 },
            createdAt: 1,
            updatedAt: 3
        },
        sessionOwnership: {}
    });
    const first = createCommitRecord({
        formatVersion: 1,
        seq: 1,
        previousSeq: 0,
        previousDigest: null,
        operation: "create.complete",
        patch: [{ op: "set", path: [], value: projection }],
        committedAt: 3
    });
    const storedFirst = options.badDigest ? { ...first, digest: "0".repeat(64) } : first;
    const commits = new Map([[seqKey(1), storedFirst]]);
    if (options.gap)
        commits.set(
            seqKey(3),
            createCommitRecord({
                formatVersion: 1,
                seq: 3,
                previousSeq: 2,
                previousDigest: first.digest,
                operation: "gap",
                patch: [],
                committedAt: 4
            })
        );
    const catalog = catalogRecord(teamId, meetingId, options.catalogStatus ?? "ready");
    const meeting = createFakeMeetingDomain({
        name: catalog.domainName,
        initial: {
            creation: new Map([
                [
                    "current",
                    creationRecord(
                        teamId,
                        meetingId,
                        options.catalogStatus === "creating" ? "creating" : "ready"
                    )
                ]
            ]),
            commits
        }
    });
    return { catalog, meeting };
}

class Facility implements DomainFacilityPort {
    private readonly domains = new Map<string, Domain<DomainSpec>>();
    constructor(catalog: FakeCatalogDomain, meetings: FakeMeetingDomain[]) {
        this.domains.set(catalog.name, catalog as Domain<DomainSpec>);
        for (const meeting of meetings)
            this.domains.set(meeting.name, meeting as Domain<DomainSpec>);
    }
    async open<S extends DomainSpec>(spec: S): Promise<Domain<S>> {
        const domain = this.domains.get(spec.name);
        if (!domain) throw new Error(`missing fake domain: ${spec.name}`);
        return domain as Domain<S>;
    }
}

function registryFixture(
    records: ReturnType<typeof catalogRecord>[],
    meetings: FakeMeetingDomain[]
) {
    const catalog = createFakeCatalogDomain({
        meetings: new Map(
            records.map((record) => [catalogKey(record.teamId, record.meetingId), record])
        )
    });
    return { catalog, facility: new Facility(catalog, meetings) };
}

describe("Domain repository recovery", () => {
    it("recreates an absent creation record for the same creating request", async () => {
        const record = catalogRecord("team-1", "meeting-1");
        const meeting = createFakeMeetingDomain({ name: record.domainName });
        const { facility } = registryFixture([record], [meeting]);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });

        const repository = await registry.openMeeting({
            teamId: "team-1",
            meetingId: "meeting-1",
            create: createInput("meeting-1")
        });

        await expect(repository.recover()).resolves.toMatchObject({
            bootstrap: { status: "creating", createRequestId: "create-meeting-1" }
        });
        expect(meeting.table("creation").get("current")?.status).toBe("creating");
        await registry.close();
    });

    it("resumes a creating record for the same request and hash", async () => {
        const record = catalogRecord("team-1", "meeting-1");
        const meeting = createFakeMeetingDomain({
            name: record.domainName,
            initial: { creation: new Map([["current", creationRecord("team-1", "meeting-1")]]) }
        });
        const { facility } = registryFixture([record], [meeting]);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });

        await expect(
            registry.openMeeting({
                teamId: "team-1",
                meetingId: "meeting-1",
                create: createInput("meeting-1")
            })
        ).resolves.toMatchObject({ teamId: "team-1", meetingId: "meeting-1" });
        expect(meeting.putCalls.filter((call) => call.table === "creation")).toHaveLength(0);
        await registry.close();
    });

    it("rejects a different request or hash for a creating catalog record", async () => {
        const record = catalogRecord("team-1", "meeting-1");
        const meeting = createFakeMeetingDomain({ name: record.domainName });
        const { facility } = registryFixture([record], [meeting]);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });

        await expect(
            registry.openMeeting({
                teamId: "team-1",
                meetingId: "meeting-1",
                create: createInput("meeting-1", "different-request")
            })
        ).rejects.toMatchObject<RepositoryError>({ code: "IDEMPOTENCY_CONFLICT" });
        await registry.close();
    });

    it("repairs creating catalog and creation status when seq 1 is valid", async () => {
        const graph = readyDomain("team-1", "meeting-1", { catalogStatus: "creating" });
        const { catalog, facility } = registryFixture([graph.catalog], [graph.meeting]);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });

        const repository = await registry.openMeeting({ teamId: "team-1", meetingId: "meeting-1" });

        await expect(repository.read()).resolves.toMatchObject({
            meetingId: "meeting-1",
            version: 0
        });
        expect(graph.meeting.table("creation").get("current")?.status).toBe("ready");
        expect(catalog.table("meetings").get(catalogKey("team-1", "meeting-1"))?.status).toBe(
            "ready"
        );
        await registry.close();
    });

    it("rejects ready catalog without valid seq 1", async () => {
        const record = catalogRecord("team-1", "meeting-1", "ready");
        const meeting = createFakeMeetingDomain({
            name: record.domainName,
            initial: {
                creation: new Map([["current", creationRecord("team-1", "meeting-1", "ready")]])
            }
        });
        const { facility } = registryFixture([record], [meeting]);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });

        await expect(
            registry.openMeeting({ teamId: "team-1", meetingId: "meeting-1" })
        ).rejects.toMatchObject<RepositoryError>({ code: "CORRUPT_DATABASE" });
        await registry.close();
    });

    it("returns creation_failed and recorded ownership without reconstructing state", async () => {
        const record = catalogRecord("team-1", "meeting-1", "creation_failed");
        const meeting = createFakeMeetingDomain({
            name: record.domainName,
            initial: {
                creation: new Map([
                    [
                        "current",
                        creationRecord("team-1", "meeting-1", "creation_failed", ownership())
                    ]
                ])
            }
        });
        const { facility } = registryFixture([record], [meeting]);
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });
        const repository = await registry.openMeeting({ teamId: "team-1", meetingId: "meeting-1" });

        const recovered = await repository.recover();
        expect(recovered).toMatchObject({
            bootstrap: { status: "creation_failed", failureCode: "SESSION_FAILED" },
            sessionOwnership: [{ sessionId: "session-1" }]
        });
        expect(recovered).not.toHaveProperty("snapshot");
        await registry.close();
    });

    it("rejects invalid catalog or commit schema, digest and sequence gap", async () => {
        const invalidCatalog = catalogRecord("team-1", "meeting-1");
        const catalog = createFakeCatalogDomain({
            meetings: new Map([["wrong-key", invalidCatalog]])
        });
        const catalogRegistry = await DomainRepositoryRegistry.open({
            storageDomain: new Facility(catalog, []),
            authorizationValidator: allow
        });
        expect(() => catalogRegistry.listMeetings()).toThrow();
        await catalogRegistry.close();

        for (const graph of [
            readyDomain("team-1", "meeting-digest", { badDigest: true }),
            readyDomain("team-1", "meeting-gap", { gap: true })
        ]) {
            const { facility } = registryFixture([graph.catalog], [graph.meeting]);
            const registry = await DomainRepositoryRegistry.open({
                storageDomain: facility,
                authorizationValidator: allow
            });
            await expect(
                registry.openMeeting({
                    teamId: graph.catalog.teamId,
                    meetingId: graph.catalog.meetingId
                })
            ).rejects.toMatchObject<RepositoryError>({ code: "CORRUPT_DATABASE" });
            await registry.close();
        }
    });

    it("isolates two Meeting domains", async () => {
        const first = readyDomain("team-1", "meeting-1");
        const second = readyDomain("team-1", "meeting-2");
        const { facility } = registryFixture(
            [first.catalog, second.catalog],
            [first.meeting, second.meeting]
        );
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow,
            now: () => 5
        });
        const firstRepository = await registry.openMeeting({
            teamId: "team-1",
            meetingId: "meeting-1"
        });
        const secondRepository = await registry.openMeeting({
            teamId: "team-1",
            meetingId: "meeting-2"
        });

        await firstRepository.execute({
            requestId: "increment",
            commandKind: "increment",
            authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
            requestHash: "increment-hash",
            expectedMeetingVersion: 0,
            transition: () => ({
                state: { count: 1 },
                result: { count: 1 },
                events: [{ type: "message.added", payload: { count: 1 } }],
                outbox: []
            })
        });
        expect(await firstRepository.read()).toMatchObject({ version: 1, state: { count: 1 } });
        expect(await secondRepository.read()).toMatchObject({ version: 0, state: { count: 0 } });
        expect(first.meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(1);
        expect(second.meeting.putCalls.filter((call) => call.table === "commits")).toHaveLength(0);
        await registry.close();
    });
});
