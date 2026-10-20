import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { encodeCanonicalJson, sha256Hex } from "@/utils/index.ts";
import { generation, seqKey } from "@/repository/storage-domain/format/keys.ts";
import {
    createCommitRecord,
    createProjection,
    loadProjection,
    projectionDigest
} from "@/repository/storage-domain/meeting/projection.ts";
import {
    collectApplicationOrphans,
    writeCheckpoint
} from "@/repository/storage-domain/meeting/checkpoint.ts";
import { createFakeMeetingDomain } from "../../../../tests/fixtures/domain-storage.ts";

const makeProjection = (requestId = "r") =>
    createProjection({
        snapshot: null,
        bootstrap: {
            creator: { kind: "local_user" as const, principalId: "local-controller" as const },
            status: "ready",
            createRequestId: requestId,
            requestHash: "h",
            createdAt: 1,
            updatedAt: 1
        },
        preparedDescriptors: [],
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

    it("loads a ready projection from an application checkpoint without seq one", async () => {
        const domain = createFakeMeetingDomain();
        const projection = makeProjection("checkpoint-only");
        await writeCheckpoint({ domain, projection, baseSeq: 1, createdAt: 1 });
        expect(domain.table("commits").get(seqKey(1))).toBeUndefined();
        expect(loadProjection({ domain })).toEqual(projection);
    });
    it("restores a 64 MiB checkpoint within a 512 MiB V8 heap", async () => {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            [
                "--max-old-space-size=512",
                "--experimental-transform-types",
                "--input-type=module",
                "-e",
                `
            import { registerHooks } from "node:module";
            import { resolve } from "node:path";
            import { pathToFileURL } from "node:url";
            import assert from "node:assert/strict";
            registerHooks({ resolve(specifier, context, nextResolve) {
                return nextResolve(specifier.startsWith("@/")
                    ? pathToFileURL(resolve("src", specifier.slice(2))).href : specifier, context);
            }});
            const { createProjection, encodeProjection, loadProjection } = await import("./src/repository/storage-domain/meeting/projection.ts");
            const { writeCheckpoint } = await import("./src/repository/storage-domain/meeting/checkpoint.ts");
            const { createFakeMeetingDomain } = await import("./tests/fixtures/domain-storage.ts");
            const domain = createFakeMeetingDomain();
            const projection = createProjection({ snapshot: null,
                bootstrap: { creator: { kind: "local_user", principalId: "local-controller" },
                    status: "ready", createRequestId: "r", requestHash: "h", createdAt: 1, updatedAt: 1 },
                preparedDescriptors: [], sessionOwnership: {} });
            const overhead = encodeProjection(projection).byteLength - 1;
            projection.bootstrap.requestHash = "x".repeat(64 * 1024 * 1024 - overhead);
            await writeCheckpoint({ domain, projection, baseSeq: 1, createdAt: 1 });
            const restored = loadProjection({ domain });
            assert.equal(restored.bootstrap.requestHash, projection.bootstrap.requestHash);
            assert.equal(restored.bootstrap.createRequestId, "r");
            console.log(encodeProjection(restored).byteLength);
            `
            ],
            { timeout: 30000, maxBuffer: 1024 * 1024 }
        );
        expect(stdout.trim()).toBe("67108864");
    }, 35000);
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
    it.each(["page", "root", "pointer", "projection"] as const)(
        "rejects %s digest mismatch",
        async (kind) => {
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
            } else if (kind === "pointer") {
                await domain
                    .table("checkpoint_pointer")
                    .put("current", { ...pointer, rootDigest: "0".repeat(64) });
            } else {
                const root = domain.table("checkpoint_roots").get(pointer.generation)!;
                const changedRoot = {
                    ...root,
                    projectionDigest: projectionDigest(makeProjection("different"))
                };
                await domain.table("checkpoint_roots").put(pointer.generation, changedRoot);
                await domain.table("checkpoint_pointer").put("current", {
                    ...pointer,
                    rootDigest: sha256Hex(encodeCanonicalJson(changedRoot))
                });
            }
            expect(() => loadProjection({ domain })).toThrow();
        }
    );
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
    it.each([
        ["checkpoint page", "checkpoint_pages", (gen: string) => pageKey(gen, 0)],
        ["checkpoint root", "checkpoint_roots", (gen: string) => gen],
        ["pointer", "checkpoint_pointer", () => "current"]
    ] as const)("keeps the old pointer when %s put fails", async (_name, table, keyFor) => {
        const domain = createFakeMeetingDomain();
        const old = await writeCheckpoint({
            domain,
            projection: makeProjection(),
            baseSeq: 1,
            createdAt: 1
        });
        const next = makeProjection("next");
        domain.failNextPut(table, keyFor(generation(2, projectionDigest(next))));
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
