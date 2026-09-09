import { RemoteStream, type RemoteStreamOptions } from "@deepseek-ai/dsh-api-gateway/client";
import type { ConnectionGenerationState } from "@deepseek-ai/dsh-client-connection/client";
import type { MeetingRefreshNoticeV1 } from "@/protocol/index.js";

export function createControlledMeetingStream(connection: {
    generation: ConnectionGenerationState;
}) {
    const options: RemoteStreamOptions<MeetingRefreshNoticeV1> = {
        name: "convivium-meetings",
        open: async function* () {
            yield { kind: "refresh" };
        },
        ended: () => new Error("Meeting update stream ended.")
    };
    return {
        stream: new RemoteStream(connection, options),
        push: (_notice: MeetingRefreshNoticeV1) => undefined,
        disconnect: () => undefined,
        reconnect: () => undefined
    };
}
