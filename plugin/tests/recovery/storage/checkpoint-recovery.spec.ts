import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { openJsonlUnit } from "../../../src/storage/unit.js";
import { ScriptedFileSystem, type FaultPoint } from "../../fixtures/storage/scripted-filesystem.js";

const points: readonly FaultPoint[] = [
    "checkpoint.page-write",
    "checkpoint.page-sync",
    "checkpoint.page-directory-sync",
    "checkpoint.root-write",
    "checkpoint.root-sync",
    "checkpoint.root-directory-sync",
    "checkpoint.pointer-temp-write",
    "checkpoint.pointer-temp-sync",
    "checkpoint.pointer-rename",
    "checkpoint.pointer-directory-sync",
    "checkpoint.segment-unlink",
    "checkpoint.page-write",
    "checkpoint.root-write",
    "checkpoint.pointer-temp-write"
];

async function fixture() {
    const root = await mkdtemp(join("/tmp", "checkpoint-"));
    const fs = new ScriptedFileSystem();
    const descriptor = {
        name: "fault_unit",
        version: 1,
        tables: ["records"],
        hasGlobal: false
    } as const;
    const unit = await openJsonlUnit(root, descriptor, fs);
    for (let i = 1; i <= 512; i += 1) await unit.putRecord("records", `k${i}`, i);
    await unit.close();
    expect(
        JSON.parse((await readFile(join(root, "checkpoint-pointer.json"))).toString()).throughOpSeq
    ).toBe(512);
    const reopened = await openJsonlUnit(root, descriptor, fs);
    for (let i = 513; i <= 1023; i += 1) await reopened.putRecord("records", `k${i}`, i);
    return { root, fs, descriptor, unit: reopened };
}

describe("checkpoint recovery", () => {
    it.each(points)("recovers complete truth after %s", async (point, index) => {
        const f = await fixture();
        try {
            const fault = new Error("injected");
            if (index >= 11) f.fs.shortWriteNext(point, 5);
            else f.fs.failNext(point, fault);
            await expect(f.unit.putRecord("records", "k1024", 1024)).resolves.toBeUndefined();
            if (index >= 11) await expect(f.unit.close()).rejects.toThrow("short");
            else await expect(f.unit.close()).rejects.toBe(fault);
            f.fs.assertConsumed();
            const cold = await openJsonlUnit(f.root, f.descriptor, f.fs);
            const all = await cold.loadAll();
            for (let i = 1; i <= 1024; i += 1) expect(all.tables.records[`k${i}`]).toBe(i);
            const pointer = JSON.parse(
                (await readFile(join(f.root, "checkpoint-pointer.json"))).toString()
            );
            expect(pointer.throughOpSeq).toBe(
                point === "checkpoint.pointer-directory-sync" ||
                    point === "checkpoint.segment-unlink"
                    ? 1024
                    : 512
            );
            await cold.close();
        } finally {
            await rm(f.root, { recursive: true, force: true });
        }
    });
});
