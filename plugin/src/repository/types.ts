import type { AgentDefinitionBindingV1 } from "@/role-composition/model.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type MeetingEventType = string;

export interface MeetingStateCodec<TState> {
    encode(state: TState): Uint8Array;
    decode(bytes: Uint8Array): TState;
}

export interface CommittedFactRecordV1<TState = JsonObject> {
    factId: string;
    kind: string;
    actorId: string;
    occurredAt: number;
    meetingVersion: number;
    relatedIds: readonly string[];
    payload: JsonObject;
    resultingState: TState;
}

export const OUTBOX_KINDS = ["dispatch"] as const;
export type OutboxKind = (typeof OUTBOX_KINDS)[number];

export interface MeetingSnapshot<TState = JsonObject> {
    meetingId: string;
    version: number;
    state: TState;
    createdAt: number;
    updatedAt: number;
}

export interface DomainEventInput {
    type: MeetingEventType;
    payload: JsonObject;
    turnId?: string;
    attemptId?: string;
}

export interface OutboxInput {
    id?: string;
    deliveryId: string;
    kind: OutboxKind;
    priority?: number;
    payload: JsonObject;
    availableAt?: number;
}

export interface TransitionResult<T, TState = JsonObject> {
    state: TState;
    result: T;
    events: DomainEventInput[];
    outbox: OutboxInput[];
}

export interface RepositoryTransitionContext {
    allSessionOwnershipClosedAfterResult?: boolean;
}

export interface RepositoryCommand<T, TState = JsonObject> {
    requestId: string;
    commandKind: string;
    authorization: CommandAuthorization;
    requestHash: string;
    expectedMeetingVersion: number;
    allowNoop?: boolean;
    facts?: readonly CommittedFactRecordV1<TState>[];
    archiveSessionResult?: {
        sessionOwnershipId: string;
        status: "closed" | "failed";
        failureCode?: string;
    };
    transition: (
        snapshot: MeetingSnapshot<TState>,
        context?: RepositoryTransitionContext
    ) => TransitionResult<T, TState>;
}

export interface CommandAuthorization {
    callerBinding: string;
    capabilityId: string;
    attemptId?: string;
}

export interface RepositoryAuthorizationValidator<TState = JsonObject> {
    validateCreate(input: { meetingId: string; authorization: CommandAuthorization }): void;
    validateCommand(input: {
        snapshot: MeetingSnapshot<TState>;
        command: Pick<RepositoryCommand<unknown, TState>, "commandKind" | "authorization">;
    }): void;
}

export interface CreateMeetingInput<TState = JsonObject> {
    requestId: string;
    authorization: CommandAuthorization;
    requestHash: string;
    initialState: TState;
    createResult?: CreateMeetingResult;
    outbox?: OutboxInput[];
    createdAt?: number;
}

export interface CreateMeetingResult {
    meetingId: string;
    meetingVersion: number;
    status?: "created" | "running" | "waiting";
    participants?: readonly {
        participantKey: string;
        participantId: string;
    }[];
    kind?: "accepted";
    committedVersion?: number;
    receiptId?: string;
    factIds?: readonly string[];
    effects?: readonly {
        id: string;
        kind:
            | "refresh"
            | "session_mail"
            | "agent_notice"
            | "review_delivery"
            | "markdown_projection"
            | "archive"
            | "identity_provision";
        status: "queued";
    }[];
}

export interface UpdateCreateResultInput {
    expectedMeetingVersion: number;
    result: CreateMeetingResult;
    now?: number;
}

export interface CommittedResult<T> {
    requestId: string;
    meetingId: string;
    meetingVersion: number;
    result: T;
    eventSeqs: number[];
}

export interface WorkerLease {
    owner: string;
    ttlMs: number;
}

export interface ClaimOutboxInput extends WorkerLease {
    batchSize: number;
    now?: number;
}

export interface OutboxItem {
    id: string;
    deliveryId: string;
    kind: OutboxKind;
    priority: number;
    payload: JsonObject;
    attempts: number;
    leaseOwner: string;
    leaseToken: string;
    leaseDeadline: number;
}

export type OutboxCompletion =
    | { status: "delivered"; deliveredAt?: number }
    | { status: "retry"; availableAt: number; errorCode: string }
    | { status: "failed"; failedAt?: number; errorCode: string };

