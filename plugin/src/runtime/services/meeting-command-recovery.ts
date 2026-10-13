import type { MeetingState } from "@/domain/index.ts";
import type { MeetingRepository } from "@/repository/index.ts";
import type { RecoveryResult } from "@/repository/index.ts";
import type { MeetingOutboxWakeup } from "@/runtime/index.ts";

export interface MeetingCommandRecoveryDependencies {
    readonly repository: MeetingRepository<MeetingState>;
    readonly wakeOutbox?: MeetingOutboxWakeup["wake"];
}

export const recoverMeetingCommands = async (
    repositoryOrDependencies: MeetingRepository<MeetingState> | MeetingCommandRecoveryDependencies
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
