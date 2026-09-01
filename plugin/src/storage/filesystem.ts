import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import { dirname } from "node:path";
import { JsonlStorageError } from "./errors.js";

export interface FileHandlePort {
    write(
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: null
    ): Promise<{ bytesWritten: number }>;
    datasync(): Promise<void>;
    sync(): Promise<void>;
    truncate(length: number): Promise<void>;
    readFile(): Promise<Buffer>;
    close(): Promise<void>;
}

export interface FileSystemPort {
    open(path: string, flags: "a" | "r" | "r+" | "wx"): Promise<FileHandlePort>;
    mkdir(path: string, options: { recursive: boolean; mode?: number }): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    unlink(path: string): Promise<void>;
    rm(path: string, options: { recursive: true; force: true }): Promise<void>;
    stat(path: string): Promise<{
        size: number;
        isFile(): boolean;
        isDirectory(): boolean;
        isSymbolicLink(): boolean;
    }>;
    lstat(path: string): Promise<{
        size: number;
        isFile(): boolean;
        isDirectory(): boolean;
        isSymbolicLink(): boolean;
    }>;
    readdir(path: string, options: { withFileTypes: true }): Promise<readonly Dirent[]>;
}

const wrapHandle = (h: import("node:fs/promises").FileHandle): FileHandlePort => ({
    write: (b, o, l, p) => h.write(b, o, l, p),
    datasync: () => h.datasync(),
    sync: () => h.sync(),
    truncate: (n) => h.truncate(n),
    readFile: () => h.readFile(),
    close: () => h.close()
});

export const nodeFileSystemPort: FileSystemPort = {
    open: async (path, flags) => wrapHandle(await fs.open(path, flags)),
    mkdir: (path, options) => fs.mkdir(path, options).then(() => undefined),
    rename: (a, b) => fs.rename(a, b),
    unlink: (p) => fs.unlink(p),
    rm: (p, o) => fs.rm(p, o),
    stat: (p) => fs.stat(p),
    lstat: (p) => fs.lstat(p),
    readdir: (p, o) => fs.readdir(p, o)
};

export async function syncDirectory(
    path: string,
    port: FileSystemPort = nodeFileSystemPort
): Promise<void> {
    const h = await port.open(path, "r");
    try {
        await h.sync();
    } finally {
        await h.close();
    }
}

async function writeOnce(
    path: string,
    bytes: Uint8Array,
    flags: "wx" | "a",
    port: FileSystemPort
): Promise<void> {
    const h = await port.open(path, flags);
    try {
        const result = await h.write(bytes, 0, bytes.length, null);
        if (result.bytesWritten !== bytes.length)
            throw new JsonlStorageError("short-write", "short write");
        await h.sync();
    } finally {
        await h.close();
    }
}

export async function createFileDurably(
    path: string,
    bytes: Uint8Array,
    port: FileSystemPort = nodeFileSystemPort
): Promise<void> {
    await writeOnce(path, bytes, "wx", port);
    await syncDirectory(dirname(path), port);
}

export async function replaceFileDurably(
    path: string,
    bytes: Uint8Array,
    port: FileSystemPort = nodeFileSystemPort
): Promise<void> {
    const temp = `${path}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
        await writeOnce(temp, bytes, "wx", port);
        await port.rename(temp, path);
        await syncDirectory(dirname(path), port);
    } finally {
        try {
            await port.unlink(temp);
        } catch {
            /* absent after rename */
        }
    }
}
