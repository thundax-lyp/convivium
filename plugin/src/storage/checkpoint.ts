import { join } from "node:path";
import {
    encodeCanonicalJson,
    decodeCanonicalJson,
    sha256Hex,
    type JsonValue
} from "./canonical-json.js";
import { createFileDurably, readJsonl } from "./jsonl.js";
import { nodeFileSystemPort, syncDirectory, type FileSystemPort } from "./filesystem.js";

export interface PhysicalCheckpointState {
    readonly generation: string;
    readonly throughOpSeq: number;
    readonly tables: Record<string, Record<string, JsonValue>>;
    readonly global: JsonValue | null;
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
    const recordsHandle = await fs.open(join(dir, "records.jsonl"), "wx");
    try {
        for (const table of Object.keys(state.tables).sort())
            for (const key of Object.keys(state.tables[table]!).sort()) {
                const body = { formatVersion: 1, table, key, value: state.tables[table]![key] };
                const record = encodeCanonicalJson({
                    ...body,
                    digest: sha256Hex(encodeCanonicalJson(body))
                });
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
    await createFileDurably(join(dir, "root.json"), encodeCanonicalJson(state), fs);
    const pointer = encodeCanonicalJson({
        formatVersion: 1,
        generation: state.generation,
        throughOpSeq: state.throughOpSeq,
        rootDigest: sha256Hex(encodeCanonicalJson(state))
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
    for (const entry of entries)
        if (/^\d{20}\.jsonl$/.test(entry.name)) await fs.unlink(join(root, "segments", entry.name));
}

export async function loadPhysicalCheckpoint(
    root: string,
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
    const pointer = decodeCanonicalJson(raw) as {
        generation: string;
        throughOpSeq: number;
        rootDigest: string;
    };
    const dirs = await fs.readdir(join(root, "checkpoints"), { withFileTypes: true });
    const dir = dirs.find((d) => d.name === pointer.generation);
    if (!dir) return undefined;
    const h = await fs.open(join(root, "checkpoints", dir.name, "root.json"), "r");
    let body: Buffer;
    try {
        body = await h.readFile();
    } finally {
        await h.close();
    }
    const state = decodeCanonicalJson(body) as unknown as PhysicalCheckpointState;
    if (sha256Hex(body) !== pointer.rootDigest) throw new Error("malformed checkpoint");
    return state;
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
