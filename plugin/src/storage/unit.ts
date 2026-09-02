import { StorageError } from "@deepseek-ai/dsh-storage";
import { JsonlStorageError } from "./errors.js";
import type { KvUnit, KvUnitDescriptor } from "@deepseek-ai/dsh-storage";
import { join } from "node:path";
import { appendFailurePhase, appendLineDurably, readJsonl } from "./jsonl.js";
import {
    decodeCanonicalJson,
    encodeCanonicalJson,
    sha256Hex,
    type JsonValue
} from "./canonical-json.js";
import { decodeRecord, encodeRecord, type UnitDescriptorRecordV1 } from "./format.js";
import { nodeFileSystemPort, syncDirectory, type FileSystemPort } from "./filesystem.js";
import {
    collectPhysicalOrphans,
    loadPhysicalCheckpoint,
    writePhysicalCheckpoint
} from "./checkpoint.js";

export class JsonlKvUnit implements KvUnit {
    private closed = false;
    private poisoned = false;
    private seq = 0;
    private queue = Promise.resolve();
    private maintenanceError: unknown;
    private tailRecords = 0;
    private tailBytes = 0;
    constructor(
        private readonly root: string,
        private readonly descriptor: KvUnitDescriptor,
        private readonly fs: FileSystemPort,
        private readonly tables: Record<string, Record<string, unknown>>,
        private global: unknown,
        initialSeq = 0,
        initialTailRecords = 0,
        initialTailBytes = 0,
        private readonly activeFirstOpSeq?: number
    ) {
        this.seq = initialSeq;
        this.tailRecords = initialTailRecords;
        this.tailBytes = initialTailBytes;
    }
    private guard(): void {
        if (this.closed || this.poisoned) throw new StorageError("closed", "storage unit closed");
    }
    private run(task: () => Promise<void>): Promise<void> {
        const next = this.queue.then(async () => {
            this.guard();
            await task();
        });
        this.queue = next.catch(() => undefined);
        return next;
    }
    async loadAll() {
        this.guard();
        return { tables: structuredClone(this.tables), global: this.global };
    }
    putRecord(table: string, key: string, value: unknown): Promise<void> {
        return this.mutate({ kind: "put", table, key, value: value as JsonValue });
    }
    deleteRecord(table: string, key: string): Promise<void> {
        return this.mutate({ kind: "delete", table, key, value: null });
    }
    setGlobal(value: unknown): Promise<void> {
        if (!this.descriptor.hasGlobal) return Promise.reject(new Error("global is not declared"));
        return this.mutate({
            kind: "set_global",
            table: null,
            key: null,
            value: value as JsonValue
        });
    }
    private mutate(input: {
        kind: "put" | "delete" | "set_global";
        table: string | null;
        key: string | null;
        value: JsonValue | null;
    }): Promise<void> {
        const prior = this.queue;
        let checkpointSnapshot: import("./checkpoint.js").PhysicalCheckpointState | undefined;
        const committed = prior.then(async () => {
            this.guard();
            if (input.table !== null && !Object.hasOwn(this.tables, input.table))
                throw new Error("undeclared table");
            const record = { formatVersion: 1 as const, opSeq: this.seq + 1, ...input };
            const line = new Uint8Array([...encodeRecord(record), 10]);
            if (this.tailRecords + 1 > 1024 || this.tailBytes + line.byteLength > 16_777_216) {
                if (this.maintenanceError)
                    throw new JsonlStorageError("capacity-exceeded", "tail capacity exceeded");
                const snapshot = {
                    generation: `${String(this.seq).padStart(20, "0")}_${sha256Hex(encodeCanonicalJson({ throughOpSeq: this.seq, tables: this.tables, global: this.global ?? null })).slice(0, 16)}`,
                    throughOpSeq: this.seq,
                    tables: structuredClone(this.tables) as Record<
                        string,
                        Record<string, JsonValue>
                    >,
                    global: (this.global ?? null) as JsonValue | null,
                    descriptorDigest: sha256Hex(
                        encodeCanonicalJson({
                            formatVersion: 1,
                            name: this.descriptor.name,
                            unitVersion: this.descriptor.version,
                            tables: [...this.descriptor.tables],
                            hasGlobal: this.descriptor.hasGlobal
                        })
                    )
                };
                try {
                    await writePhysicalCheckpoint(this.root, snapshot, this.fs);
                    this.tailRecords = 0;
                    this.tailBytes = 0;
                } catch (error) {
                    this.maintenanceError = error;
                    throw new JsonlStorageError("capacity-exceeded", "tail capacity exceeded", {
                        cause: error
                    });
                }
            }
            let shouldRoll = this.seq > 0 && this.seq % 256 === 0;
            try {
                const active = await this.fs.stat(join(this.root, "active.jsonl"));
                shouldRoll ||= active.size + line.byteLength > 4194304;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            }
            if (shouldRoll) {
                const segments = join(this.root, "segments");
                await this.fs.mkdir(segments, { recursive: true });
                await this.fs.rename(
                    join(this.root, "active.jsonl"),
                    join(
                        segments,
                        `${String(this.activeFirstOpSeq ?? this.seq - 255).padStart(20, "0")}.jsonl`
                    )
                );
                await syncDirectory(segments, this.fs);
            }
            try {
                await appendLineDurably(join(this.root, "active.jsonl"), line, this.fs);
            } catch (error) {
                if (appendFailurePhase(error) === "datasync") this.poisoned = true;
                throw error;
            }
            if (input.kind === "put")
                this.tables[input.table!][input.key!] = structuredClone(input.value);
            else if (input.kind === "delete") delete this.tables[input.table!][input.key!];
            else this.global = structuredClone(input.value);
            this.seq += 1;
            this.tailRecords += 1;
            this.tailBytes += line.byteLength;
            if (this.tailRecords >= 512 || this.tailBytes >= 8_388_608) {
                checkpointSnapshot = {
                    generation: `${String(this.seq).padStart(20, "0")}_${sha256Hex(encodeCanonicalJson({ throughOpSeq: this.seq, tables: this.tables, global: this.global ?? null })).slice(0, 16)}`,
                    throughOpSeq: this.seq,
                    tables: structuredClone(this.tables) as Record<
                        string,
                        Record<string, JsonValue>
                    >,
                    global: (this.global ?? null) as JsonValue | null,
                    descriptorDigest: sha256Hex(
                        encodeCanonicalJson({
                            formatVersion: 1,
                            name: this.descriptor.name,
                            unitVersion: this.descriptor.version,
                            tables: [...this.descriptor.tables],
                            hasGlobal: this.descriptor.hasGlobal
                        })
                    )
                };
            }
        });
        const maintenance = committed.then(
            async () => {
                if (checkpointSnapshot)
                    try {
                        await writePhysicalCheckpoint(this.root, checkpointSnapshot, this.fs);
                        this.tailRecords = 0;
                        this.tailBytes = 0;
                        this.maintenanceError = undefined;
                    } catch (e) {
                        this.maintenanceError = e;
                    }
            },
            () => undefined
        );
        this.queue = maintenance.then(
            () => undefined,
            () => undefined
        );
        return committed;
    }
    async close(): Promise<void> {
        this.closed = true;
        await this.queue;
        if (this.maintenanceError) throw this.maintenanceError;
    }
}

