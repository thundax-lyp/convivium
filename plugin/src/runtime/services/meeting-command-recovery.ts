import type { MeetingState } from "@/domain/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { RecoveryResult } from "@/repository/types.js";
import type { MeetingOutboxWakeup } from "@/runtime/outbox-worker.js";

export interface MeetingCommandRecoveryDependencies {
    readonly repository: MeetingRepositoryPort<MeetingState>;
    readonly wakeOutbox?: MeetingOutboxWakeup["wake"];
}

export async function recoverMeetingCommands(
    repositoryOrDependencies:
        MeetingRepositoryPort<MeetingState> | MeetingCommandRecoveryDependencies
): Promise<RecoveryResult<MeetingState>> {
    const dependencies =
        "repository" in repositoryOrDependencies
            ? repositoryOrDependencies
            : { repository: repositoryOrDependencies };
    const recovered = await dependencies.repository.recover();
    if (recovered.pendingOutbox > 0) dependencies.wakeOutbox?.();
    return recovered;
}
