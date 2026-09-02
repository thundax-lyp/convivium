import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { openJsonlUnit } from "../../../src/storage/unit.js";
import { ScriptedFileSystem } from "../../fixtures/storage/scripted-filesystem.js";

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
    it("round-trips every string key through a physical checkpoint", async () => {
        const root = await mkdtemp(join("/tmp", "unit-"));
        const descriptor = {
            name: "x",
            version: 1,
            tables: ["a"],
            hasGlobal: false
        } as const;
        try {
            const unit = await openJsonlUnit(root, descriptor);
            for (const key of ["__proto__", "prototype", "constructor"])
                await unit.putRecord("a", key, { key });
            for (let index = 0; index < 509; index += 1)
                await unit.putRecord("a", `k${index}`, index);
            await unit.close();

            const reopened = await openJsonlUnit(root, descriptor);
            const loaded = await reopened.loadAll();
            for (const key of ["__proto__", "prototype", "constructor"]) {
                expect(Object.hasOwn(loaded.tables.a!, key)).toBe(true);
                expect(loaded.tables.a?.[key]).toEqual({ key });
            }
            await reopened.close();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }, 15_000);
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
    it("poisons the unit after a partial append write", async () => {
        const root = await mkdtemp(join("/tmp", "unit-"));
        const fs = new ScriptedFileSystem();
        try {
            const unit = await openJsonlUnit(
                root,
                { name: "x", version: 1, tables: ["a"], hasGlobal: false },
                fs
            );
            const writesBeforeFault = fs.calls("append.write").length;
            fs.shortWriteNext("append.write", 5);

            await expect(unit.putRecord("a", "first", 1)).rejects.toMatchObject({
                code: "short-write"
            });
            await expect(unit.putRecord("a", "second", 2)).rejects.toMatchObject({
                code: "closed"
            });
            expect(fs.calls("append.write")).toHaveLength(writesBeforeFault + 1);
            fs.assertConsumed();
            await unit.close();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it("drains accepted mutations before closing", async () => {
        const root = await mkdtemp(join("/tmp", "unit-"));
        const descriptor = { name: "x", version: 1, tables: ["a"], hasGlobal: false } as const;
        try {
            const unit = await openJsonlUnit(root, descriptor);
            const first = unit.putRecord("a", "first", 1);
            const second = unit.putRecord("a", "second", 2);
            const closing = unit.close();

            await expect(unit.putRecord("a", "late", 3)).rejects.toMatchObject({
                code: "closed"
            });
            await Promise.all([first, second, closing]);
            const reopened = await openJsonlUnit(root, descriptor);
            expect(await reopened.loadAll()).toEqual({
                tables: { a: { first: 1, second: 2 } },
                global: null
            });
            await reopened.close();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it("syncs both directories after rolling the active segment", async () => {
        const root = await mkdtemp(join("/tmp", "unit-"));
        const fs = new ScriptedFileSystem();
        try {
            const unit = await openJsonlUnit(
                root,
                { name: "x", version: 1, tables: ["a"], hasGlobal: false },
                fs
            );
            for (let index = 0; index < 256; index += 1)
                await unit.putRecord("a", `k${index}`, index);
            const syncsBeforeRollover = fs.calls("replace.directory-sync").length;

            await unit.putRecord("a", "rollover", true);

            expect(
                fs
                    .calls("replace.directory-sync")
                    .slice(syncsBeforeRollover, syncsBeforeRollover + 2)
            ).toEqual([{ paths: [join(root, "segments")] }, { paths: [root] }]);
            await unit.close();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
