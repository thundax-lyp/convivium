import type { ClientRemote } from "@deepseek-ai/dsh-api-gateway/client";
import type { MeetingClient } from "@/client/meeting-client.js";
import type {
    ContributionResultV1,
    MeetingRefreshNoticeV1,
    MeetingStatusResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1,
    ReadContributionResultV1
} from "@/protocol/index.js";
import { createControlledMeetingStream } from "../fixtures/remote-stream.js";
import type { loadRemoteClientModule } from "../fixtures/remote-client.js";
import type { RemoteStream } from "@deepseek-ai/dsh-api-gateway/client";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";

declare const remote: ClientRemote;
const input = { protocolVersion: 1 as const, meetingId: "meeting-1" };
const statusCall: Promise<
    RemoteResult<ProtocolSuccessV1<MeetingStatusResultV1> | ProtocolErrorV1>
> = remote.conviviumMeetings.getStatus(input);
void statusCall;
const readCall: Promise<
    RemoteResult<ProtocolSuccessV1<ReadContributionResultV1> | ProtocolErrorV1>
> = remote.conviviumMeetings.readContribution({
    protocolVersion: 1,
    meetingId: "meeting-1",
    contributionId: "contribution-1"
});
const controlCall: Promise<
    RemoteResult<ProtocolSuccessV1<ContributionResultV1> | ProtocolErrorV1>
> = remote.conviviumMeetings.controlContribution({
    protocolVersion: 1,
    meetingId: "meeting-1",
    requestId: "retry-1",
    expectedMeetingVersion: 2,
    action: "retry",
    contributionId: "contribution-1",
    generation: 1,
    reason: "retry"
});
void readCall;
void controlCall;
const stream: RemoteStream<MeetingRefreshNoticeV1> = createControlledMeetingStream().stream;
const adapterStream: ReturnType<MeetingClient["openUpdates"]> = stream;
void adapterStream;
void ({} as typeof loadRemoteClientModule);

// @ts-expect-error protocolVersion must be the literal 1
remote.conviviumMeetings.getStatus({ protocolVersion: 2, meetingId: "meeting-1" });
