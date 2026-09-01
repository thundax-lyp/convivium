import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { StorageError } from "@deepseek-ai/dsh-storage";
import { JsonlStorageBackend } from "../../../src/storage/backend.js";

describe("JsonlStorageBackend lifecycle", () => {
    it("rejects duplicate opens and makes close idempotent", async () => {
        const root = await mkdtemp(join("/tmp", "storage-lifecycle-"));
        const backend = new JsonlStorageBackend(root);
        const descriptor = {
            name: "lifecycle",
            version: 1,
            tables: ["records"],
            hasGlobal: false
        } as const;
        try {
            const unit = await backend.kv!.open(descriptor);
            await expect(backend.kv!.open(descriptor)).rejects.toMatchObject({
                code: "duplicate-mount"
            });
            await backend.close();
            await backend.close();
            await expect(unit.loadAll()).rejects.toBeInstanceOf(StorageError);
        } finally {
            await backend.close();
            await rm(root, { recursive: true, force: true });
        }
    });
});
