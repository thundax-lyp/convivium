import { describe, expect, it } from "vitest";
import {
    createFakeCatalogDomain,
    createFakeMeetingDomain
} from "../../../../tests/fixtures/domain-storage.js";

const commit = {
    formatVersion: 1 as const,
    seq: 1,
    previousSeq: 0,
    previousDigest: null,
    operation: "create",
    patch: [],
    committedAt: 1,
    digest: "0".repeat(64)
};
const catalog = {
    formatVersion: 1 as const,
    teamId: "t",
    meetingId: "m",
    domainName: "d",
    status: "ready" as const,
    createRequestId: "r",
    requestHash: "h",
    createdAt: 1,
    updatedAt: 1,
    failureCode: null
};

describe("domain storage fixture", () => {
    it("validates initial records through the real DomainSpec schemas", () => {
        const domain = createFakeMeetingDomain({
            name: "convivium_m_test",
            initial: { commits: new Map([["00000000000000000001", commit]]) }
        });
        expect(domain.table("commits").get("00000000000000000001")).toEqual(commit);
        expect(() =>
            createFakeCatalogDomain({ meetings: new Map([["k", { ...catalog, extra: true }]]) })
        ).toThrow();
        expect(() =>
            createFakeCatalogDomain({
                meetings: new Map([["k", { ...catalog, meetingId: undefined }]])
            })
        ).toThrow();
    });
    it("records ordered put and delete calls through one shared controller", async () => {
        const domain = createFakeMeetingDomain();
        await domain.table("commits").put("k", commit);
        await domain.table("checkpoint_roots").put("r", {
            formatVersion: 1,
            generation: "g",
            baseSeq: 1,
            pageCount: 1,
            totalBytes: 1,
            projectionDigest: "0".repeat(64),
            createdAt: 1
        });
        await domain.table("commits").delete("k");
        expect(domain.putCalls.map((call) => [call.table, call.key])).toEqual([
            ["commits", "k"],
            ["checkpoint_roots", "r"]
        ]);
        expect(domain.deleteCalls).toEqual([{ table: "commits", key: "k" }]);
        const keys = domain.table("commits").keys();
        await domain.table("commits").put("next", commit);
        expect([...keys]).toEqual([]);
    });
    it("consumes exact put and delete failures without mutating table state", async () => {
        const domain = createFakeMeetingDomain();
        domain.failNextPut("commits", "k");
        await expect(domain.table("commits").put("k", commit)).rejects.toThrow();
        expect(domain.table("commits").get("k")).toBeUndefined();
        await domain.table("commits").put("k", commit);
        domain.failNextDelete("commits", "k");
        await expect(domain.table("commits").delete("k")).rejects.toThrow();
        expect(domain.table("commits").get("k")).toEqual(commit);
        await domain.table("commits").delete("k");
        expect(() => domain.failNextPut("commits", "a")).not.toThrow();
        expect(() => domain.failNextPut("commits", "b")).toThrow();
    });
});
