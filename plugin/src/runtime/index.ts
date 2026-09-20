import type {
    MeetingCommandResultV1,
    MeetingCommandV1,
    MeetingListResultV1,
    MeetingReadResultV1,
    RefreshNoticeV1
} from "@/protocol/index.js";

export interface LocalMeetingWebRuntime {
    list(signal: AbortSignal): Promise<MeetingListResultV1>;
    read(
        request: { readonly protocolVersion: 1; readonly meetingId: string },
        signal: AbortSignal
    ): Promise<MeetingReadResultV1>;
    control(command: MeetingCommandV1, signal: AbortSignal): Promise<MeetingCommandResultV1>;
    subscribeRefresh(signal: AbortSignal): AsyncIterable<RefreshNoticeV1>;
}

export type { MeetingToolCaller, MeetingToolRuntime } from "./application-service/index.js";

export {
    createMeetingCreationCoordinatorV1,
    createMeetingRuntime,
    openMeetingRepository
} from "./meeting-runtime.js";
export {
    activateTargetMeetingApplicationV1,
    getMeetingCommandApplicationV1,
    getLocalMeetingWebRuntimeV1,
    ensureTargetMeetingDeliveryV1
} from "./meeting-lifecycle.js";
export type {
    DomainEventInput,
    JsonObject,
    MeetingCreationRuntimeDependencies,
    MeetingRepositoryOpenInput,
    MeetingRepositoryRuntime,
    RepositoryAuthorizationValidator
} from "./meeting-runtime.js";
export { createOutboxWorker } from "./outbox-worker.js";
export {
    archiveBeginCommandKind,
    archiveFinalizeCommandKind,
    beginArchiveFromTermination,
    cleanupOwnedSessions,
    finalizeArchive,
    materializeArchivePackage,
    recoverArchive,
    requireExpectedArchiveOwnerships,
    terminationIdentity
} from "./services/meeting-archive-service.js";
export type {
    BeginArchiveFromTerminationInput,
    CleanupOwnedSessionsInput,
    FinalizeArchiveInput,
    RecoverArchiveInput,
    ArchiveRecoveryResult
} from "./services/meeting-archive-service.js";
export type { OutboxPollResult, OutboxWorkerOptions } from "./outbox-worker.js";
export { rebindCaptainParent } from "./services/meeting-recovery-service.js";
export type { CaptainRebindDependencies } from "./services/meeting-recovery-service.js";
export { AGENT_CATALOG_SERVICE_KEY } from "./services/agent-catalog.js";
export {
    createMeetingCommandApplicationV1,
    type MeetingCommandApplicationV1
} from "./application-service/meeting-command.js";
export { createMeetingIdentityEffectHandlerV1 } from "./application-service/meeting-identity.js";
export { provisionMeetingIdentityV1 } from "./services/meeting-identity-provision.js";
export { createMeetingNoticeDispatcherV1 } from "./services/meeting-notice-dispatch.js";
export {
    createEvidenceReviewDispatcherV1,
    createReviewDeliveryDispatcherV1
} from "./services/evidence-review-dispatch.js";
export { createMeetingArchiveDispatcherV1 } from "./services/meeting-archive.js";
export { recoverMeetingCommandsV1 } from "./services/meeting-command-recovery.js";
export type { MeetingOutboxWakeupV1 } from "./outbox-worker.js";
