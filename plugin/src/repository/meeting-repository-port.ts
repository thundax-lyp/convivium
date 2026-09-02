import type {
    ClaimOutboxInput,
    CommittedResult,
    CompleteOutboxInput,
    CreateMeetingInput,
    CreateMeetingResult,
    MeetingBootstrap,
    MeetingSnapshot,
    PrivateMeetingMail,
    SendPrivateMeetingMailInput,
    StartPrivateMeetingMailInput,
    FinishPrivateMeetingMailInput,
    CancelPrivateMeetingMailInput,
    OutboxCompletionResult,
    OutboxItem,
    RecoverInput,
    RecoveryResult,
    RepositoryCommand,
    RenewOutboxLeaseInput,
    SessionOwnership,
    SessionOwnershipInput,
    UpdateBootstrapInput,
    UpdateCreateResultInput
} from "./types.js";

export interface MeetingRepositoryPort {
    readonly teamId: string;
    readonly meetingId: string;
    create(input: CreateMeetingInput): Promise<MeetingBootstrap>;
    completeCreate(input: CreateMeetingInput): Promise<CommittedResult<CreateMeetingResult>>;
    updateCreateResult(input: UpdateCreateResultInput): Promise<CreateMeetingResult>;
    updateBootstrap(input: UpdateBootstrapInput): Promise<MeetingBootstrap>;
    recordSessionOwnership(input: SessionOwnershipInput, now?: number): Promise<SessionOwnership>;
    read(): Promise<MeetingSnapshot>;
    readPrivateMeetingMail(mailId: string): Promise<PrivateMeetingMail | undefined>;
    listOverduePrivateMeetingMail(now: number): Promise<PrivateMeetingMail[]>;
    hasUnfinishedPrivateMeetingMail(): Promise<boolean>;
    sendPrivateMeetingMail(
        input: SendPrivateMeetingMailInput
    ): Promise<CommittedResult<{ mailId: string; handlingAttemptId: string }>>;
    startPrivateMeetingMail(input: StartPrivateMeetingMailInput): Promise<PrivateMeetingMail>;
    finishPrivateMeetingMail(input: FinishPrivateMeetingMailInput): Promise<PrivateMeetingMail>;
    cancelUnfinishedPrivateMeetingMail(input: CancelPrivateMeetingMailInput): Promise<number>;
    execute<T>(command: RepositoryCommand<T>): Promise<CommittedResult<T>>;
    claimOutbox(input: ClaimOutboxInput): Promise<OutboxItem[]>;
    completeOutbox(input: CompleteOutboxInput): Promise<OutboxCompletionResult>;
    renewOutboxLease(input: RenewOutboxLeaseInput): Promise<number>;
    recover(input?: RecoverInput): Promise<RecoveryResult>;
    close(): Promise<void>;
}
