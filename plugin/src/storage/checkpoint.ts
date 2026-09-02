import { join } from "node:path";
import type { KvUnitDescriptor } from "@deepseek-ai/dsh-storage";
import { StorageError } from "@deepseek-ai/dsh-storage";
import { encodeCanonicalJson, sha256Hex, type JsonValue } from "./canonical-json.js";
import {
    decodePhysicalCheckpointPointer,
    decodePhysicalCheckpointRecord,
    decodePhysicalCheckpointRoot,
    encodePhysicalCheckpointRecord,
    encodePhysicalCheckpointRoot,
    decodeOperationRecord,
    type PhysicalCheckpointRootV1
} from "./format.js";
import { createFileDurably, readJsonl } from "./jsonl.js";
import { nodeFileSystemPort, syncDirectory, type FileSystemPort } from "./filesystem.js";

export interface PhysicalCheckpointState {
    readonly generation: string;
    readonly throughOpSeq: number;
    readonly tables: Record<string, Record<string, JsonValue>>;
    readonly global: JsonValue | null;
    readonly descriptorDigest: string;
}

function recordsDigest(records: readonly Uint8Array[]): string {
    const bytes = records.flatMap((record) => [...record, 10]);
    return sha256Hex(new Uint8Array(bytes));
}

export async function writePhysicalCheckpoint(
    root: string,
    state: PhysicalCheckpointState,
    fs: FileSystemPort = nodeFileSystemPort
): Promise<void> {
    const dir = join(root, "checkpoints", state.generation);
    try {
        await fs.stat(join(dir, "records.jsonl"));
        return;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await fs.mkdir(dir, { recursive: true });
    const encodedRecords: Uint8Array[] = [];
    for (const table of Object.keys(state.tables).sort())
        for (const key of Object.keys(state.tables[table]!).sort())
            encodedRecords.push(
                encodePhysicalCheckpointRecord({
                    formatVersion: 1,
                    table,
                    key,
                    value: state.tables[table]![key]!
                })
            );
    const recordsHandle = await fs.open(join(dir, "records.jsonl"), "wx");
    try {
        for (const record of encodedRecords) {
            const line = new Uint8Array([...record, 10]);
            const result = await recordsHandle.write(line, 0, line.length, null);
            if (result.bytesWritten !== line.length) throw new Error("short-write");
        }
        await recordsHandle.sync();
    } finally {
        await recordsHandle.close();
    }
    await syncDirectory(dir, fs);
    const verified = await readJsonl(join(dir, "records.jsonl"), "immutable", fs);
    if (
        verified.length !==
        Object.values(state.tables).reduce((n, table) => n + Object.keys(table).length, 0)
    )
        throw new Error("checkpoint record count mismatch");
    const rootRecord: PhysicalCheckpointRootV1 = {
        formatVersion: 1,
        generation: state.generation,
        throughOpSeq: state.throughOpSeq,
        descriptorDigest: state.descriptorDigest,
        recordCount: encodedRecords.length,
        recordsDigest: recordsDigest(encodedRecords),
        global: state.global,
        globalDigest: sha256Hex(encodeCanonicalJson(state.global))
    };
    await createFileDurably(join(dir, "root.json"), encodePhysicalCheckpointRoot(rootRecord), fs);
    const pointer = encodeCanonicalJson({
        formatVersion: 1,
        generation: state.generation,
        throughOpSeq: state.throughOpSeq,
        rootDigest: sha256Hex(encodePhysicalCheckpointRoot(rootRecord))
    });
    const pointerTmp = join(root, "checkpoint-pointer.json.tmp");
    let ph;
    try {
        ph = await fs.open(pointerTmp, "wx");
        const result = await ph.write(pointer, 0, pointer.length, null);
        if (result.bytesWritten !== pointer.length) throw new Error("short-write");
        await ph.sync();
        await ph.close();
        await fs.rename(pointerTmp, join(root, "checkpoint-pointer.json"));
        await syncDirectory(root, fs);
    } finally {
        try {
            await fs.unlink(pointerTmp);
        } catch {
            /* absent */
        }
    }
    let entries;
    try {
        entries = await fs.readdir(join(root, "segments"), { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }
    for (const entry of entries) {
        if (!/^\d{20}\.jsonl$/.test(entry.name)) continue;
        const segmentPath = join(root, "segments", entry.name);
        const lines = await readJsonl(segmentPath, "immutable", fs);
        if (lines.length === 0) continue;
        const records = lines.map((bytes) => decodeOperationRecord(bytes));
        for (let index = 1; index < records.length; index += 1)
            if (records[index]!.opSeq !== records[index - 1]!.opSeq + 1)
                throw new Error("segment sequence mismatch");
        if (records[records.length - 1]!.opSeq <= state.throughOpSeq) await fs.unlink(segmentPath);
    }
}

export async function loadPhysicalCheckpoint(
    root: string,
    descriptor: KvUnitDescriptor,
    descriptorDigest: string,
    fs: FileSystemPort = nodeFileSystemPort
): Promise<PhysicalCheckpointState | undefined> {
    let raw: Buffer;
    try {
        const h = await fs.open(join(root, "checkpoint-pointer.json"), "r");
        try {
            raw = await h.readFile();
        } finally {
            await h.close();
        }
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw e;
    }
    try {
        const pointer = decodePhysicalCheckpointPointer(raw);
        const dirs = await fs.readdir(join(root, "checkpoints"), { withFileTypes: true });
        const dir = dirs.find((d) => d.name === pointer.generation);
        if (!dir) throw new Error("checkpoint generation missing");
        const h = await fs.open(join(root, "checkpoints", dir.name, "root.json"), "r");
        let body: Buffer;
        try {
            body = await h.readFile();
        } finally {
            await h.close();
        }
        if (sha256Hex(body) !== pointer.rootDigest) throw new Error("malformed checkpoint");
        const checkpointRoot = decodePhysicalCheckpointRoot(body);
        if (
            checkpointRoot.generation !== pointer.generation ||
            checkpointRoot.throughOpSeq !== pointer.throughOpSeq
        )
            throw new Error("checkpoint pointer mismatch");
        if (checkpointRoot.descriptorDigest !== descriptorDigest)
            throw new Error(`checkpoint descriptor mismatch: ${descriptor.name}`);
        const recordLines = await readJsonl(
            join(root, "checkpoints", dir.name, "records.jsonl"),
            "immutable",
            fs
        );
        const records = recordLines.map((record) => decodePhysicalCheckpointRecord(record));
        if (records.length !== checkpointRoot.recordCount)
            throw new Error("checkpoint record count mismatch");
        const canonicalRecords = records.map((record) => {
            const { digest: _digest, ...body } = record;
            return encodeCanonicalJson({
                ...body,
                digest: sha256Hex(encodeCanonicalJson(body))
            });
        });
        if (recordsDigest(canonicalRecords) !== checkpointRoot.recordsDigest)
            throw new Error("checkpoint records digest mismatch");
        if (sha256Hex(encodeCanonicalJson(checkpointRoot.global)) !== checkpointRoot.globalDigest)
            throw new Error("checkpoint global digest mismatch");
        const tables: Record<string, Record<string, JsonValue>> = Object.create(null);
        for (const record of records) {
            if (!descriptor.tables.includes(record.table))
                throw new Error("undeclared checkpoint table");
            if (
                record.key === "__proto__" ||
                record.key === "prototype" ||
                record.key === "constructor"
            )
                throw new Error("dangerous checkpoint key");
            const table = (tables[record.table] ??= Object.create(null) as Record<
                string,
                JsonValue
            >);
            if (Object.hasOwn(table, record.key)) throw new Error("duplicate checkpoint record");
            table[record.key] = record.value;
        }
        return {
            generation: pointer.generation,
            throughOpSeq: pointer.throughOpSeq,
            tables,
            global: checkpointRoot.global,
            descriptorDigest: checkpointRoot.descriptorDigest
        };
    } catch (error) {
        throw new StorageError("malformed-medium", "malformed checkpoint", { cause: error });
    }
}

export async function collectPhysicalOrphans(
    root: string,
    keepGeneration: string,
    fs: FileSystemPort = nodeFileSystemPort
): Promise<void> {
    let entries;
    try {
        entries = await fs.readdir(join(root, "checkpoints"), { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries)
        if (entry.isDirectory() && entry.name !== keepGeneration)
            await fs.rm(join(root, "checkpoints", entry.name), { recursive: true, force: true });
}
