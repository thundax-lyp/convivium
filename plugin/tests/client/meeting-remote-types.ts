import type { ClientRemote } from "@deepseek-ai/dsh-api-gateway/client";
import type { MeetingClient } from "@/client/meeting-client.js";
import type {
    MeetingRefreshNoticeV1,
    MeetingStatusResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1
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
const stream: RemoteStream<MeetingRefreshNoticeV1> = createControlledMeetingStream({
    generation: { getSnapshot: () => undefined, subscribe: () => () => undefined }
}).stream;
const adapterStream: ReturnType<MeetingClient["openUpdates"]> = stream;
void adapterStream;
void ({} as typeof loadRemoteClientModule);

// @ts-expect-error protocolVersion must be the literal 1
remote.conviviumMeetings.getStatus({ protocolVersion: 2, meetingId: "meeting-1" });
