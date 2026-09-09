import type {
    CaptainDecisionAcceptanceInputV1,
    CaptainDecisionDispositionInputV1,
    CaptainRiskDispositionInputV1,
    EndMeetingInputV1,
    MeetingStatusInputV1,
    PauseMeetingInputV1,
    ReassignTurnInputV1,
    ResumeMeetingInputV1
} from "@/protocol/index.js";

export type RemoteJsonValue =
    | null
    | boolean
    | number
    | string
    | readonly RemoteJsonValue[]
    | { readonly [key: string]: RemoteJsonValue };

type RemoteInput<T> = T & Record<string, RemoteJsonValue>;

export type RemoteStatusInput = RemoteInput<MeetingStatusInputV1>;
export type RemotePauseInput = RemoteInput<PauseMeetingInputV1>;
export type RemoteResumeInput = RemoteInput<ResumeMeetingInputV1>;
export type RemoteReassignInput = RemoteInput<ReassignTurnInputV1>;
export type RemoteEndInput = RemoteInput<EndMeetingInputV1>;
export type RemoteAcceptDecisionInput = RemoteInput<CaptainDecisionAcceptanceInputV1>;
export type RemoteDisposeDecisionInput = RemoteInput<CaptainDecisionDispositionInputV1>;
export type RemoteDisposeRiskInput = RemoteInput<CaptainRiskDispositionInputV1>;

declare module "@deepseek-ai/dsh-typert-protocol" {
    interface RemoteErrorDetailsMap {
        "convivium/invalid-request": { readonly retryable: false };
        "convivium/recovery-unavailable": { readonly retryable: true };
        "convivium/internal": { readonly retryable: false };
    }
}
