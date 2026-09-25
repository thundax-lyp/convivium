import { createCommitRecord } from "@/repository/domain/projection.js";
import { peerBindings } from "../fixtures/peer-ownership.js";
import { meetingDomainName } from "@/repository/domain/keys.js";
import type { MeetingDomain } from "@/repository/domain/specs.js";
import type { Domain, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { describe, expect, it } from "vitest";
import {
    DomainRepositoryRegistry,
    type DomainFacilityPort
} from "@/repository/domain/domain-repository-registry.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.js";
import { decodeMeetingState, encodeMeetingState } from "@/repository/domain/meeting-state-codec.js";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state.js";

const allow = { validateCreate: () => undefined, validateCommand: () => undefined };
const codec = { encode: encodeMeetingState, decode: decodeMeetingState };
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
        for (let i = 0; i < 4; i++)
            state.identities.push({ ...state.identities[1], id: `extra-${i}` });
        const create = {
            requestId: "create-target",
            requestHash: "create-target-hash",
            authorization,
            initialState: state,
            ...peerBindings(state.id, state.identities),
            createdAt: 1
        };
        const created = await first.openMeeting({ meetingId: state.id, create });
        for (const binding of create.initialOwnership)
            await created.recordSessionOwnership({ ...binding, lifecycleStatus: "active" }, 2);
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
        const identities = Array.from({ length: 7 }, (_, i) => ({
            id: `identity-${i}`,
            roles: ["contributor"]
        }));
        const create = {
            requestId: "create-legacy",
            requestHash: "create-legacy-hash",
            authorization,
            initialState: { count: 0, identities },
            ...peerBindings("meeting-legacy", identities),
            createdAt: 1
        };
        const repository = await legacy.openMeeting({ meetingId: "meeting-legacy", create });
        for (const binding of create.initialOwnership)
            await repository.recordSessionOwnership({ ...binding, lifecycleStatus: "active" }, 2);
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
        for (let i = 0; i < 4; i++)
            state.identities.push({ ...state.identities[1], id: `extra-${i}` });
        const create = {
            requestId: "create-ownership",
            requestHash: "create-ownership-hash",
            authorization,
            initialState: state,
            ...peerBindings(state.id, state.identities),
            createdAt: 1
        };
        const repository = await first.openMeeting({ meetingId: state.id, create });
        for (const binding of create.initialOwnership)
            await repository.recordSessionOwnership({ ...binding, lifecycleStatus: "active" }, 2);
        await repository.completeCreate(create);
        const domain = (await facility.open({
            name: meetingDomainName(state.id)
        } as never)) as MeetingDomain;
        const [key, original] = [...domain.table("commits").entries()][0];
        const broken = structuredClone(original);
        const projection = broken.patch[0].value as unknown as {
            sessionOwnership: Record<string, object>;
        };
        Reflect.deleteProperty(Object.values(projection.sessionOwnership)[0], "identityId");
        await domain.table("commits").put(
            key,
            createCommitRecord({
                formatVersion: broken.formatVersion,
                seq: broken.seq,
                previousSeq: broken.previousSeq,
                previousDigest: broken.previousDigest,
                operation: broken.operation,
                patch: broken.patch,
                committedAt: broken.committedAt
            })
        );
        const before = [...domain.table("commits").entries()];

        const target = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator: allow,
            codec
        });
        await expect(target.openMeeting({ meetingId: state.id })).rejects.toMatchObject({
            code: "CORRUPT_DATABASE"
        });
        expect([...domain.table("commits").entries()]).toEqual(before);
        await target.close();
    });
});
