import {
    mapDeveloperMeetingDocument,
    renderArchiveMarkdown,
    renderCurrentMarkdown
} from "../../projection/index.js";
import type { ImmutableArchivePackage } from "../../domain/index.js";
import type { MeetingRepositoryPort } from "../../repository/meeting-repository-port.js";
import type { MeetingSnapshot } from "../../repository/types.js";

export type DeveloperMarkdownOperation =
    | "read_snapshot"
    | "resolve_directory"
    | "map_document"
    | "write_temp"
    | "replace_target"
    | "cleanup_temp";

export interface DeveloperMarkdownWarning {
    operation: DeveloperMarkdownOperation;
    teamId: string;
    meetingId: string;
    sourceMeetingVersion: number;
    projectionKind: "current" | "archive";
}

export interface DeveloperMarkdownService {
    schedule(snapshot: MeetingSnapshot): void;
    dispose(): Promise<void>;
}

interface PendingTask {
    snapshot: MeetingSnapshot;
    key: string;
}

function segment(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
}

function taskKey(snapshot: MeetingSnapshot): string {
    return `${segment(snapshot.teamId)}/${segment(snapshot.meetingId)}`;
}

function safeWarn(
    warn: (warning: DeveloperMarkdownWarning) => void,
    warning: DeveloperMarkdownWarning
): void {
    try {
        warn(warning);
    } catch {
        // The warning sink is outside this projection's failure boundary.
    }
}

function warning(
    warn: (warning: DeveloperMarkdownWarning) => void,
    operation: DeveloperMarkdownOperation,
    task: PendingTask,
    projectionKind: "current" | "archive"
): void {
    safeWarn(warn, {
        operation,
        teamId: task.snapshot.teamId,
        meetingId: task.snapshot.meetingId,
        sourceMeetingVersion: task.snapshot.version,
        projectionKind
    });
}

async function resolveDirectory(root: string, task: PendingTask): Promise<string> {
    const { lstat, mkdir, realpath } = await import("node:fs/promises");
    const { isAbsolute, join, relative } = await import("node:path");
    const rootPath = await realpath(root);
    const parts = [
        ".convivium",
        "meetings",
        segment(task.snapshot.teamId),
        segment(task.snapshot.meetingId)
    ];
    let current = rootPath;
    let firstMissing: string | undefined;
    for (const part of parts) {
        current = join(current, part);
        if (firstMissing !== undefined) continue;
        try {
            const stat = await lstat(current);
            if (stat.isSymbolicLink() || !stat.isDirectory()) {
                throw new Error("Developer Markdown workspace path is not a real directory");
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            firstMissing = current;
        }
    }
    if (firstMissing !== undefined) await mkdir(current, { recursive: true, mode: 0o700 });
    const resolved = await realpath(current);
    const outside = relative(rootPath, resolved);
    if (isAbsolute(outside) || outside === ".." || outside.startsWith(".." + "/")) {
        throw new Error("Developer Markdown workspace path escapes workspace root");
    }
    return resolved;
}

async function replaceAtomically(
    directory: string,
    targetName: string,
    content: string,
    task: PendingTask,
    projectionKind: "current" | "archive",
    warn: (warning: DeveloperMarkdownWarning) => void,
    counter: { value: number }
): Promise<void> {
    const { open, rename, unlink } = await import("node:fs/promises");
    const { join } = await import("node:path");
    counter.value += 1;
    const tempName = `.${targetName}.${process.pid}.${counter.value}.tmp`;
    const tempPath = join(directory, tempName);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
        handle = await open(tempPath, "wx", 0o600);
        await handle.writeFile(content, "utf8");
        await handle.close();
        handle = undefined;
    } catch {
        if (handle !== undefined) {
            try {
                await handle.close();
            } catch {
                // Preserve the original warning operation.
            }
        }
        warning(warn, "write_temp", task, projectionKind);
        try {
            await unlink(tempPath);
        } catch {
            warning(warn, "cleanup_temp", task, projectionKind);
        }
        return;
    }
    try {
        await rename(tempPath, join(directory, targetName));
    } catch {
        warning(warn, "replace_target", task, projectionKind);
        try {
            await unlink(tempPath);
        } catch {
            warning(warn, "cleanup_temp", task, projectionKind);
        }
    }
}

export function createDeveloperMarkdownService(options: {
    workspaceRoot: string;
    openRepository(teamId: string, meetingId: string): Promise<MeetingRepositoryPort>;
    now?: () => number;
    warn(warning: DeveloperMarkdownWarning): void;
}): DeveloperMarkdownService {
    const pending = new Map<string, PendingTask>();
    const counter = { value: 0 };
    let draining = false;
    let disposed = false;
    let drainPromise: Promise<void> | undefined;

    const processTask = async (task: PendingTask): Promise<void> => {
        try {
            const repository = await options.openRepository(
                task.snapshot.teamId,
                task.snapshot.meetingId
            );
            const current = await repository.read();
            if (
                current.teamId !== task.snapshot.teamId ||
                current.meetingId !== task.snapshot.meetingId ||
                current.version < task.snapshot.version
            ) {
                warning(options.warn, "read_snapshot", task, "current");
                return;
            }
            if (current.version > task.snapshot.version) return;
            let directory: string;
            try {
                directory = await resolveDirectory(options.workspaceRoot, task);
            } catch {
                warning(options.warn, "resolve_directory", task, "current");
                return;
            }
            let document;
            const generatedAt = (options.now ?? Date.now)();
            try {
                document = mapDeveloperMeetingDocument(current, generatedAt);
            } catch {
                warning(options.warn, "map_document", task, "current");
                return;
            }
            await replaceAtomically(
                directory,
                "current.md",
                renderCurrentMarkdown(document),
                task,
                "current",
                options.warn,
                counter
            );
            const archivePackage = (
                current.state as { archive?: { package?: ImmutableArchivePackage } }
            ).archive?.package;
            if (archivePackage !== undefined) {
                await replaceAtomically(
                    directory,
                    "archive.md",
                    renderArchiveMarkdown(archivePackage, generatedAt),
                    task,
                    "archive",
                    options.warn,
                    counter
                );
            }
        } catch {
            warning(options.warn, "read_snapshot", task, "current");
        }
    };

    const drain = async (): Promise<void> => {
        draining = true;
        while (pending.size > 0) {
            const task = pending.values().next().value as PendingTask | undefined;
            if (task === undefined) break;
            pending.delete(task.key);
            await processTask(task);
        }
        draining = false;
        drainPromise = undefined;
    };

    return {
        schedule(snapshot): void {
            if (disposed) return;
            const key = taskKey(snapshot);
            const prior = pending.get(key);
            if (prior === undefined || prior.snapshot.version < snapshot.version) {
                pending.set(key, { snapshot, key });
            }
            if (!draining) {
                drainPromise = drain();
            }
        },
        async dispose(): Promise<void> {
            disposed = true;
            pending.clear();
            await drainPromise;
        }
    };
}
