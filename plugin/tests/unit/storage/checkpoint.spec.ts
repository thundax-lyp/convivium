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
        const { root, state, descriptor, descriptorDigest } = await fixture();
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
        const { root, state, descriptor, descriptorDigest } = await fixture();
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
});
