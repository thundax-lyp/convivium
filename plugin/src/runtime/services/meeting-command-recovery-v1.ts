import type { MeetingState } from "@/domain/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { RecoveryResult } from "@/repository/types.js";
import type { MeetingOutboxWakeupV1 } from "@/runtime/outbox-worker.js";

export interface MeetingCommandRecoveryDependenciesV1 {
    readonly repository: MeetingRepositoryPort<MeetingState>;
    readonly wakeOutbox?: MeetingOutboxWakeupV1["wake"];
}

export async function recoverMeetingCommandsV1(
    repositoryOrDependencies:
        MeetingRepositoryPort<MeetingState> | MeetingCommandRecoveryDependenciesV1
): Promise<RecoveryResult<MeetingState>> {
    const dependencies =
        "repository" in repositoryOrDependencies
            ? repositoryOrDependencies
            : { repository: repositoryOrDependencies };
    const recovered = await dependencies.repository.recover();
    if (recovered.pendingOutbox > 0) dependencies.wakeOutbox?.();
    return recovered;
}
