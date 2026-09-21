import type {
    MeetingCommandResult,
    MeetingCommand,
    MeetingListResult,
    MeetingReadResult,
    RefreshNoticeV1
} from "@/protocol/index.js";

export interface LocalMeetingWebRuntime {
    list(signal: AbortSignal): Promise<MeetingListResult>;
    read(
        request: { readonly protocolVersion: 1; readonly meetingId: string },
        signal: AbortSignal
    ): Promise<MeetingReadResult>;
    control(command: MeetingCommand, signal: AbortSignal): Promise<MeetingCommandResult>;
    subscribeRefresh(signal: AbortSignal): AsyncIterable<RefreshNoticeV1>;
}

export type { MeetingToolCaller, MeetingToolRuntime } from "./application-service/index.js";

export { createMeetingCreationCoordinatorV1 } from "./meeting-runtime.js";
export {
    activateTargetMeetingApplicationV1,
    getMeetingCommandApplicationV1,
    getLocalMeetingWebRuntimeV1,
    ensureTargetMeetingDeliveryV1
} from "./meeting-lifecycle.js";
export { createOutboxWorker } from "./outbox-worker.js";
export type { OutboxPollResult, OutboxWorkerOptions } from "./outbox-worker.js";
export { rebindCaptainParent } from "./services/meeting-recovery-service.js";
export type { CaptainRebindDependencies } from "./services/meeting-recovery-service.js";
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
