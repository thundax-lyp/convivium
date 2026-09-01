import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
    loadPhysicalCheckpoint,
    writePhysicalCheckpoint
} from "../../../src/storage/checkpoint.js";
const cases = [
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
    "short-checkpoint-page-write",
    "short-checkpoint-root-write",
    "short-checkpoint-pointer-temp-write"
];
describe("checkpoint recovery", () => {
    it.each(cases)("recovers complete truth after %s", async () => {
        const root = await mkdtemp(join("/tmp", "cp-"));
        try {
            const state = {
                generation: "g1",
                throughOpSeq: 512,
                tables: { records: { k: 1 } },
                global: null
            } as const;
            await writePhysicalCheckpoint(root, state);
            expect(await loadPhysicalCheckpoint(root)).toMatchObject(state);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
