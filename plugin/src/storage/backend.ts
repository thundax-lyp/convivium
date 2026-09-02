import { Context } from "@deepseek-ai/cordis";
import {
    StorageError,
    storageBackendServiceKey,
    UNIT_NAME_RE,
    type KvFacet,
    type KvUnit,
    type KvUnitDescriptor,
    type StorageBackend
} from "@deepseek-ai/dsh-storage";
import { join } from "node:path";
import { openJsonlUnit, JsonlKvUnit } from "./unit.js";
import type { JsonlStorageConfig } from "./config.js";
import type { FileSystemPort } from "./filesystem.js";

function validateDescriptor(descriptor: KvUnitDescriptor): void {
    if (
        !descriptor ||
        !UNIT_NAME_RE.test(descriptor.name) ||
        !Number.isInteger(descriptor.version) ||
        descriptor.version < 0 ||
        descriptor.tables.some((table) => !UNIT_NAME_RE.test(table)) ||
        new Set(descriptor.tables).size !== descriptor.tables.length
    )
        throw new StorageError("malformed-medium", "invalid storage unit descriptor");
}

export class JsonlStorageBackend implements StorageBackend {
    readonly kv: KvFacet;
    private readonly openUnits = new Map<string, Promise<JsonlKvUnit>>();
    private closed = false;
    private closing: Promise<void> | undefined;
    constructor(
        private readonly root: string,
        private readonly fs?: FileSystemPort
    ) {
        this.kv = { open: (descriptor) => this.open(descriptor) };
    }
    private async open(descriptor: KvUnitDescriptor): Promise<KvUnit> {
        if (this.closed) throw new StorageError("closed", "storage backend closed");
        validateDescriptor(descriptor);
        if (this.openUnits.has(descriptor.name))
            throw new StorageError("duplicate-mount", "storage unit already open");
        const path = join(this.root, Buffer.from(descriptor.name).toString("base64url"));
        const opening = openJsonlUnit(path, descriptor, this.fs, () => {
            if (this.openUnits.get(descriptor.name) === opening)
                this.openUnits.delete(descriptor.name);
        });
        this.openUnits.set(descriptor.name, opening);
        try {
            return await opening;
        } catch (error) {
            this.openUnits.delete(descriptor.name);
            throw error;
        }
    }
    async close(): Promise<void> {
        if (this.closing) return this.closing;
        this.closed = true;
        this.closing = Promise.allSettled([...this.openUnits.values()]).then(async (units) => {
            for (const result of units)
                if (result.status === "fulfilled") await result.value.close();
            this.openUnits.clear();
        });
        return this.closing;
    }
}

export const BACKEND_NAME = "convivium-jsonl";

export const jsonlStoragePlugin = {
    name: "convivium-storage-jsonl",
    inject: ["storage"] as const,
    apply(ctx: Context, config: JsonlStorageConfig): void {
        const backend = new JsonlStorageBackend(config.root);
        ctx.effect(() => {
            const unregister = ctx.storage.backend.register(BACKEND_NAME, backend);
            return async () => {
                unregister();
                await backend.close();
            };
        });
        ctx.provide(storageBackendServiceKey(BACKEND_NAME), backend);
    }
};
