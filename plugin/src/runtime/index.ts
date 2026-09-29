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
    startFromSkill(command: MeetingCommand, signal: AbortSignal): Promise<MeetingCommandResult>;
    cancelFromSkill(command: MeetingCommand, signal: AbortSignal): Promise<MeetingCommandResult>;
    subscribeRefresh(signal: AbortSignal): AsyncIterable<RefreshNotice>;
}

export { createMeetingCreationCoordinator } from "./meeting-runtime.js";
export {
    activateTargetMeetingApplication,
    getMeetingCommandApplication,
    getMeetingIdentityReader,
    getLocalMeetingWebRuntime
} from "./meeting-lifecycle.js";
export { createOutboxWorker } from "./outbox-worker.js";
export type { OutboxPollResult, OutboxWorkerOptions } from "./outbox-worker.js";
export {
    createMeetingCommandApplication,
    type MeetingCommandApplication
} from "./application-service/index.js";
export { createMeetingIdentityEffectHandler } from "./application-service/index.js";
export { provisionMeetingIdentity } from "./services/index.js";
export { createMeetingNoticeDispatcher } from "./services/index.js";
export { createMeetingIdentityReader, type MeetingIdentityReader } from "./services/index.js";
export {
    createEvidenceReviewDispatcher,
    createReviewDeliveryDispatcher
} from "./services/index.js";
export { createMeetingArchiveDispatcher } from "./services/index.js";
export { recoverMeetingCommands } from "./services/index.js";
export type { MeetingOutboxWakeup } from "./outbox-worker.js";
