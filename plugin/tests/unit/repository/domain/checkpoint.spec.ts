import { describe, expect, it } from "vitest";
import {
    encodeCanonicalJson,
    sha256Hex
} from "../../../../src/repository/domain/canonical-json.js";
import { generation, seqKey } from "../../../../src/repository/domain/keys.js";
import {
    createCommitRecord,
    createProjection,
    loadProjection,
    projectionDigest
} from "../../../../src/repository/domain/projection.js";
import {
    collectApplicationOrphans,
    writeCheckpoint
} from "../../../../src/repository/domain/checkpoint.js";
import { createFakeMeetingDomain } from "../../../../tests/fixtures/domain-storage.js";

const makeProjection = (requestId = "r") =>
    createProjection({
        snapshot: null,
        bootstrap: {
            status: "ready",
            createRequestId: requestId,
            requestHash: "h",
            createdAt: 1,
            updatedAt: 1
        },
        sessionOwnership: {}
    });
const commit = (
    seq: number,
    previousDigest: string | null,
    patch: Parameters<typeof createCommitRecord>[0]["patch"] = []
) =>
    createCommitRecord({
        formatVersion: 1,
        seq,
        previousSeq: seq - 1,
        previousDigest,
        operation: "test",
        patch,
        committedAt: seq
    });
const pageKey = (gen: string, index: number) => `${gen}_${index.toString().padStart(10, "0")}`;

