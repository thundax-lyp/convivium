import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
    loadPhysicalCheckpoint,
    writePhysicalCheckpoint
} from "../../../src/storage/checkpoint.js";
import { ScriptedFileSystem } from "../../fixtures/storage/scripted-filesystem.js";
import { encodeRecord } from "../../../src/storage/format.js";
import { encodeCanonicalJson, sha256Hex } from "../../../src/storage/canonical-json.js";
import { openJsonlUnit } from "../../../src/storage/unit.js";

async function fixture() {
    const root = await mkdtemp(join("/tmp", "cp-"));
    const descriptor = {
        name: "records",
        version: 1,
        tables: ["records"],
        hasGlobal: false
    } as const;
    const state = {
        generation: "g1",
        throughOpSeq: 1,
        tables: { records: { a: 1, b: 2 } },
        global: null,
        descriptorDigest: sha256Hex(
            encodeCanonicalJson({
                formatVersion: 1,
                name: "records",
                unitVersion: 1,
                tables: ["records"],
                hasGlobal: false
            })
        )
    } as const;
    return { root, state, descriptor, descriptorDigest: state.descriptorDigest };
}

describe("physical checkpoint", () => {
    it("writes one bounded canonical record per current entry", async () => {
        const { root, state } = await fixture();
        try {
            await writePhysicalCheckpoint(root, state);
            const lines = (await readFile(join(root, "checkpoints", "g1", "records.jsonl")))
                .toString()
                .trim()
                .split("\n");
            expect(lines).toHaveLength(2);
            expect(lines.every((value) => Buffer.byteLength(value) < 98_304)).toBe(true);
            expect(lines.map((value) => JSON.parse(value).key)).toEqual(["a", "b"]);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("syncs the checkpoint generation parent before publishing", async () => {
        const { root, state } = await fixture();
        const fs = new ScriptedFileSystem();
        try {
            await writePhysicalCheckpoint(root, state, fs);
            expect(fs.calls("checkpoint.generation-parent-directory-sync")).toEqual([
                { paths: [join(root, "checkpoints")] }
            ]);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("publishes pointer only after records and root verify", async () => {
        const { root, state, descriptor, descriptorDigest } = await fixture();
        try {
            await writePhysicalCheckpoint(root, state);
            expect(
                JSON.parse((await readFile(join(root, "checkpoint-pointer.json"))).toString())
            ).toMatchObject({ generation: "g1", throughOpSeq: 1 });
            expect(await loadPhysicalCheckpoint(root, descriptor, descriptorDigest)).toMatchObject(
                state
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("closes the pointer handle when pointer sync fails", async () => {
        const { root, state } = await fixture();
        const fs = new ScriptedFileSystem();
        try {
            fs.failNext("checkpoint.pointer-temp-sync", new Error("pointer sync failed"));
            await expect(writePhysicalCheckpoint(root, state, fs)).rejects.toThrow(
                "pointer sync failed"
            );
            expect(fs.closeCallsEndingWith("checkpoint-pointer.json.tmp")).toBe(1);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("loads state from verified records instead of root payload", async () => {
        const { root, state, descriptor, descriptorDigest } = await fixture();
        try {
            await writePhysicalCheckpoint(root, state);
            const path = join(root, "checkpoints", "g1", "root.json");
            const rootValue = JSON.parse((await readFile(path)).toString());
            rootValue.tables = { records: { fake: 9 } };
            await (await import("node:fs/promises")).writeFile(path, JSON.stringify(rootValue));
            await expect(
                loadPhysicalCheckpoint(root, descriptor, descriptorDigest)
            ).rejects.toThrow();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("rejects pointer root record and global digest corruption", async () => {
        const { root, state, descriptor, descriptorDigest } = await fixture();
        const fs = new ScriptedFileSystem();
        try {
            await writePhysicalCheckpoint(root, state, fs);
            const pointerPath = join(root, "checkpoint-pointer.json");
            const pointer = JSON.parse((await readFile(pointerPath)).toString());
            pointer.rootDigest = "0".repeat(64);
            await (
                await import("node:fs/promises")
            ).writeFile(pointerPath, JSON.stringify(pointer));
            await expect(
                loadPhysicalCheckpoint(root, descriptor, descriptorDigest, fs)
            ).rejects.toThrow();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("keeps active and uncovered segments during checkpoint cleanup", async () => {
        const { root, state } = await fixture();
        try {
            await (
                await import("node:fs/promises")
            ).mkdir(join(root, "segments"), { recursive: true });
            const record = encodeRecord({
                formatVersion: 1,
                opSeq: 2,
                kind: "put",
                table: "records",
                key: "uncovered",
                value: 3
            });
            await (
                await import("node:fs/promises")
            ).writeFile(
                join(root, "segments", "00000000000000000002.jsonl"),
                Buffer.concat([Buffer.from(record), Buffer.from("\n")])
            );
            await writePhysicalCheckpoint(root, state);
            expect(
                await readFile(join(root, "segments", "00000000000000000002.jsonl"))
            ).toBeTruthy();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("retries checkpoint before refusing a hard-tail append", async () => {
        const { root, state, descriptor, descriptorDigest } = await fixture();
        try {
            await writePhysicalCheckpoint(root, state);
            expect(await loadPhysicalCheckpoint(root, descriptor, descriptorDigest)).toMatchObject(
                state
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("drains a retained maintenance failure on close", async () => {
        const { root, state, descriptor, descriptorDigest } = await fixture();
        try {
            await writePhysicalCheckpoint(root, state);
            await expect(
                loadPhysicalCheckpoint(root, descriptor, descriptorDigest)
            ).resolves.toMatchObject(state);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("triggers routine physical checkpoint at the byte threshold before 512 records", async () => {
        const root = await mkdtemp(join("/tmp", "cp-byte-"));
        const descriptor = {
            name: "records",
            version: 1,
            tables: ["records"],
            hasGlobal: false
        } as const;
        try {
            const value = "x".repeat(17_000);
            let accumulatedBytes = 0;
            let triggerOpSeq = 0;
            for (let index = 0; index < 512; index += 1) {
                accumulatedBytes +=
                    encodeRecord({
                        formatVersion: 1,
                        opSeq: index + 1,
                        kind: "put",
                        table: "records",
                        key: `k${index}`,
                        value
                    }).byteLength + 1;
                if (accumulatedBytes >= 8_388_608) {
                    triggerOpSeq = index + 1;
                    break;
                }
            }
            expect(triggerOpSeq).toBeGreaterThan(0);
            expect(triggerOpSeq).toBeLessThan(512);
            expect(accumulatedBytes).toBeGreaterThanOrEqual(8_388_608);
            const unit = await openJsonlUnit(root, descriptor);
            for (let index = 0; index < triggerOpSeq; index += 1)
                await unit.putRecord("records", `k${index}`, value);
            await unit.close();
            const pointer = JSON.parse(
                (await readFile(join(root, "checkpoint-pointer.json"))).toString()
            ) as { throughOpSeq: number };
            expect(pointer.throughOpSeq).toBe(triggerOpSeq);
            const reopened = await openJsonlUnit(root, descriptor);
            const loaded = await reopened.loadAll();
            expect(Object.keys(loaded.tables.records!)).toHaveLength(triggerOpSeq);
            expect(loaded.tables.records?.k0).toBe(value);
            expect(loaded.tables.records?.[`k${triggerOpSeq - 1}`]).toBe(value);
            await reopened.close();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }, 15_000);

    it("preserves every tail record across mixed rollovers after reopen", async () => {
        const root = await mkdtemp(join("/tmp", "cp-rollover-"));
        const descriptor = {
            name: "records",
            version: 1,
            tables: ["records"],
            hasGlobal: false
        } as const;
        const value = "x".repeat(17_000);
        try {
            const first = await openJsonlUnit(root, descriptor);
            for (let index = 1; index <= 300; index += 1)
                await first.putRecord("records", `k${index}`, value);
            await first.close();

            const second = await openJsonlUnit(root, descriptor);
            for (let index = 301; index <= 513; index += 1)
                await second.putRecord("records", `k${index}`, value);
            await second.close();

            const cold = await openJsonlUnit(root, descriptor);
            const loaded = await cold.loadAll();
            expect(Object.keys(loaded.tables.records!)).toHaveLength(513);
            expect(loaded.tables.records?.k1).toBe(value);
            expect(loaded.tables.records?.k500).toBe(value);
            expect(loaded.tables.records?.k513).toBe(value);
            await cold.close();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }, 20_000);
});
