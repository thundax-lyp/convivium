import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSmokeStoragePath, writeSmokePatch } from "../../scripts/smoke-profile/index.mjs";

describe("smoke-profile persistent storage", () => {
    it("writes an explicitly authorized SQLite path into the smoke patch", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-smoke-storage-test-"));
        const patchPath = join(root, "generated", "smoke.patch.yml");
        const storagePath = join(root, "formal", "convivium-storage.sqlite");
        try {
            await mkdir(join(root, "formal"), { recursive: true });
            await mkdir(join(root, "generated"), { recursive: true });
            await writeFile(storagePath, "");
            await writeSmokePatch(patchPath, "meeting-business-loop", storagePath);
            const patch = await readFile(patchPath, "utf8");
            expect(patch).toContain(`path: ${JSON.stringify(storagePath)}`);
            expect(patch).not.toContain(
                `path: ${JSON.stringify(join(root, "generated", "convivium-storage.sqlite"))}`
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("keeps the existing temporary SQLite path when no persistent path is supplied", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-smoke-storage-test-"));
        const patchPath = join(root, "smoke.patch.yml");
        try {
            await writeSmokePatch(patchPath, "meeting-business-loop");
            const patch = await readFile(patchPath, "utf8");
            expect(patch).toContain(
                `path: ${JSON.stringify(join(root, "convivium-storage.sqlite"))}`
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("accepts only an existing absolute file for the isolated business-loop selector", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-smoke-storage-test-"));
        const storagePath = join(root, "convivium-storage.sqlite");
        try {
            await writeFile(storagePath, "");
            await expect(
                resolveSmokeStoragePath(storagePath, ["meeting-business-loop"])
            ).resolves.toBe(storagePath);
            await expect(
                resolveSmokeStoragePath("relative.sqlite", ["meeting-business-loop"])
            ).rejects.toThrow("must be an absolute path");
            await expect(
                resolveSmokeStoragePath(join(root, "missing.sqlite"), ["meeting-business-loop"])
            ).rejects.toThrow("must name an existing file");
            await expect(resolveSmokeStoragePath(root, ["meeting-business-loop"])).rejects.toThrow(
                "must name an existing file"
            );
            await expect(
                resolveSmokeStoragePath(storagePath, [
                    "identity-admission",
                    "meeting-business-loop"
                ])
            ).rejects.toThrow("requires the meeting-business-loop selector");
            await expect(
                resolveSmokeStoragePath(storagePath, ["identity-admission"])
            ).rejects.toThrow("requires the meeting-business-loop selector");
            await expect(
                resolveSmokeStoragePath(undefined, ["identity-admission", "meeting-business-loop"])
            ).resolves.toBeUndefined();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
