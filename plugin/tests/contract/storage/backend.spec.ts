import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { JsonlStorageBackend } from "../../../src/storage/backend.js";

describe("JsonlStorageBackend contract", () => {
    it("opens a KV unit and exposes the exact KvUnit operations", async () => {
        const root = await mkdtemp(join("/tmp", "storage-backend-"));
        const backend = new JsonlStorageBackend(root);
        try {
            const unit = await backend.kv!.open({
                name: "contract",
                version: 1,
                tables: ["records"],
                hasGlobal: true
            });
            await unit.putRecord("records", "alpha", 1);
            await unit.setGlobal({ ready: true });
            expect(await unit.loadAll()).toEqual({
                tables: { records: { alpha: 1 } },
                global: { ready: true }
            });
            await unit.deleteRecord("records", "alpha");
            await unit.close();
        } finally {
            await backend.close();
            await rm(root, { recursive: true, force: true });
        }
    });
});
