import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openJsonlUnit } from "../../../src/storage/unit.js";

describe("tail recovery", () => {
    it("truncates incomplete final-line suffix", async () => {
        const root = await mkdtemp(join("/tmp", "tail-"));
        try {
            await writeFile(
                join(root, "active.jsonl"),
                '{"formatVersion":1,"opSeq":1,"kind":"put","table":"a","key":"k","value":1,"digest":"bad"}\npartial'
            );
            await expect(
                openJsonlUnit(root, { name: "x", version: 1, tables: ["a"], hasGlobal: false })
            ).rejects.toThrow();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
