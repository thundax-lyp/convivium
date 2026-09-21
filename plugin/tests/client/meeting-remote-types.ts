import type { ClientRemote } from "@deepseek-ai/dsh-api-gateway/client";
import type { MeetingClient } from "@/client/meeting-client.js";
import type {
    MeetingCommandResult,
    MeetingListResult,
    MeetingReadResult,
    RefreshNotice
} from "@/protocol/index.js";
import type { loadRemoteClientModule } from "../fixtures/remote-client.js";
import type { RemoteStream } from "@deepseek-ai/dsh-api-gateway/client";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";

declare const remote: ClientRemote;
const input = { protocolVersion: 1 as const, meetingId: "meeting-1" };
const listCall: Promise<RemoteResult<MeetingListResult>> = remote.conviviumMeetings.list();
const readCall: Promise<RemoteResult<MeetingReadResult>> = remote.conviviumMeetings.read(input);
const controlCall: Promise<RemoteResult<MeetingCommandResult>> = remote.conviviumMeetings.control({
    protocolVersion: 1,
    meetingId: "meeting-1",
    requestId: "end-1",
    expectedMeetingVersion: 2,
    action: {
        kind: "end_meeting",
        outcome: "partial",
        reason: "done",
        decisionIds: [],
        completionFactIds: [],
        unresolvedQuestionIds: [],
        unresolvedIssueIds: []
    }
});
void listCall;
void readCall;
void controlCall;
declare const stream: RemoteStream<RefreshNotice>;
const adapterStream: ReturnType<MeetingClient["subscribeRefresh"]> = stream;
void adapterStream;
void ({} as typeof loadRemoteClientModule);

// @ts-expect-error protocolVersion must be the literal 1
remote.conviviumMeetings.read({ protocolVersion: 2, meetingId: "meeting-1" });
