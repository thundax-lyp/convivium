import type {
    MeetingCommandResult,
    MeetingCommand,
    MeetingListResult,
    MeetingReadResult,
    RefreshNotice
} from "@/protocol/index.js";

export interface LocalMeetingWebRuntime {
    list(signal: AbortSignal): Promise<MeetingListResult>;
    read(
        request: { readonly protocolVersion: 1; readonly meetingId: string },
        signal: AbortSignal
    ): Promise<MeetingReadResult>;
    control(command: MeetingCommand, signal: AbortSignal): Promise<MeetingCommandResult>;
    subscribeRefresh(signal: AbortSignal): AsyncIterable<RefreshNotice>;
}

export type { MeetingToolCaller, MeetingToolRuntime } from "./application-service/index.js";

export { createMeetingCreationCoordinator } from "./meeting-runtime.js";
export {
    activateTargetMeetingApplication,
    getMeetingCommandApplication,
    getLocalMeetingWebRuntime,
    ensureTargetMeetingDelivery
} from "./meeting-lifecycle.js";
export { createOutboxWorker } from "./outbox-worker.js";
export type { OutboxPollResult, OutboxWorkerOptions } from "./outbox-worker.js";
export { rebindCaptainParent } from "./services/meeting-recovery-service.js";
export type { CaptainRebindDependencies } from "./services/meeting-recovery-service.js";
export {
    createMeetingCommandApplication,
    type MeetingCommandApplication
} from "./application-service/meeting-command.js";
export { createMeetingIdentityEffectHandler } from "./application-service/meeting-identity.js";
export { provisionMeetingIdentity } from "./services/meeting-identity-provision.js";
export { createMeetingNoticeDispatcher } from "./services/meeting-notice-dispatch.js";
export {
    createEvidenceReviewDispatcher,
    createReviewDeliveryDispatcher
} from "./services/evidence-review-dispatch.js";
export { createMeetingArchiveDispatcher } from "./services/meeting-archive.js";
export { recoverMeetingCommands } from "./services/meeting-command-recovery.js";
export type { MeetingOutboxWakeup } from "./outbox-worker.js";
