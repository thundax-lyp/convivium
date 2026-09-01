import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendFailurePhase, appendLineDurably, readJsonl } from "../../../src/storage/jsonl.js";
import { ScriptedFileSystem } from "../../fixtures/storage/scripted-filesystem.js";

const roots: string[] = [];
afterEach(async () => {
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
    const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "convivium-"));
    roots.push(root);
    return { path: join(root, "active.jsonl"), fs: new ScriptedFileSystem() };
}
const bytes = (s: string) => new TextEncoder().encode(s);
describe("jsonl helpers", () => {
    it("rejects before append write", async () => {
        const { path, fs } = await fixture();
        await appendLineDurably(path, bytes("A\n"), fs);
        const datasyncBefore = fs.calls("append.datasync").length;
        const fault = new Error("write fault");
        fs.failNext("append.write", fault);
        await expect(appendLineDurably(path, bytes("B\n"), fs)).rejects.toBe(fault);
        expect(fs.calls("append.write")).toHaveLength(2);
        expect(fs.calls("append.datasync")).toHaveLength(1);
        expect(await readFile(path, "utf8")).toBe("A\n");
        fs.assertConsumed();
    });
    it("repairs a short append on active-tail reopen", async () => {
        const { path, fs } = await fixture();
        await appendLineDurably(path, bytes("A\n"), fs);
        fs.shortWriteNext("append.write", 5);
        await expect(appendLineDurably(path, bytes("BBBBBB\n"), fs)).rejects.toMatchObject({
            code: "short-write"
        });
        expect(fs.calls("append.datasync")).toHaveLength(1);
        expect(await readJsonl(path, "active-tail", fs)).toHaveLength(1);
        expect((await readFile(path)).byteLength).toBe(2);
        expect(fs.calls("active-tail.truncate")).toHaveLength(1);
        fs.assertConsumed();
    });
    it("observes a complete line after datasync reports failure", async () => {
        const { path, fs } = await fixture();
        await appendLineDurably(path, bytes("A\n"), fs);
        const fault = new Error("datasync fault");
        fs.failNext("append.datasync", fault);
        await expect(appendLineDurably(path, bytes("B\n"), fs)).rejects.toBe(fault);
        expect(appendFailurePhase(fault)).toBe("datasync");
        expect(fs.calls("append.write")).toHaveLength(2);
        expect(fs.calls("append.datasync")).toHaveLength(2);
        expect(await readJsonl(path, "active-tail", fs)).toHaveLength(2);
        expect(fs.calls("active-tail.truncate")).toHaveLength(0);
        fs.assertConsumed();
    });
    it("reports active-tail truncate failure without appending", async () => {
        const { path, fs } = await fixture();
        await appendLineDurably(path, bytes("A\n"), fs);
        await appendLineDurably(path, bytes("BBBBB"), fs);
        const fault = new Error("truncate fault");
        fs.failNext("active-tail.truncate", fault);
        await expect(readJsonl(path, "active-tail", fs)).rejects.toBe(fault);
        expect(await readFile(path, "utf8")).toBe("A\nBBBBB");
        expect(fs.calls("active-tail.truncate")).toHaveLength(1);
        expect(fs.calls("append.write")).toHaveLength(2);
        expect(fs.calls("append.datasync")).toHaveLength(2);
        fs.assertConsumed();
    });
});
