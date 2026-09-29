import type {
    MeetingCommandResult,
    MeetingCommand,
    MeetingListResult,
    MeetingReadResult,
    RefreshNotice
} from "@/protocol/index.ts";

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

export { createMeetingCreationCoordinator } from "./meeting-runtime.ts";
export {
    activateTargetMeetingApplication,
    getMeetingCommandApplication,
    getMeetingIdentityReader,
    getLocalMeetingWebRuntime
} from "./meeting-lifecycle.ts";
export { createOutboxWorker } from "./outbox-worker.ts";
export type { OutboxPollResult, OutboxWorkerOptions } from "./outbox-worker.ts";
export {
    createMeetingCommandApplication,
    type MeetingCommandApplication
} from "./application-service/index.ts";
export { createMeetingIdentityEffectHandler } from "./application-service/index.ts";
export { provisionMeetingIdentity } from "./services/index.ts";
export { createMeetingNoticeDispatcher } from "./services/index.ts";
export { createMeetingIdentityReader, type MeetingIdentityReader } from "./services/index.ts";
export {
    createEvidenceReviewDispatcher,
    createReviewDeliveryDispatcher
} from "./services/index.ts";
export { createMeetingArchiveDispatcher } from "./services/index.ts";
export { recoverMeetingCommands } from "./services/index.ts";
export type { MeetingOutboxWakeup } from "./outbox-worker.ts";