describe("application checkpoint", () => {
    it("loads a continuous commit tail without a checkpoint", () => {
        const first = commit(1, null, [{ op: "set", path: [], value: makeProjection() }]);
        const second = commit(2, first.digest, [
            { op: "set", path: ["bootstrap", "updatedAt"], value: 2 }
        ]);
        const domain = createFakeMeetingDomain({
            initial: {
                commits: new Map([
                    [seqKey(1), first],
                    [seqKey(2), second]
                ])
            }
        });
        expect(loadProjection({ domain }).bootstrap.updatedAt).toBe(2);
    });
    it("writes more than one bounded page before root and pointer", async () => {
        const domain = createFakeMeetingDomain();
        const projection = makeProjection("x".repeat(30_000));
        const pointer = await writeCheckpoint({ domain, projection, baseSeq: 1, createdAt: 1 });
        const puts = domain.putCalls;
        expect(puts.at(-2)?.table).toBe("checkpoint_roots");
        expect(puts.at(-1)?.table).toBe("checkpoint_pointer");
        expect(puts.slice(0, -2).every((call) => call.table === "checkpoint_pages")).toBe(true);
        expect(puts.every((call) => call.value !== projection)).toBe(true);
        expect(
            puts
                .filter((call) => call.table === "checkpoint_pages")
                .every((call) => encodeCanonicalJson(call.value).byteLength < 98_304)
        ).toBe(true);
        expect(pointer.generation).toContain("_");
    });
    it("rejects a missing referenced page", async () => {
        const domain = createFakeMeetingDomain();
        const pointer = await writeCheckpoint({
            domain,
            projection: makeProjection(),
            baseSeq: 1,
            createdAt: 1
        });
        await domain.table("checkpoint_pages").delete(pageKey(pointer.generation, 0));
        expect(() => loadProjection({ domain })).toThrow();
    });
    it("rejects page, root, pointer and projection digest mismatch", async () => {
        for (const kind of ["page", "root", "pointer", "projection"] as const) {
            const domain = createFakeMeetingDomain();
            const pointer = await writeCheckpoint({
                domain,
                projection: makeProjection(),
                baseSeq: 1,
                createdAt: 1
            });
            if (kind === "page") {
                const key = pageKey(pointer.generation, 0);
                const page = domain.table("checkpoint_pages").get(key)!;
                await domain
                    .table("checkpoint_pages")
                    .put(key, { ...page, payloadDigest: "0".repeat(64) });
            } else if (kind === "root") {
                const root = domain.table("checkpoint_roots").get(pointer.generation)!;
                await domain
                    .table("checkpoint_roots")
                    .put(pointer.generation, { ...root, projectionDigest: "0".repeat(64) });
            } else if (kind === "pointer")
                await domain
                    .table("checkpoint_pointer")
                    .put("current", { ...pointer, rootDigest: "0".repeat(64) });
            else {
                const root = domain.table("checkpoint_roots").get(pointer.generation)!;
                await domain
                    .table("checkpoint_roots")
                    .put(pointer.generation, {
                        ...root,
                        projectionDigest: projectionDigest(makeProjection("different"))
                    });
            }
            expect(() => loadProjection({ domain })).toThrow();
        }
    });
    it("refuses a stale generation without publishing or deleting", async () => {
        const domain = createFakeMeetingDomain();
        const high = await writeCheckpoint({
            domain,
            projection: makeProjection(),
            baseSeq: 2,
            createdAt: 1
        });
        const calls = domain.deleteCalls.length;
        await expect(
            writeCheckpoint({
                domain,
                projection: makeProjection("older"),
                baseSeq: 1,
                createdAt: 1
            })
        ).rejects.toThrow();
        expect(domain.table("checkpoint_pointer").get("current")).toEqual(high);
        expect(domain.deleteCalls.length).toBe(calls);
    });
    it("keeps the old pointer when a checkpoint page put fails", async () => {
        const domain = createFakeMeetingDomain();
        const old = await writeCheckpoint({
            domain,
            projection: makeProjection(),
            baseSeq: 1,
            createdAt: 1
        });
        const next = makeProjection("next");
        domain.failNextPut("checkpoint_pages", pageKey(generation(2, projectionDigest(next)), 0));
        await expect(
            writeCheckpoint({ domain, projection: next, baseSeq: 2, createdAt: 2 })
        ).rejects.toThrow();
        expect(domain.table("checkpoint_pointer").get("current")).toEqual(old);
    });
    it("keeps the old pointer when checkpoint root put fails", async () => {
        const domain = createFakeMeetingDomain();
        const old = await writeCheckpoint({
            domain,
            projection: makeProjection(),
            baseSeq: 1,
            createdAt: 1
        });
        const next = makeProjection("next");
        domain.failNextPut("checkpoint_roots", generation(2, projectionDigest(next)));
        await expect(
            writeCheckpoint({ domain, projection: next, baseSeq: 2, createdAt: 2 })
        ).rejects.toThrow();
        expect(domain.table("checkpoint_pointer").get("current")).toEqual(old);
    });
    it("keeps the old pointer when pointer put fails", async () => {
        const domain = createFakeMeetingDomain();
        const old = await writeCheckpoint({
            domain,
            projection: makeProjection(),
            baseSeq: 1,
            createdAt: 1
        });
        const next = makeProjection("next");
        domain.failNextPut("checkpoint_pointer", "current");
        await expect(
            writeCheckpoint({ domain, projection: next, baseSeq: 2, createdAt: 2 })
        ).rejects.toThrow();
        expect(domain.table("checkpoint_pointer").get("current")).toEqual(old);
    });
    it("keeps new truth when obsolete commit deletion fails", async () => {
        const first = commit(1, null, [{ op: "set", path: [], value: makeProjection() }]);
        const domain = createFakeMeetingDomain({
            initial: { commits: new Map([[seqKey(1), first]]) }
        });
        domain.failNextDelete("commits", seqKey(1));
        const pointer = await writeCheckpoint({
            domain,
            projection: makeProjection(),
            baseSeq: 1,
            createdAt: 1
        });
        expect(domain.table("checkpoint_pointer").get("current")).toEqual(pointer);
        expect(domain.table("commits").get(seqKey(1))).toEqual(first);
        expect(loadProjection({ domain })).toEqual(makeProjection());
    });
    it("collects only generations not named by the current pointer", async () => {
        const domain = createFakeMeetingDomain();
        const current = "00000000000000000001_current";
        const orphan = "00000000000000000002_orphan";
        const raw = new TextEncoder().encode("x");
        const page = {
            formatVersion: 1 as const,
            generation: orphan,
            baseSeq: 2,
            pageIndex: 0,
            pageCount: 1,
            payloadBase64: Buffer.from(raw).toString("base64"),
            payloadDigest: sha256Hex(raw)
        };
        const root = {
            formatVersion: 1 as const,
            generation: orphan,
            baseSeq: 2,
            pageCount: 1,
            totalBytes: 1,
            projectionDigest: "0".repeat(64),
            createdAt: 1
        };
        await domain
            .table("checkpoint_pages")
            .put(pageKey(current, 0), { ...page, generation: current });
        await domain.table("checkpoint_pages").put(pageKey(orphan, 0), page);
        await domain.table("checkpoint_roots").put(current, { ...root, generation: current });
        await domain.table("checkpoint_roots").put(orphan, root);
        await collectApplicationOrphans({ domain, keepGeneration: current });
        expect([...domain.table("checkpoint_pages").keys()]).toEqual([pageKey(current, 0)]);
        expect([...domain.table("checkpoint_roots").keys()]).toEqual([current]);
    });
});
