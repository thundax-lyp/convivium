import type {
    ClaimOutboxInput,
    CommittedFactRecordV1,
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
    JsonObject,
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

export interface MeetingRepositoryPort<TState = JsonObject> {
    readonly meetingId: string;
    create(input: CreateMeetingInput<TState>): Promise<MeetingBootstrap>;
    completeCreate(
        input: CreateMeetingInput<TState>
    ): Promise<CommittedResult<CreateMeetingResult>>;
    updateCreateResult(input: UpdateCreateResultInput): Promise<CreateMeetingResult>;
    updateBootstrap(input: UpdateBootstrapInput): Promise<MeetingBootstrap>;
    recordSessionOwnership(input: SessionOwnershipInput, now?: number): Promise<SessionOwnership>;
    replaceMissingSession(
        previousSessionId: string,
        replacementSessionId: string,
        now?: number
    ): Promise<SessionOwnership>;
    read(): Promise<MeetingSnapshot<TState>>;
    readCommittedFacts(): Promise<readonly CommittedFactRecordV1<TState>[]>;
    readPrivateMeetingMail(mailId: string): Promise<PrivateMeetingMail | undefined>;
    listOverduePrivateMeetingMail(now: number): Promise<PrivateMeetingMail[]>;
    hasUnfinishedPrivateMeetingMail(): Promise<boolean>;
    replayReceipt(
        input: Pick<
            RepositoryCommand<unknown, TState>,
            "requestId" | "commandKind" | "authorization" | "requestHash"
        >
    ): Promise<CommittedResult<unknown> | undefined>;
    sendPrivateMeetingMail(
        input: SendPrivateMeetingMailInput
    ): Promise<CommittedResult<{ mailId: string; handlingAttemptId: string }>>;
    startPrivateMeetingMail(input: StartPrivateMeetingMailInput): Promise<PrivateMeetingMail>;
    finishPrivateMeetingMail(input: FinishPrivateMeetingMailInput): Promise<PrivateMeetingMail>;
    cancelUnfinishedPrivateMeetingMail(input: CancelPrivateMeetingMailInput): Promise<number>;
    execute<T>(command: RepositoryCommand<T, TState>): Promise<CommittedResult<T>>;
    claimOutbox(input: ClaimOutboxInput): Promise<OutboxItem[]>;
    completeOutbox(input: CompleteOutboxInput): Promise<OutboxCompletionResult>;
    requeueAcceptedOutbox(input: {
        deliveryIds: readonly string[];
        expectedMeetingVersion: number;
        now?: number;
    }): Promise<number>;
    renewOutboxLease(input: RenewOutboxLeaseInput): Promise<number>;
    recover(input?: RecoverInput): Promise<RecoveryResult<TState>>;
    close(): Promise<void>;
}
