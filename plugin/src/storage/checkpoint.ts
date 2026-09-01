import { join } from "node:path";
import {
    encodeCanonicalJson,
    decodeCanonicalJson,
    sha256Hex,
    type JsonValue
} from "./canonical-json.js";
import { createFileDurably } from "./jsonl.js";
import { nodeFileSystemPort, replaceFileDurably, type FileSystemPort } from "./filesystem.js";

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
    const dir = join(
        root,
        "checkpoints",
        `${String(state.throughOpSeq).padStart(20, "0")}_${sha256Hex(encodeCanonicalJson(state)).slice(0, 16)}`
    );
    await fs.mkdir(dir, { recursive: true });
    const records: Uint8Array[] = [];
    for (const table of Object.keys(state.tables).sort())
        for (const key of Object.keys(state.tables[table]!).sort())
            records.push(
                encodeCanonicalJson({
                    formatVersion: 1,
                    table,
                    key,
                    value: state.tables[table]![key]
                })
            );
    await createFileDurably(
        join(dir, "records.jsonl"),
        new Uint8Array(records.flatMap((b) => [...b, 10])),
        fs
    );
    await createFileDurably(join(dir, "root.json"), encodeCanonicalJson(state), fs);
    const pointer = encodeCanonicalJson({
        formatVersion: 1,
        generation: state.generation,
        throughOpSeq: state.throughOpSeq,
        rootDigest: sha256Hex(encodeCanonicalJson(state))
    });
    await replaceFileDurably(join(root, "checkpoint-pointer.json"), pointer, fs);
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
    const dir = dirs.find((d) => d.name.startsWith(String(pointer.throughOpSeq).padStart(20, "0")));
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
