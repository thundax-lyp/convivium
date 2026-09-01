import { JsonlStorageError } from "./errors.js";
import {
    createFileDurably as createFile,
    nodeFileSystemPort,
    type FileSystemPort
} from "./filesystem.js";

export type AppendFailurePhase = "write" | "datasync";
const phases = new WeakMap<object, AppendFailurePhase>();
export function appendFailurePhase(error: unknown): AppendFailurePhase | undefined {
    return typeof error === "object" && error !== null ? phases.get(error) : undefined;
}

export async function appendLineDurably(
    path: string,
    line: Uint8Array,
    fs: FileSystemPort = nodeFileSystemPort
): Promise<void> {
    let h;
    let created = false;
    try {
        h = await fs.open(path, "wx");
        created = true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        h = await fs.open(path, "a");
    }
    try {
        try {
            const r = await h.write(line, 0, line.length, null);
            if (r.bytesWritten !== line.length)
                throw new JsonlStorageError("short-write", "short write");
        } catch (error) {
            if (typeof error === "object" && error !== null) phases.set(error, "write");
            throw error;
        }
        try {
            await h.datasync();
        } catch (error) {
            if (typeof error === "object" && error !== null) phases.set(error, "datasync");
            throw error;
        }
    } finally {
        await h.close();
    }
    if (created) {
        const { dirname } = await import("node:path");
        const { syncDirectory } = await import("./filesystem.js");
        await syncDirectory(dirname(path), fs);
    }
}

export async function createFileDurably(
    path: string,
    bytes: Uint8Array,
    fs: FileSystemPort = nodeFileSystemPort
): Promise<void> {
    return createFile(path, bytes, fs);
}

export async function readJsonl(
    path: string,
    policy: "immutable" | "active-tail",
    fs: FileSystemPort = nodeFileSystemPort
): Promise<readonly Uint8Array[]> {
    let h;
    try {
        h = await fs.open(path, "r");
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw e;
    }
    let bytes: Buffer;
    try {
        bytes = await h.readFile();
    } finally {
        await h.close();
    }
    const out: Uint8Array[] = [];
    let start = 0;
    while (start < bytes.length) {
        const end = bytes.indexOf(10, start);
        if (end < 0) {
            if (policy === "active-tail") {
                const t = await fs.open(path, "r+");
                try {
                    await t.truncate(start);
                } finally {
                    await t.close();
                }
                break;
            }
            throw new JsonlStorageError("invalid-json-value", "incomplete immutable line");
        }
        out.push(bytes.subarray(start, end));
        start = end + 1;
    }
    return out;
}
