import type { MeetingCommandRepositoryPortV1 } from "@/repository/meeting-command-repository-v1.js";
import type { RecoveryResult } from "@/repository/types.js";

export async function recoverMeetingCommandsV1(
    repository: MeetingCommandRepositoryPortV1
): Promise<RecoveryResult> {
    return repository.recover();
}
