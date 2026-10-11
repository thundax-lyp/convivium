import { describe, expect, it } from "vitest";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.ts";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.ts";
import { catalogKey, meetingDomainName } from "@/repository/domain/keys.ts";
import { peerBindings } from "../fixtures/peer-ownership.ts";
import type { Domain, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { appendVersion } from "../fixtures/domain-meeting-repository.ts";

const fixture = async () => {
    const catalog = createFakeCatalogDomain();
    const meeting = createFakeMeetingDomain({ name: meetingDomainName("meeting-delete") });
    const registry = await DomainRepositoryRegistry.open({
        storageDomain: {
            async open<S extends DomainSpec>(spec: S): Promise<Domain<S>> {
                if (![catalog.name, meeting.name].includes(spec.name)) {
                    throw new Error("Unknown fixture domain");
                }
                return (spec.name === catalog.name ? catalog : meeting) as unknown as Domain<S>;
            }
        },
        authorizationValidator: { validateCreate: () => {}, validateCommand: () => {} }
    });
    const identities = [
        { id: "manager", roles: ["manager"] },
        { id: "reviewer", roles: ["evidence_reviewer"] },
        { id: "contributor", roles: ["contributor"] }
    ];
    const create = {
        requestId: "create-delete",
        requestHash: "hash-delete",
        authorization: { callerBinding: "local", capabilityId: "local" },
        initialState: { identities, count: 0 },
        ...peerBindings("meeting-delete", identities),
        createdAt: 1
    };
    const repository = await registry.openMeeting({ meetingId: "meeting-delete", create });
    for (const ownership of create.initialOwnership) {
        await repository.recordSessionOwnership({ ...ownership, lifecycleStatus: "active" }, 2);
    }
    await repository.completeCreate(create);
    return { registry, catalog, meeting, repository, create };
};

describe("Meeting business data deletion", () => {
    it("rejects the original create after deletion without registering a new bootstrap", async () => {
        const { registry, catalog, meeting, create } = await fixture();
        await registry.deleteMeeting("meeting-delete", 0, () => {});
        await expect(
            registry.openMeeting({ meetingId: "meeting-delete", create })
        ).rejects.toMatchObject({ code: "INVALID_STATE" });
        expect(catalog.table("meetings").size).toBe(0);
        expect(meeting.table("creation").size).toBe(0);
        await registry.close();
    });
    it("rejects a queued writer after durable deletion intent so it cannot resurrect records", async () => {
        const { registry, catalog, meeting, repository } = await fixture();
        const block = catalog.blockNextPut("meetings");
        const deleted = registry.deleteMeeting("meeting-delete", 0, () => {});
        await block.entered;
        const rejected = expect(
            appendVersion(repository, { callerBinding: "local", capabilityId: "local" }, 0)
        ).rejects.toMatchObject({ code: "CLOSED" });
        block.release();
        await deleted;
        await rejected;
        expect(meeting.table("commits").size).toBe(0);
        await registry.close();
    });
    it("fails closed during partial cleanup and retries only the committed deletion", async () => {
        const { registry, catalog, meeting, repository } = await fixture();
        meeting.failNextDelete("creation", "current");
        await expect(registry.deleteMeeting("meeting-delete", 0, () => {})).rejects.toThrow(
            "fake delete failure"
        );
        expect(catalog.table("meetings").get(catalogKey("meeting-delete"))?.status).toBe(
            "deleting"
        );
        await expect(repository.recover()).rejects.toMatchObject({ code: "CLOSED" });
        await registry.deleteMeeting("meeting-delete", 0, () => {
            throw new Error("must not read a partial projection");
        });
        expect(meeting.table("creation").size).toBe(0);
        expect(catalog.table("meetings").size).toBe(0);
        await registry.close();
    });

    it("does not revoke readable data when the deletion intent cannot persist", async () => {
        const { registry, catalog, repository } = await fixture();
        catalog.failNextPut("meetings", catalogKey("meeting-delete"));
        await expect(registry.deleteMeeting("meeting-delete", 0, () => {})).rejects.toThrow(
            "fake put failure"
        );
        expect((await repository.recover()).snapshot).toBeTruthy();
        expect(registry.listMeetings()).toHaveLength(1);
        await registry.close();
    });
    it("removes all meeting records and cached reads without touching other catalog entries", async () => {
        const { registry, catalog, meeting, repository } = await fixture();
        const other = {
            ...catalog.table("meetings").get(catalogKey("meeting-delete"))!,
            meetingId: "other",
            domainName: meetingDomainName("other")
        };
        await catalog.table("meetings").put(catalogKey("other"), other);
        await registry.deleteMeeting("meeting-delete", 0, () => {});
        expect(registry.listMeetings().map((item) => item.meetingId)).toEqual(["other"]);
        for (const name of [
            "creation",
            "commits",
            "checkpoint_pages",
            "checkpoint_roots",
            "checkpoint_pointer"
        ] as const) {
            expect(meeting.table(name).size).toBe(0);
        }
        await expect(repository.recover()).rejects.toMatchObject({ code: "CLOSED" });
        await expect(registry.openMeeting({ meetingId: "meeting-delete" })).rejects.toMatchObject({
            code: "MEETING_NOT_FOUND"
        });
        await registry.close();
    });

    it("rejects stale versions and failed eligibility without removing any records", async () => {
        const { registry, meeting } = await fixture();
        await expect(registry.deleteMeeting("meeting-delete", 9, () => {})).rejects.toMatchObject({
            code: "VERSION_CONFLICT"
        });
        await expect(
            registry.deleteMeeting("meeting-delete", 0, () => {
                throw new Error("pending work");
            })
        ).rejects.toThrow("pending work");
        expect(registry.listMeetings()).toHaveLength(1);
        expect(meeting.table("creation").get("current")).toBeTruthy();
        await registry.close();
    });
});
