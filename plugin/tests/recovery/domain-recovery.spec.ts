import type { Domain, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { describe, expect, it } from "vitest";
import {
    DomainRepositoryRegistry,
    type DomainFacilityPort
} from "@/repository/domain/domain-repository-registry.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.js";
import {
    decodeMeetingStateV1,
    encodeMeetingStateV1
} from "@/repository/domain/meeting-state-codec.js";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state.js";

const allow = { validateCreate: () => undefined, validateCommand: () => undefined };
const codec = { encode: encodeMeetingStateV1, decode: decodeMeetingStateV1 };
const authorization = { callerBinding: "local", capabilityId: "local" };

class Facility implements DomainFacilityPort {
    readonly catalog = createFakeCatalogDomain();
    private readonly domains = new Map<string, Domain<DomainSpec>>([
        [this.catalog.name, this.catalog as Domain<DomainSpec>]
    ]);

    async open<S extends DomainSpec>(spec: S): Promise<Domain<S>> {
        let domain = this.domains.get(spec.name);
        if (domain === undefined) {
            domain = createFakeMeetingDomain({ name: spec.name }) as Domain<DomainSpec>;
            this.domains.set(spec.name, domain);
        }
        return domain as Domain<S>;
    }
}

describe("target Domain repository recovery", () => {
    it("reopens a target snapshot with the registry codec", async () => {
        const facility = new Facility();
        const first = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow,
            codec
        });
        const state = makeRunningMeetingStateV1();
        const create = {
            requestId: "create-target",
            requestHash: "create-target-hash",
            authorization,
            initialState: state,
            createdAt: 1
        };
        const created = await first.openMeeting({ meetingId: state.id, create });
        await created.completeCreate(create);

        const reopened = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow,
            codec
        });
        await expect(
            reopened.openMeeting({ meetingId: state.id }).then((repository) => repository.recover())
        ).resolves.toMatchObject({ snapshot: { state } });
        await reopened.close();
    });

    it("fails closed for a legacy snapshot instead of migrating it", async () => {
        const facility = new Facility();
        const legacy = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow
        });
        const create = {
            requestId: "create-legacy",
            requestHash: "create-legacy-hash",
            authorization,
            initialState: { count: 0 },
            createdAt: 1
        };
        const repository = await legacy.openMeeting({ meetingId: "meeting-legacy", create });
        await repository.completeCreate(create);

        const target = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow,
            codec
        });
        await expect(target.openMeeting({ meetingId: "meeting-legacy" })).rejects.toMatchObject({
            code: "SCHEMA_VERSION_UNSUPPORTED"
        });
        await target.close();
    });

    it("rejects incomplete target ownership without rewriting it", async () => {
        const facility = new Facility();
        const first = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow,
            codec
        });
        const state = makeRunningMeetingStateV1();
        const create = {
            requestId: "create-ownership",
            requestHash: "create-ownership-hash",
            authorization,
            initialState: state,
            createdAt: 1
        };
        const repository = await first.openMeeting({ meetingId: state.id, create });
        await repository.recordSessionOwnership({
            sessionId: "session-1",
            parentSessionId: "captain-1",
            sessionLabel: "convivium:meeting-manager:legacy:meeting-v1",
            provider: "spawn",
            role: "manager",
            lifecycleStatus: "provisioning",
            capabilityStatus: "active"
        });
        await repository.completeCreate(create);

        const target = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow,
            codec
        });
        await expect(target.openMeeting({ meetingId: state.id })).rejects.toMatchObject({
            code: "RECOVERY_UNAVAILABLE"
        });
        expect((await repository.recover()).sessionOwnership[0]).not.toHaveProperty("identityId");
        await target.close();
    });
});
