import { describe, expect, it } from "vitest";
import { replaceFileDurably } from "../../../src/storage/filesystem.js";
import { ScriptedFileSystem } from "../../fixtures/storage/scripted-filesystem.js";
import { mkdtemp, readdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";

describe("filesystem durability helpers", () => {
    it("preserves target when replacement temp write fails", async () => {
        const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "convivium-"));
        try {
            const p = join(root, "a");
            const fs = new ScriptedFileSystem();
            await replaceFileDurably(p, new TextEncoder().encode("old\n"));
            const fault = new Error("fault");
            fs.failNext("replace.temp-write", fault);
            await expect(replaceFileDurably(p, new TextEncoder().encode("new\n"), fs)).rejects.toBe(
                fault
            );
            expect(await readFile(p, "utf8")).toBe("old\n");
            expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
            fs.assertConsumed();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it("preserves target when replacement temp short-writes", async () => {
        const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "convivium-"));
        try {
            const p = join(root, "a");
            const fs = new ScriptedFileSystem();
            await replaceFileDurably(p, new TextEncoder().encode("old\n"));
            fs.shortWriteNext("replace.temp-write", 2);
            await expect(
                replaceFileDurably(p, new TextEncoder().encode("new\n"), fs)
            ).rejects.toMatchObject({ code: "short-write" });
            expect(await readFile(p, "utf8")).toBe("old\n");
            expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
            fs.assertConsumed();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it("preserves target when replacement temp sync fails", async () => {
        const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "convivium-"));
        try {
            const p = join(root, "a");
            const fs = new ScriptedFileSystem();
            await replaceFileDurably(p, new TextEncoder().encode("old"));
            fs.failNext("replace.temp-sync", new Error("fault"));
            await expect(
                replaceFileDurably(p, new TextEncoder().encode("new"), fs)
            ).rejects.toThrow("fault");
            expect(new TextDecoder().decode(await readFile(p))).toBe("old");
            expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
            fs.assertConsumed();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it("preserves target when replacement rename fails", async () => {
        const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "convivium-"));
        try {
            const p = join(root, "a");
            const fs = new ScriptedFileSystem();
            await replaceFileDurably(p, new TextEncoder().encode("old"));
            fs.failNext("replace.rename", new Error("fault"));
            await expect(
                replaceFileDurably(p, new TextEncoder().encode("new"), fs)
            ).rejects.toThrow("fault");
            expect(new TextDecoder().decode(await readFile(p))).toBe("old");
            expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
            fs.assertConsumed();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
    it("keeps complete new target when publish directory sync fails", async () => {
        const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "convivium-"));
        try {
            const p = join(root, "a");
            const fs = new ScriptedFileSystem();
            await replaceFileDurably(p, new TextEncoder().encode("old"));
            fs.failNext("replace.directory-sync", new Error("fault"));
            await expect(
                replaceFileDurably(p, new TextEncoder().encode("new"), fs)
            ).rejects.toThrow("fault");
            expect(new TextDecoder().decode(await readFile(p))).toBe("new");
            expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
            fs.assertConsumed();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
