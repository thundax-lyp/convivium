import type { FileHandlePort, FileSystemPort } from "../../../src/storage/filesystem.js";
import { nodeFileSystemPort } from "../../../src/storage/filesystem.js";

export type FaultPoint =
    | "append.write"
    | "append.datasync"
    | "active-tail.truncate"
    | "replace.temp-write"
    | "replace.temp-sync"
    | "replace.rename"
    | "replace.directory-sync"
    | "checkpoint.page-write"
    | "checkpoint.page-sync"
    | "checkpoint.page-directory-sync"
    | "checkpoint.root-write"
    | "checkpoint.root-sync"
    | "checkpoint.root-directory-sync"
    | "checkpoint.pointer-temp-write"
    | "checkpoint.pointer-temp-sync"
    | "checkpoint.pointer-rename"
    | "checkpoint.pointer-directory-sync"
    | "checkpoint.segment-unlink";

export class ScriptedFileSystem implements FileSystemPort {
    private readonly armed = new Map<FaultPoint, Error>();
    private readonly seen = new Map<FaultPoint, { readonly paths: readonly string[] }[]>();
    private readonly closedPaths: string[] = [];
    private readonly pending = new Map<string, "page" | "root" | "pointer">();
    failNext(point: FaultPoint, error: Error): void {
        if (this.armed.has(point)) throw new Error(`already armed: ${point}`);
        this.armed.set(point, error);
    }
    shortWriteNext(point: FaultPoint, bytesWritten: number): void {
        this.failNext(point, Object.assign(new Error("short write"), { bytesWritten }));
    }
    calls(point: FaultPoint): readonly { readonly paths: readonly string[] }[] {
        return this.seen.get(point) ?? [];
    }
    closeCallsEndingWith(suffix: string): number {
        return this.closedPaths.filter((path) => path.endsWith(suffix)).length;
    }
    assertConsumed(): void {
        if (this.armed.size)
            throw new Error(`unconsumed faults: ${[...this.armed.keys()].join(",")}`);
    }
    private mark(point: FaultPoint, path: string): Error | undefined {
        const list = this.seen.get(point) ?? [];
        list.push({ paths: [path] });
        this.seen.set(point, list);
        const error = this.armed.get(point);
        if (error) this.armed.delete(point);
        return error;
    }

    private isCheckpointPath(path: string): boolean {
        return /(?:records\.jsonl|root\.json|checkpoint-pointer\.json(?:\.tmp)?|segment-\d+\.jsonl)$/.test(
            path
        );
    }

    async open(path: string, flags: "a" | "r" | "r+" | "wx"): Promise<FileHandlePort> {
        const base = await nodeFileSystemPort.open(path, flags);
        return {
            write: async (buffer, offset, length, position) => {
                const p: FaultPoint | undefined = path.endsWith("checkpoint-pointer.json.tmp")
                    ? "checkpoint.pointer-temp-write"
                    : path.endsWith("root.json")
                      ? "checkpoint.root-write"
                      : path.endsWith("records.jsonl") || /\/segments\/\d{20}\.jsonl$/.test(path)
                        ? "checkpoint.page-write"
                        : path.endsWith(".tmp")
                          ? "replace.temp-write"
                          : "append.write";
                const e = p ? this.mark(p, path) : undefined;
                if (e) {
                    if ("bytesWritten" in e && typeof e.bytesWritten === "number") {
                        await base.write(buffer, offset, e.bytesWritten, position);
                        return { bytesWritten: e.bytesWritten };
                    }
                    throw e;
                }
                return base.write(buffer, offset, length, position);
            },
            datasync: async () => {
                const p: FaultPoint = path.endsWith("checkpoint-pointer.json.tmp")
                    ? "checkpoint.pointer-temp-sync"
                    : path.endsWith("root.json")
                      ? "checkpoint.root-sync"
                      : path.endsWith("records.jsonl") || /\/segments\/\d{20}\.jsonl$/.test(path)
                        ? "checkpoint.page-sync"
                        : "append.datasync";
                const e = this.mark(p, path);
                if (e) throw e;
                return base.datasync();
            },
            sync: async () => {
                const role = this.pending.get(path);
                const point: FaultPoint =
                    role === "page"
                        ? "checkpoint.page-directory-sync"
                        : role === "root"
                          ? "checkpoint.root-directory-sync"
                          : role === "pointer"
                            ? "checkpoint.pointer-directory-sync"
                            : path.endsWith("checkpoint-pointer.json.tmp")
                              ? "checkpoint.pointer-temp-sync"
                              : path.endsWith("root.json")
                                ? "checkpoint.root-sync"
                                : path.endsWith("records.jsonl") ||
                                    /\/segments\/\d{20}\.jsonl$/.test(path)
                                  ? "checkpoint.page-sync"
                                  : path.endsWith(".tmp")
                                    ? "replace.temp-sync"
                                    : "replace.directory-sync";
                const e = this.mark(point, path);
                if (e) throw e;
                await base.sync();
                if (role) this.pending.delete(path);
                else if (path.endsWith("records.jsonl"))
                    this.pending.set(path.slice(0, path.lastIndexOf("/")), "page");
                else if (path.endsWith("root.json"))
                    this.pending.set(path.slice(0, path.lastIndexOf("/")), "root");
            },
            truncate: async (length) => {
                const e = path.endsWith(".jsonl")
                    ? this.mark("active-tail.truncate", path)
                    : undefined;
                if (e) throw e;
                return base.truncate(length);
            },
            readFile: () => base.readFile(),
            close: async () => {
                this.closedPaths.push(path);
                await base.close();
            }
        };
    }
    mkdir(path: string, options: { recursive: boolean; mode?: number }): Promise<void> {
        return nodeFileSystemPort.mkdir(path, options);
    }
    rename(from: string, to: string): Promise<void> {
        const point: FaultPoint = from.endsWith("checkpoint-pointer.json.tmp")
            ? "checkpoint.pointer-rename"
            : "replace.rename";
        const e = this.mark(point, from);
        return e
            ? Promise.reject(e)
            : nodeFileSystemPort.rename(from, to).then(() => {
                  if (point === "checkpoint.pointer-rename")
                      this.pending.set(to.slice(0, to.lastIndexOf("/")), "pointer");
              });
    }
    unlink(path: string): Promise<void> {
        const e = /\/segments\/\d{20}\.jsonl$/.test(path)
            ? this.mark("checkpoint.segment-unlink", path)
            : undefined;
        return e ? Promise.reject(e) : nodeFileSystemPort.unlink(path);
    }
    rm(path: string, options: { recursive: true; force: true }): Promise<void> {
        return nodeFileSystemPort.rm(path, options);
    }
    stat(path: string) {
        return nodeFileSystemPort.stat(path);
    }
    lstat(path: string) {
        return nodeFileSystemPort.lstat(path);
    }
    readdir(path: string, options: { withFileTypes: true }) {
        return nodeFileSystemPort.readdir(path, options);
    }
}
