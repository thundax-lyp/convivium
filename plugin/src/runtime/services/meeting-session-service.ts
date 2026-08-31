import type { ArchiveSessionRuntime, ContinuableLifecycleRuntime } from "../../dsh/index.js";

export type ArchiveCleanupRuntime = ArchiveSessionRuntime & ContinuableLifecycleRuntime;

/** Narrows optional DSH lifecycle capabilities before archive orchestration uses them. */
export function resolveArchiveCleanupRuntime(
    runtime: Partial<ArchiveCleanupRuntime>
): ArchiveCleanupRuntime | undefined {
    if (
        typeof runtime.listChildren !== "function" ||
        typeof runtime.interrupt !== "function" ||
        typeof runtime.drainContinuableChildren !== "function"
    ) {
        return undefined;
    }
    return runtime as ArchiveCleanupRuntime;
}
