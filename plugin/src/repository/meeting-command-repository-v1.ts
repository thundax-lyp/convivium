import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type {
    ClaimOutboxInput,
    CommittedResult,
    CompleteOutboxInput,
    MeetingSnapshot,
    OutboxCompletionResult,
    OutboxItem,
    RecoverInput,
    RecoveryResult,
    RepositoryCommand,
    RenewOutboxLeaseInput
} from "@/repository/types.js";

export interface MeetingCommandRepositoryPortV1 {
    readonly teamId: string;
    readonly meetingId: string;
    read(): Promise<MeetingSnapshot>;
    execute<T>(command: RepositoryCommand<T>): Promise<CommittedResult<T>>;
    recover(input?: RecoverInput): Promise<RecoveryResult>;
    claimOutbox(input: ClaimOutboxInput): Promise<OutboxItem[]>;
    completeOutbox(input: CompleteOutboxInput): Promise<OutboxCompletionResult>;
    renewOutboxLease(input: RenewOutboxLeaseInput): Promise<number>;
}

export function adaptMeetingRepositoryV1(
    repository: MeetingRepositoryPort
): MeetingCommandRepositoryPortV1 {
    return repository;
}