export interface CompleteOutboxInput {
    id: string;
    leaseOwner: string;
    leaseToken: string;
    completion: OutboxCompletion;
    now?: number;
}

export interface RenewOutboxLeaseInput {
    id: string;
    leaseOwner: string;
    leaseToken: string;
    ttlMs: number;
    now?: number;
}

export interface OutboxCompletionResult {
    id: string;
    status: OutboxCompletion["status"];
}

export interface RecoverInput {
    now?: number;
}

export interface RecoveryResult<TState = JsonObject> {
    snapshot?: MeetingSnapshot<TState>;
    bootstrap: MeetingBootstrap;
    sessionOwnership: SessionOwnership[];
    reclaimedOutbox: number;
    pendingOutbox: number;
}

export interface MeetingBootstrap {
    status: "creating" | "ready" | "creation_failed";
    createRequestId: string;
    requestHash: string;
    createResult?: CreateMeetingResult;
    createdAt: number;
    updatedAt: number;
    failureCode?: string;
}

export interface SessionOwnership {
    id?: string;
    meetingId?: string;
    identityId?: string;
    lastClosureFailureCode?: string;
    agentDefinition?: AgentDefinitionBindingV1;
    sessionId: string;
    parentSessionId: string;
    sessionLabel: string;
    provider: string;
    initialMessageId?: string;
    supersededBySessionId?: string;
    role: "manager" | "evidence_reviewer" | "participant";
    participantId?: string;
    lifecycleStatus: "provisioning" | "active" | "closed";
    capabilityStatus: "active" | "revoked";
    createdAt: number;
    updatedAt: number;
}

export interface SessionOwnershipInput {
    id?: string;
    meetingId?: string;
    identityId?: string;
    agentDefinition?: AgentDefinitionBindingV1;
    sessionId: string;
    parentSessionId: string;
    sessionLabel: string;
    provider: string;
    initialMessageId?: string;
    supersededBySessionId?: string;
    role: "manager" | "evidence_reviewer" | "participant";
    participantId?: string;
    lifecycleStatus: SessionOwnership["lifecycleStatus"];
    capabilityStatus: SessionOwnership["capabilityStatus"];
}

export interface UpdateBootstrapInput {
    status: "creation_failed";
    failureCode?: string;
    now?: number;
}

export type PrivateMeetingMailStatus =
    "pending" | "processing" | "processed" | "obsolete" | "failed" | "timed_out" | "cancelled";

export interface PrivateMeetingMail {
    mailId: string;
    meetingId: string;
    senderParticipantId: string;
    recipientParticipantId: string;
    content: string;
    meetingContext: JsonObject;
    replyToMailId?: string;
    handlingAttemptId: string;
    status: PrivateMeetingMailStatus;
    snapshotThroughSeq: number;
    processingThroughSeq?: number;
    deliveryId?: string;
    deadlineAt?: number;
    createdAt: number;
    updatedAt: number;
}

export interface SendPrivateMeetingMailInput {
    requestId: string;
    requestHash: string;
    authorization: CommandAuthorization;
    expectedMeetingVersion: number;
    isNewDeliveryAvailable: () => boolean;
    mail: Omit<
        PrivateMeetingMail,
        "status" | "processingThroughSeq" | "deliveryId" | "deadlineAt" | "updatedAt"
    >;
    outbox: OutboxInput;
}

export interface StartPrivateMeetingMailInput {
    requestId: string;
    requestHash: string;
    authorization: CommandAuthorization;
    expectedMeetingVersion: number;
    mailId: string;
    processingThroughSeq: number;
    deliveryId: string;
    deadlineAt: number;
    now?: number;
}

export interface FinishPrivateMeetingMailInput {
    requestId: string;
    requestHash: string;
    authorization: CommandAuthorization;
    expectedMeetingVersion: number;
    mailId: string;
    handlingAttemptId: string;
    deliveryId: string;
    status: Extract<PrivateMeetingMailStatus, "processed" | "obsolete" | "failed" | "timed_out">;
    now?: number;
}

export interface CancelPrivateMeetingMailInput {
    requestId: string;
    requestHash: string;
    authorization: CommandAuthorization;
    expectedMeetingVersion: number;
    now?: number;
}
