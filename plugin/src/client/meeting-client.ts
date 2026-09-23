import type { ClientRemote, RemoteStream } from "@deepseek-ai/dsh-api-gateway/client";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type {} from "@convivium/dsh-plugin/remote";
import {
    MeetingCommandResultSchema,
    MeetingListResultSchema,
    MeetingReadResultSchema,
    ReadMeetingRequestSchema,
    type MeetingCommandResult,
    type MeetingCommand,
    type MeetingListResult,
    type MeetingReadResult,
    type ReadMeetingRequest,
    type RefreshNotice,
    type ProtocolError
} from "@/protocol/index.js";

export class ProtocolFailure extends Error {
    constructor(readonly protocolError: ProtocolError) {
        super(protocolError.message);
        this.name = "ProtocolFailure";
    }
}

export interface MeetingRefreshCallbacks {
    carrierFailed(): void;
    generationReopened(): void;
}

export interface MeetingClient {
    list(signal?: AbortSignal): Promise<MeetingListResult>;
    read(request: ReadMeetingRequest, signal?: AbortSignal): Promise<MeetingReadResult>;
    control(command: MeetingCommand, signal?: AbortSignal): Promise<MeetingCommandResult>;
    subscribeRefresh(callbacks: MeetingRefreshCallbacks): RemoteStream<RefreshNotice>;
}

const protocolFailure = (value: unknown): ProtocolFailure => {
    const error = value as ProtocolError;
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
};

const remoteFailure = (error: unknown): never => {
    if (typeof error === "object" && error !== null && "code" in error) {
        const code = String(
            (
                error as {
                    code: string;
                }
            ).code
        );
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
};

const unwrap = async <T>(
    remote: Promise<RemoteResult<T>>,
    schema: (value: unknown) => T
): Promise<T> => {
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
};

export const createMeetingClient = (remote: ClientRemote): MeetingClient => {
    const service = remote.conviviumMeetings;
    return {
        list: (signal) =>
            unwrap(service.list(signal), (value) => MeetingListResultSchema.parse(value)),
        read: (request, signal) => {
            const validated = ReadMeetingRequestSchema.parse(request);
            return unwrap(service.read(validated, signal), (value) =>
                MeetingReadResultSchema.parse(value)
            );
        },
        control: (command, signal) =>
            unwrap(service.control(command, signal), (value) =>
                MeetingCommandResultSchema.parse(value)
            ),
        subscribeRefresh: (callbacks) => {
            let opened = false;
            return remote.$stream({
                name: "convivium-meetings-refresh",
                open: (signal) => {
                    if (opened) callbacks.generationReopened();
                    else opened = true;
                    return service.subscribeRefresh(signal);
                },
                ended: () => new Error("Meeting refresh stream ended."),
                carrierFailed: callbacks.carrierFailed
            });
        }
    };
};
