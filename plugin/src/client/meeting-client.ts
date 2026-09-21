import type { ClientRemote, RemoteStream } from "@deepseek-ai/dsh-api-gateway/client";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type {} from "@convivium/dsh-plugin/remote";
import {
    MeetingCommandResultSchema,
    MeetingListResultSchema,
    MeetingReadResultSchema,
    ReadMeetingRequestV1Schema,
    type MeetingCommandResult,
    type MeetingCommand,
    type MeetingListResult,
    type MeetingReadResult,
    type ReadMeetingRequestV1,
    type RefreshNoticeV1,
    type ProtocolErrorV1
} from "@/protocol/index.js";

export class ProtocolFailure extends Error {
    constructor(readonly protocolError: ProtocolErrorV1) {
        super(protocolError.message);
        this.name = "ProtocolFailure";
    }
}

export interface MeetingClient {
    list(signal?: AbortSignal): Promise<MeetingListResult>;
    read(request: ReadMeetingRequestV1, signal?: AbortSignal): Promise<MeetingReadResult>;
    control(command: MeetingCommand, signal?: AbortSignal): Promise<MeetingCommandResult>;
    subscribeRefresh(onUnavailable: () => void): RemoteStream<RefreshNoticeV1>;
}

function protocolFailure(value: unknown): ProtocolFailure {
    const error = value as ProtocolErrorV1;
    if (error.code === "convivium/invalid-request")
        return new ProtocolFailure({
            protocolVersion: 1,
            ok: false,
            code: "INVALID_ARGUMENT",
            message: "Invalid meeting request.",
            retryable: false
        });
    return new ProtocolFailure({
        protocolVersion: 1,
        ok: false,
        code: error.code ?? "INVALID_ARGUMENT",
        message: error.message ?? "Meeting request failed.",
        retryable: error.retryable ?? false
    });
}

function remoteFailure(error: unknown): never {
    if (typeof error === "object" && error !== null && "code" in error) {
        const code = String((error as { code: string }).code);
        if (code === "convivium/invalid-request")
            throw new ProtocolFailure({
                protocolVersion: 1,
                ok: false,
                code: "INVALID_ARGUMENT",
                message: "Invalid meeting request.",
                retryable: false
            });
    }
    throw error;
}

async function unwrap<T>(
    remote: Promise<RemoteResult<T>>,
    schema: (value: unknown) => T
): Promise<T> {
    let result: RemoteResult<T>;
    try {
        result = await remote;
    } catch (error) {
        return remoteFailure(error);
    }
    if (!result.ok) throw protocolFailure(result.error);
    try {
        return schema(result.value);
    } catch (error) {
        return remoteFailure(error);
    }
}

export function createMeetingClient(remote: ClientRemote): MeetingClient {
    const service = remote.conviviumMeetings;
    return {
        list: (signal) =>
            unwrap(service.list(signal), (value) => MeetingListResultSchema.parse(value)),
        read: (request, signal) => {
            const validated = ReadMeetingRequestV1Schema.parse(request);
            return unwrap(service.read(validated, signal), (value) =>
                MeetingReadResultSchema.parse(value)
            );
        },
        control: (command, signal) =>
            unwrap(service.control(command, signal), (value) =>
                MeetingCommandResultSchema.parse(value)
            ),
        subscribeRefresh: (onUnavailable) =>
            remote.$stream({
                name: "convivium-meetings-refresh",
                open: (signal) => service.subscribeRefresh(signal),
                ended: () => new Error("Meeting refresh stream ended."),
                carrierFailed: onUnavailable
            })
    };
}
