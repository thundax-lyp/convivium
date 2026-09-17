import type { MeetingState } from "@/domain/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { RecoveryResult } from "@/repository/types.js";

export async function recoverMeetingCommandsV1(
    repository: MeetingRepositoryPort<MeetingState>
): Promise<RecoveryResult<MeetingState>> {
    return repository.recover();
}
