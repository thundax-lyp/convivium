import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import {
    loadPhysicalCheckpoint,
    writePhysicalCheckpoint
} from "../../../src/storage/checkpoint.js";
describe("physical checkpoint", () => {
    it("publishes and reloads pointer", async () => {
        const root = await mkdtemp(join("/tmp", "cp-"));
        try {
            const s = {
                generation: "g1",
                throughOpSeq: 1,
                tables: { records: { a: 1 } },
                global: null
            } as const;
            await writePhysicalCheckpoint(root, s);
            expect(await loadPhysicalCheckpoint(root)).toMatchObject(s);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
