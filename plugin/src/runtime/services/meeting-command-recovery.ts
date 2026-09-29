import type { MeetingState } from "@/domain/index.ts";
import type { MeetingRepositoryPort } from "@/repository/index.ts";
import type { RecoveryResult } from "@/repository/index.ts";
import type { MeetingOutboxWakeup } from "@/runtime/index.ts";

export interface MeetingCommandRecoveryDependencies {
    readonly repository: MeetingRepositoryPort<MeetingState>;
    readonly wakeOutbox?: MeetingOutboxWakeup["wake"];
}

export const recoverMeetingCommands = async (
    repositoryOrDependencies:
        MeetingRepositoryPort<MeetingState> | MeetingCommandRecoveryDependencies
): Promise<RecoveryResult<MeetingState>> => {
    const dependencies =
        "repository" in repositoryOrDependencies
            ? repositoryOrDependencies
            : { repository: repositoryOrDependencies };
    const recovered = await dependencies.repository.recover();
    if (recovered.pendingOutbox > 0) {
        dependencies.wakeOutbox?.();
    }
    return recovered;
};
