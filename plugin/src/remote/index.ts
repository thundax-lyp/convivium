import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { Context } from "@deepseek-ai/cordis";
import {
    ListMeetingsRequestV1Schema,
    MeetingCommandResultV1Schema,
    MeetingListResultV1Schema,
    MeetingReadResultV1Schema,
    MeetingCommandV1Schema,
    ReadMeetingRequestV1Schema,
    RefreshNoticeV1Schema,
    type MeetingCommandV1
} from "@/protocol/index.js";
import type { LocalMeetingWebRuntime } from "@/runtime/index.js";
import type {
    RemoteMeetingCommand,
    RemoteMeetingCommandResult,
    RemoteMeetingListResult,
    RemoteMeetingReadResult,
    RemoteReadMeetingRequest,
    RemoteRefreshNotice
} from "./types.js";

function invalidRequest(cause: unknown): RemoteError<"convivium/invalid-request"> {
    return new RemoteError(
        "convivium/invalid-request",
        "Invalid meeting request.",
        { retryable: false },
        { cause }
    );
}

function internalFailure(cause: unknown): RemoteError<"convivium/internal"> {
    return new RemoteError(
        "convivium/internal",
        "Meeting data is unavailable.",
        { retryable: false },
        { cause }
    );
}

function mapFailure(signal: AbortSignal, cause: unknown): never {
    if (signal.aborted) throw signal.reason;
    throw internalFailure(cause);
}

export class ConviviumRemoteService extends TypertRemoteService {
    private readonly lifetime = new AbortController();

    constructor(
        ctx: Context,
        private readonly runtime: LocalMeetingWebRuntime
    ) {
        super(ctx, "conviviumMeetings");
        ctx.effect(
            () => () => this.lifetime.abort(new Error("Remote service disposed")),
            "convivium:remote-lifetime"
        );
    }

    @Remote("list")
    async list(signal: AbortSignal): Promise<RemoteMeetingListResult> {
        signal.throwIfAborted();
        try {
            const request = ListMeetingsRequestV1Schema.parse({ protocolVersion: 1 });
            void request;
            return MeetingListResultV1Schema.parse(await this.runtime.list(signal));
        } catch (cause) {
            mapFailure(signal, cause);
        }
    }

    @Remote("read")
    async read(
        request: RemoteReadMeetingRequest,
        signal: AbortSignal
    ): Promise<RemoteMeetingReadResult> {
        signal.throwIfAborted();
        let parsed: { readonly protocolVersion: 1; readonly meetingId: string };
        try {
            parsed = ReadMeetingRequestV1Schema.parse(request);
        } catch (cause) {
            throw invalidRequest(cause);
        }
        try {
            return MeetingReadResultV1Schema.parse(await this.runtime.read(parsed, signal));
        } catch (cause) {
            mapFailure(signal, cause);
        }
    }

    @Remote("control")
    async control(
        command: RemoteMeetingCommand,
        signal: AbortSignal
    ): Promise<RemoteMeetingCommandResult> {
        signal.throwIfAborted();
        let parsed: MeetingCommandV1;
        try {
            parsed = MeetingCommandV1Schema.parse(command);
        } catch (cause) {
            throw invalidRequest(cause);
        }
        try {
            return MeetingCommandResultV1Schema.parse(await this.runtime.control(parsed, signal));
        } catch (cause) {
            mapFailure(signal, cause);
        }
    }

    @Remote({ mode: "stream" })
    subscribeRefresh(signal: AbortSignal): AsyncIterable<RemoteRefreshNotice> {
        const ownedSignal = AbortSignal.any([signal, this.lifetime.signal]);
        return this.refreshStream(ownedSignal);
    }

    private async *refreshStream(signal: AbortSignal): AsyncIterable<RemoteRefreshNotice> {
        try {
            for await (const notice of this.runtime.subscribeRefresh(signal)) {
                signal.throwIfAborted();
                yield RefreshNoticeV1Schema.parse(notice);
            }
        } catch (cause) {
            if (signal.aborted) return;
            throw internalFailure(cause);
        }
    }
}
