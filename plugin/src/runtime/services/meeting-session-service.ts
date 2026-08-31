import type { ArchiveSessionRuntime, ContinuableLifecycleRuntime } from "../../dsh/index.js";
import type { MeetingState } from "../../domain/index.js";
import type { MeetingRepositoryRuntime } from "../meeting-runtime.js";

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

export interface MeetingTaskCallerIdentity {
    readonly sessionId: string;
    readonly kind: "captain" | "manager" | "participant";
    readonly participantId?: string;
}

/** Reads a task only while the caller owns an active Participant capability. */
export async function readAuthorizedMeetingTask(
    repository: MeetingRepositoryRuntime,
    caller: MeetingTaskCallerIdentity,
    meetingTaskId: string,
    executionId?: string
) {
    if (caller.kind !== "participant" || caller.participantId === undefined) return undefined;
    const recovered = await repository.recover();
    const ownership = recovered.sessionOwnership.find(
        (candidate) =>
            candidate.sessionId === caller.sessionId &&
            candidate.role === "participant" &&
            candidate.participantId === caller.participantId &&
            candidate.lifecycleStatus === "active" &&
            candidate.capabilityStatus === "active"
    );
    if (ownership === undefined) return undefined;
    const state = recovered.snapshot?.state as unknown as MeetingState | undefined;
    const task = state?.meetingTasks?.find(
        (candidate) => candidate.meetingTaskId === meetingTaskId
    );
    return task === undefined ||
        task.participantId !== caller.participantId ||
        (executionId !== undefined && task.executionId !== executionId)
        ? undefined
        : { recovered, state: state!, task };
}
