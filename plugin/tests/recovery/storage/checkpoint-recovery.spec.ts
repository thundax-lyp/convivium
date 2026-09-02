import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { openJsonlUnit } from "../../../src/storage/unit.js";
import { ScriptedFileSystem, type FaultPoint } from "../../fixtures/storage/scripted-filesystem.js";

type Additional =
    | "orphan-generation-ignored"
    | "temp-absent"
    | "old-pointer-unchanged"
    | "new-generation-verifies"
    | "covered-segment-remains-ignored"
    | "partial-orphan-ignored"
    | "partial-temp-absent-old-pointer-unchanged";

const namedCases = [
    {
        case: "checkpoint.page-write",
        point: "checkpoint.page-write",
        expectedPointer: 512,
        additional: "orphan-generation-ignored"
    },
    {
        case: "checkpoint.page-sync",
        point: "checkpoint.page-sync",
        expectedPointer: 512,
        additional: "orphan-generation-ignored"
    },
    {
        case: "checkpoint.page-directory-sync",
        point: "checkpoint.page-directory-sync",
        expectedPointer: 512,
        additional: "orphan-generation-ignored"
    },
    {
        case: "checkpoint.root-write",
        point: "checkpoint.root-write",
        expectedPointer: 512,
        additional: "orphan-generation-ignored"
    },
    {
        case: "checkpoint.root-sync",
        point: "checkpoint.root-sync",
        expectedPointer: 512,
        additional: "orphan-generation-ignored"
    },
    {
        case: "checkpoint.root-directory-sync",
        point: "checkpoint.root-directory-sync",
        expectedPointer: 512,
        additional: "orphan-generation-ignored"
    },
    {
        case: "checkpoint.pointer-temp-write",
        point: "checkpoint.pointer-temp-write",
        expectedPointer: 512,
        additional: "temp-absent"
    },
    {
        case: "checkpoint.pointer-temp-sync",
        point: "checkpoint.pointer-temp-sync",
        expectedPointer: 512,
        additional: "temp-absent"
    },
    {
        case: "checkpoint.pointer-rename",
        point: "checkpoint.pointer-rename",
        expectedPointer: 512,
        additional: "old-pointer-unchanged"
    },
    {
        case: "checkpoint.pointer-directory-sync",
        point: "checkpoint.pointer-directory-sync",
        expectedPointer: 1024,
        additional: "new-generation-verifies"
    },
    {
        case: "checkpoint.segment-unlink",
        point: "checkpoint.segment-unlink",
        expectedPointer: 1024,
        additional: "covered-segment-remains-ignored"
    },
    {
        case: "short-checkpoint-page-write",
        point: "checkpoint.page-write",
        expectedPointer: 512,
        additional: "partial-orphan-ignored"
    },
    {
        case: "short-checkpoint-root-write",
        point: "checkpoint.root-write",
        expectedPointer: 512,
        additional: "partial-orphan-ignored"
    },
    {
        case: "short-checkpoint-pointer-temp-write",
        point: "checkpoint.pointer-temp-write",
        expectedPointer: 512,
        additional: "partial-temp-absent-old-pointer-unchanged"
    }
] satisfies readonly {
    case: string;
    point: FaultPoint;
    expectedPointer: number;
    additional: Additional;
}[];

async function createPhysicalCheckpointFixture() {
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
    it.each(namedCases)(
        "recovers complete truth after $case",
        async ({ case: caseName, point, expectedPointer, additional }) => {
            const f = await createPhysicalCheckpointFixture();
            try {
                const oldPointerBytes = await readFile(join(f.root, "checkpoint-pointer.json"));
                const fault = new Error("injected");
                if (caseName.startsWith("short-")) f.fs.shortWriteNext(point, 5);
                else f.fs.failNext(point, fault);
                await expect(f.unit.putRecord("records", "k1024", 1024)).resolves.toBeUndefined();
                if (caseName.startsWith("short-"))
                    await expect(f.unit.close()).rejects.toThrow("short");
                else await expect(f.unit.close()).rejects.toBe(fault);
                f.fs.assertConsumed();
                const cold = await openJsonlUnit(f.root, f.descriptor, f.fs);
                const all = await cold.loadAll();
                for (let i = 1; i <= 1024; i += 1) expect(all.tables.records[`k${i}`]).toBe(i);
                const pointer = JSON.parse(
                    (await readFile(join(f.root, "checkpoint-pointer.json"))).toString()
                );
                expect(pointer.throughOpSeq).toBe(expectedPointer);
                if (
                    additional === "temp-absent" ||
                    additional === "partial-temp-absent-old-pointer-unchanged"
                )
                    await expect(
                        readFile(join(f.root, "checkpoint-pointer.json.tmp"))
                    ).rejects.toThrow();
                if (
                    additional === "old-pointer-unchanged" ||
                    additional === "partial-temp-absent-old-pointer-unchanged"
                )
                    expect(await readFile(join(f.root, "checkpoint-pointer.json"))).toEqual(
                        oldPointerBytes
                    );
                if (additional === "covered-segment-remains-ignored") {
                    const segments = await readdir(join(f.root, "segments"));
                    expect(segments.some((name) => /^\d{20}\.jsonl$/.test(name))).toBe(true);
                }
                if (additional === "new-generation-verifies") {
                    const generation = pointer.generation as string;
                    await expect(
                        readFile(join(f.root, "checkpoints", generation, "root.json"))
                    ).resolves.toBeTruthy();
                    await expect(
                        readFile(join(f.root, "checkpoints", generation, "records.jsonl"))
                    ).resolves.toBeTruthy();
                }
                if (
                    additional === "orphan-generation-ignored" ||
                    additional === "partial-orphan-ignored"
                )
                    expect(pointer.throughOpSeq).toBe(512);
                await cold.close();
            } finally {
                await rm(f.root, { recursive: true, force: true });
            }
        },
        30_000
    );
});
