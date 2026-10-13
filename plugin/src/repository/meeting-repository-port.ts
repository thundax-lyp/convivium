import type { PreparedDescriptor } from "@/role-composition/index.ts";
import type { PersistedMeetingEvent } from "@/domain/index.ts";
import type {
    ClaimOutboxInput,
    CommittedFactRecord,
    CommittedResult,
    CompleteOutboxInput,
    CreateMeetingInput,
    CreateMeetingResult,
    MeetingBootstrap,
    MeetingSnapshot,
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
} from "./types.ts";

export interface MeetingRepositoryPort<TState = JsonObject> {
    readonly meetingId: string;
    create(input: CreateMeetingInput<TState>): Promise<MeetingBootstrap>;
    completeCreate(
        input: Pick<CreateMeetingInput<TState>, "requestId" | "requestHash" | "authorization">
    ): Promise<CommittedResult<CreateMeetingResult>>;
    updateCreateResult(input: UpdateCreateResultInput): Promise<CreateMeetingResult>;
    updateBootstrap(input: UpdateBootstrapInput): Promise<MeetingBootstrap>;
    recordSessionOwnership(
        input: SessionOwnershipInput,
        now?: number,
        descriptor?: PreparedDescriptor
    ): Promise<SessionOwnership>;
    read(): Promise<MeetingSnapshot<TState>>;
    readCommittedFacts(): Promise<readonly CommittedFactRecord<TState>[]>;
    readCommittedEvents(): Promise<{ kind: "complete"; events: readonly PersistedMeetingEvent[] }>;
    replayReceipt(
        input: Pick<
            RepositoryCommand<unknown, TState>,
            "requestId" | "commandKind" | "authorization" | "requestHash"
        >
    ): Promise<CommittedResult<unknown> | undefined>;
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
