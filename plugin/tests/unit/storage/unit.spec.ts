import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { openJsonlUnit } from "../../../src/storage/unit.js";

describe("JSONL unit", () => {
    it("initializes every declared table in loadAll", async () => {
        const root = await mkdtemp(join("/tmp", "unit-"));
        try {
            const u = await openJsonlUnit(root, {
                name: "x",
                version: 1,
                tables: ["a", "b"],
                hasGlobal: false
            });
            expect(await u.loadAll()).toEqual({ tables: { a: {}, b: {} }, global: null });
            await u.close();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it("persists and replays mutations", async () => {
        const root = await mkdtemp(join("/tmp", "unit-"));
        try {
            const d = { name: "x", version: 1, tables: ["a"], hasGlobal: true };
            const u = await openJsonlUnit(root, d);
            await u.putRecord("a", "k", 1);
            await u.setGlobal("g");
            await u.close();
            const v = await openJsonlUnit(root, d);
            expect(await v.loadAll()).toEqual({ tables: { a: { k: 1 } }, global: "g" });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it("rejects undeclared table and global operations before IO", async () => {
        const root = await mkdtemp(join("/tmp", "unit-"));
        try {
            const u = await openJsonlUnit(root, {
                name: "x",
                version: 1,
                tables: ["a"],
                hasGlobal: false
            });
            await expect(u.putRecord("z", "k", 1)).rejects.toThrow();
            await expect(u.setGlobal(1)).rejects.toThrow();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
