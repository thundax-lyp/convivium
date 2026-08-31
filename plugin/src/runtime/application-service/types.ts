import type { Agent } from "@deepseek-ai/dsh-agent";
import type { MeetingRepositoryRuntime } from "../meeting-runtime.js";

export interface StoredMeeting {
    readonly teamId: string;
    readonly captainSessionId: string;
    readonly repository: MeetingRepositoryRuntime;
    parent?: Agent;
}

export type MeetingControlSource =
    { readonly kind: "captain"; readonly sessionId: string } | { readonly kind: "local_host" };

export type RehydrateMode =
    | { readonly kind: "agent_best_effort" }
    | { readonly kind: "local_list" }
    | { readonly kind: "local_meeting"; readonly meetingId: string };
