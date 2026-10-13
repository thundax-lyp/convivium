import type { PreparedDescriptor } from "@/role-composition/index.ts";
import type {
    ClaimOutboxInput,
    CommittedFactRecord,
    CommittedResult,
    CompleteOutboxInput,
    CreateMeetingInput,
    CreateMeetingResult,
    JsonObject,
    PersistedMeetingEvent,
    MeetingBootstrap,
    MeetingRepository,
    MeetingSnapshot,
    OutboxCompletionResult,
    OutboxItem,
    RecoverInput,
    RecoveryResult,
    RenewOutboxLeaseInput,
    RepositoryCommand,
    SessionOwnership,
    SessionOwnershipInput,
    UpdateBootstrapInput
} from "@/repository/index.ts";
import type { CatalogMeetingRecord } from "@/repository/storage-domain/format/index.ts";
import { MeetingCommandPersistence } from "./meeting-command-persistence.ts";
import { MeetingCreation } from "./meeting-creation.ts";
import { MeetingHistory } from "./meeting-history.ts";
import { MeetingOutbox } from "./meeting-outbox.ts";
import { MeetingOwnership } from "./meeting-ownership.ts";
import {
    MeetingPersistenceState,
    type StorageDomainMeetingRepositoryOpenOptions
} from "./meeting-persistence-state.ts";
import { MeetingPersistenceLifecycle } from "./meeting-persistence-lifecycle.ts";

export type { StorageDomainMeetingRepositoryOpenOptions } from "./meeting-persistence-state.ts";

export class StorageDomainMeetingRepository<
    TState = JsonObject
> implements MeetingRepository<TState> {
    private readonly creation: MeetingCreation<TState>;
    private readonly command: MeetingCommandPersistence<TState>;
    private readonly history: MeetingHistory<TState>;
    private readonly outbox: MeetingOutbox<TState>;
    private readonly ownership: MeetingOwnership<TState>;
    private readonly lifecycle: MeetingPersistenceLifecycle<TState>;

    private constructor(private readonly state: MeetingPersistenceState<TState>) {
        this.creation = new MeetingCreation(state);
        this.command = new MeetingCommandPersistence(state);
        this.history = new MeetingHistory(state);
        this.outbox = new MeetingOutbox(state);
        this.ownership = new MeetingOwnership(state);
        this.lifecycle = new MeetingPersistenceLifecycle(state);
    }

    static async open<TState = JsonObject>(
        options: StorageDomainMeetingRepositoryOpenOptions<TState>
    ): Promise<StorageDomainMeetingRepository<TState>> {
        const state = new MeetingPersistenceState(options);
        await state.initialize();
        return new StorageDomainMeetingRepository(state);
    }

    get meetingId(): string {
        return this.state.meetingId;
    }

    create(input: CreateMeetingInput<TState>): Promise<MeetingBootstrap> {
        return this.creation.create(input);
    }

    completeCreate(
        input: Pick<CreateMeetingInput<TState>, "requestId" | "requestHash" | "authorization">
    ): Promise<CommittedResult<CreateMeetingResult>> {
        return this.creation.completeCreate(input);
    }

    updateBootstrap(input: UpdateBootstrapInput): Promise<MeetingBootstrap> {
        return this.creation.updateBootstrap(input);
    }

    recordSessionOwnership(
        input: SessionOwnershipInput,
        now?: number,
        descriptor?: PreparedDescriptor
    ): Promise<SessionOwnership> {
        return this.ownership.recordSessionOwnership(input, now, descriptor);
    }

    read(): Promise<MeetingSnapshot<TState>> {
        return this.state.read();
    }

    readCommittedFacts(): Promise<readonly CommittedFactRecord<TState>[]> {
        return this.history.readCommittedFacts();
    }

    readCommittedEvents(): Promise<{ kind: "complete"; events: readonly PersistedMeetingEvent[] }> {
        return this.history.readCommittedEvents();
    }

    replayReceipt(
        input: Pick<
            RepositoryCommand<unknown, TState>,
            "requestId" | "commandKind" | "authorization" | "requestHash"
        >
    ): Promise<CommittedResult<unknown> | undefined> {
        return this.command.replayReceipt(input);
    }

    execute<T>(command: RepositoryCommand<T, TState>): Promise<CommittedResult<T>> {
        return this.command.execute(command);
    }

    claimOutbox(input: ClaimOutboxInput): Promise<OutboxItem[]> {
        return this.outbox.claimOutbox(input);
    }

    completeOutbox(input: CompleteOutboxInput): Promise<OutboxCompletionResult> {
        return this.outbox.completeOutbox(input);
    }

    renewOutboxLease(input: RenewOutboxLeaseInput): Promise<number> {
        return this.outbox.renewOutboxLease(input);
    }

    recover(input?: RecoverInput): Promise<RecoveryResult<TState>> {
        return this.lifecycle.recover(input);
    }

    beginDeletion(
        expectedVersion: number,
        validate: (
            recovery: RecoveryResult<TState>
        ) => CatalogMeetingRecord["deletionSummary"] | void
    ): Promise<void> {
        return this.lifecycle.beginDeletion(expectedVersion, validate);
    }

    purgeDeletedData(): Promise<void> {
        return this.lifecycle.purgeDeletedData();
    }

    close(): Promise<void> {
        return this.lifecycle.close();
    }
}
