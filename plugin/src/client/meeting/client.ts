import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { ClientRemote, RemoteStream } from "@deepseek-ai/dsh-api-gateway/client";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import {
    DeleteMeetingRequestSchema,
    DeleteMeetingResultSchema,
    type DeleteMeetingRequest,
    type DeleteMeetingResult
} from "@/protocol/index.ts";
import type {} from "@convivium/dsh-plugin/remote";
import {
    CaptainMeetingCommandSchema,
    MeetingCommandResultSchema,
    MeetingListResultSchema,
    MeetingReadResultSchema,
    ReadMeetingRequestSchema,
    type MeetingCommandResult,
    type CaptainMeetingCommand,
    type MeetingListResult,
    type MeetingReadResult,
    type ReadMeetingRequest,
    type RefreshNotice
} from "@/protocol/index.ts";

interface ProtocolError {
    protocolVersion: 1;
    ok: false;
    code: string;
    message: string;
    retryable: boolean;
}

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
    deleteMeeting(
        request: DeleteMeetingRequest,
        signal?: AbortSignal
    ): Promise<DeleteMeetingResult>;
    list(signal?: AbortSignal): Promise<MeetingListResult>;
    read(request: ReadMeetingRequest, signal?: AbortSignal): Promise<MeetingReadResult>;
    control(command: CaptainMeetingCommand, signal?: AbortSignal): Promise<MeetingCommandResult>;
    subscribeRefresh(callbacks: MeetingRefreshCallbacks): RemoteStream<RefreshNotice>;
}

export const withMeetingWriteLock = async <T>(
    lock: MutableRefObject<boolean>,
    setPending: (pending: boolean) => void,
    execute: () => Promise<T>
): Promise<T> => {
    if (lock.current) {
        throw new Error("A user command is already in flight.");
    }
    lock.current = true;
    setPending(true);
    try {
        return await execute();
    } finally {
        lock.current = false;
        setPending(false);
    }
};

const protocolFailure = (value: unknown): ProtocolFailure => {
    const error = value as ProtocolError;
    if (error.code === "convivium/invalid-request") {
        return new ProtocolFailure({
            protocolVersion: 1,
            ok: false,
            code: "INVALID_ARGUMENT",
            message: "Invalid meeting request.",
            retryable: false
        });
    }
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
        if (code === "convivium/invalid-request") {
            throw new ProtocolFailure({
                protocolVersion: 1,
                ok: false,
                code: "INVALID_ARGUMENT",
                message: "Invalid meeting request.",
                retryable: false
            });
        }
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
    if (!result.ok) {
        throw protocolFailure(result.error);
    }
    try {
        return schema(result.value);
    } catch (error) {
        return remoteFailure(error);
    }
};

export const createMeetingClient = (remote: ClientRemote): MeetingClient => {
    const service = remote.conviviumMeetings;
    return {
        deleteMeeting: async (request, signal) => {
            const validated = DeleteMeetingRequestSchema.parse(request);
            const result = await unwrap(service.deleteMeeting(validated, signal), (value) =>
                DeleteMeetingResultSchema.parse(value)
            );
            if (result.kind === "deleted" && result.meetingId !== validated.meetingId) {
                throw new Error("Deletion target mismatch");
            }
            return result;
        },
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
                    if (opened) {
                        callbacks.generationReopened();
                    } else {
                        opened = true;
                    }
                    return service.subscribeRefresh(signal);
                },
                ended: () => new Error("Meeting refresh stream ended."),
                carrierFailed: callbacks.carrierFailed
            });
        }
    };
};

/** Keeps the exact command only while its delivery outcome is uncertain. */
export const useMeetingSubmission = (
    client: MeetingClient,
    disabled: boolean,
    onCommitted: (meetingId: string) => void
) => {
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState<string>();
    const [uncertain, setUncertain] = useState<CaptainMeetingCommand>();
    const inFlight = useRef(false);
    const generation = useRef(0);
    const edit = useCallback(() => {
        generation.current += 1;
        setUncertain(undefined);
        setMessage(undefined);
    }, []);
    const send = async (command: CaptainMeetingCommand) => {
        if (disabled || inFlight.current) {
            return;
        }
        const sentGeneration = generation.current;
        inFlight.current = true;
        setPending(true);
        setMessage(undefined);
        let result: MeetingCommandResult;
        try {
            result = await client.control(command);
        } catch {
            if (generation.current === sentGeneration) {
                setUncertain(command);
                setMessage("uncertain");
            }
            inFlight.current = false;
            setPending(false);
            return;
        }
        if (generation.current === sentGeneration) {
            setUncertain(undefined);
        }
        try {
            if (result.kind === "accepted") {
                if (generation.current === sentGeneration) {
                    setMessage("committed");
                }
                await Promise.all([
                    client.list(),
                    client.read({ protocolVersion: 1, meetingId: result.meetingId })
                ]);
                onCommitted(result.meetingId);
            } else {
                if (generation.current === sentGeneration) {
                    setMessage(result.error.code);
                }
                if (result.error.code === "VERSION_CONFLICT") {
                    await client.read({ protocolVersion: 1, meetingId: command.meetingId });
                    onCommitted(command.meetingId);
                }
            }
        } catch {
            if (generation.current === sentGeneration) {
                setMessage("refresh_failed");
            }
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    };
    return {
        pending,
        message,
        uncertain: uncertain !== undefined,
        edit,
        invalid: () => setMessage("invalid"),
        submit: (meetingId: string, version: number, action: CaptainMeetingCommand["action"]) => {
            if (disabled || inFlight.current) {
                return;
            }
            const parsed = CaptainMeetingCommandSchema.safeParse({
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: version,
                requestId: crypto.randomUUID(),
                action
            });
            if (!parsed.success) {
                setMessage("invalid");
                return;
            }
            return send(parsed.data);
        },
        retry: () => uncertain && send(uncertain)
    };
};