export async function openJsonlUnit(
    root: string,
    descriptor: KvUnitDescriptor,
    fs: FileSystemPort = nodeFileSystemPort
): Promise<JsonlKvUnit> {
    await fs.mkdir(root, { recursive: true });
    const descriptorPath = join(root, "descriptor.json");
    const expectedBase = {
        formatVersion: 1 as const,
        name: descriptor.name,
        unitVersion: descriptor.version,
        tables: [...descriptor.tables],
        hasGlobal: descriptor.hasGlobal
    };
    try {
        const h = await fs.open(descriptorPath, "r");
        let raw: Buffer;
        try {
            raw = await h.readFile();
        } finally {
            await h.close();
        }
        const stored = decodeCanonicalJson(raw) as Record<string, JsonValue>;
        const { digest, ...rest } = stored;
        if (stored.unitVersion !== descriptor.version)
            throw new StorageError("version-mismatch", "storage unit version mismatch");
        if (
            sha256Hex(encodeCanonicalJson(rest)) !== digest ||
            new TextDecoder().decode(encodeCanonicalJson(rest)) !==
                new TextDecoder().decode(encodeCanonicalJson(expectedBase))
        )
            throw new StorageError("malformed-medium", "descriptor mismatch");
    } catch (error) {
        if (error instanceof StorageError) throw error;
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
            throw new StorageError("malformed-medium", "descriptor unreadable");
        const record: UnitDescriptorRecordV1 = {
            ...expectedBase,
            digest: sha256Hex(encodeCanonicalJson(expectedBase))
        };
        const { createFileDurably } = await import("./jsonl.js");
        await createFileDurably(descriptorPath, encodeCanonicalJson(record), fs);
    }
    const descriptorDigest = sha256Hex(encodeCanonicalJson(expectedBase));
    const tables: Record<string, Record<string, unknown>> = {};
    for (const table of descriptor.tables) tables[table] = {};
    let global: unknown = null;
    let seq = 0;
    let replaySeq = 0;
    let tailRecords = 0;
    let tailBytes = 0;
    let activeFirstOpSeq: number | undefined;
    const checkpoint = await loadPhysicalCheckpoint(root, descriptor, descriptorDigest, fs);
    if (checkpoint) {
        for (const [t, values] of Object.entries(checkpoint.tables))
            tables[t] = structuredClone(values);
        global = checkpoint.global;
        seq = checkpoint.throughOpSeq;
        replaySeq = checkpoint.throughOpSeq;
        await collectPhysicalOrphans(root, checkpoint.generation, fs);
    }
    const segmentLines: Uint8Array[] = [];
    try {
        for (const entry of (await fs.readdir(join(root, "segments"), { withFileTypes: true }))
            .filter((e) => e.name.endsWith(".jsonl"))
            .sort((a, b) => a.name.localeCompare(b.name)))
            segmentLines.push(
                ...(await readJsonl(join(root, "segments", entry.name), "immutable", fs))
            );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const activeLines = await readJsonl(join(root, "active.jsonl"), "active-tail", fs);
    const lines = [...segmentLines, ...activeLines];
    for (const line of lines) {
        let record;
        try {
            record = decodeRecord(line);
        } catch (error) {
            throw new StorageError("malformed-medium", "invalid operation record", {
                cause: error
            });
        }
        if (checkpoint && record.opSeq <= checkpoint.throughOpSeq) {
            if (replaySeq !== checkpoint.throughOpSeq)
                throw new StorageError("malformed-medium", "sequence mismatch");
            continue;
        }
        if (record.opSeq !== replaySeq + 1)
            throw new StorageError("malformed-medium", "sequence mismatch");
        if (record.kind === "put") tables[record.table!][record.key!] = record.value;
        else if (record.kind === "delete") delete tables[record.table!][record.key!];
        else global = record.value;
        tailRecords += 1;
        tailBytes += line.byteLength + 1;
        if (activeFirstOpSeq === undefined && activeLines.includes(line))
            activeFirstOpSeq = record.opSeq;
        replaySeq = record.opSeq;
        seq = record.opSeq;
    }
    return new JsonlKvUnit(
        root,
        descriptor,
        fs,
        tables,
        global,
        seq,
        tailRecords,
        tailBytes,
        activeFirstOpSeq
    );
}
