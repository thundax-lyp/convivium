import type { ClientRemote, RemoteStream } from "@deepseek-ai/dsh-api-gateway/client";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type Schema from "@deepseek-ai/schemastery";
import type {} from "@convivium/dsh-plugin/remote";
import {
    CaptainDecisionAcceptanceResultSchema,
    CaptainDecisionDispositionResultSchema,
    CaptainRiskDispositionResultSchema,
    EndMeetingResultSchema,
    LocalMeetingListResponseConsumerSchema,
    MeetingControlResultSchema,
    MeetingStatusResultSchema,
    ReassignTurnResultSchema,
    validateProtocolError,
    validateProtocolSuccessEnvelope,
    type CaptainDecisionAcceptanceInputV1,
    type CaptainDecisionAcceptanceResultV1,
    type CaptainDecisionDispositionInputV1,
    type CaptainDecisionDispositionResultV1,
    type CaptainRiskDispositionInputV1,
    type CaptainRiskDispositionResultV1,
    type EndMeetingInputV1,
    type EndMeetingResultV1,
    type LocalMeetingListResponseV1,
    type MeetingControlResultV1,
    type MeetingRefreshNoticeV1,
    type MeetingStatusInputV1,
    type MeetingStatusResultV1,
    type ProtocolErrorV1,
    type ProtocolSuccessV1,
    type ReassignTurnInputV1,
    type ReassignTurnResultV1,
    type PauseMeetingInputV1,
    type ResumeMeetingInputV1
} from "@/protocol/index.js";

export class ProtocolFailure extends Error {
    constructor(readonly protocolError: ProtocolErrorV1) {
        super(protocolError.message);
        this.name = "ProtocolFailure";
    }
}

export interface MeetingClient {
    list(signal?: AbortSignal): Promise<LocalMeetingListResponseV1>;
    getStatus(
        input: MeetingStatusInputV1,
        signal?: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingStatusResultV1>>;
    pause(
        input: PauseMeetingInputV1,
        signal?: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1>>;
    resume(
        input: ResumeMeetingInputV1,
        signal?: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1>>;
    reassign(
        input: ReassignTurnInputV1,
        signal?: AbortSignal
    ): Promise<ProtocolSuccessV1<ReassignTurnResultV1>>;
    end(
        input: EndMeetingInputV1,
        signal?: AbortSignal
    ): Promise<ProtocolSuccessV1<EndMeetingResultV1>>;
    acceptDecision(
        input: CaptainDecisionAcceptanceInputV1,
        signal?: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1>>;
    disposeDecision(
        input: CaptainDecisionDispositionInputV1,
        signal?: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainDecisionDispositionResultV1>>;
    disposeRisk(
        input: CaptainRiskDispositionInputV1,
        signal?: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainRiskDispositionResultV1>>;
    openUpdates(onUnavailable: () => void): RemoteStream<MeetingRefreshNoticeV1>;
}

function protocolFailure(value: unknown): ProtocolFailure {
    return new ProtocolFailure(validateProtocolError(value) as ProtocolErrorV1);
}

function remoteFailure(error: unknown): never {
    if (typeof error === "object" && error !== null && "code" in error) {
        const code = String((error as { code: string }).code);
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
}

async function unwrap<T>(
    remote: Promise<RemoteResult<T | ProtocolErrorV1>>,
    schema: (value: unknown) => T
): Promise<T> {
    let result: RemoteResult<T | ProtocolErrorV1>;
    try {
        result = await remote;
    } catch (error) {
        return remoteFailure(error);
    }
    if (!result.ok) return remoteFailure(result.error);
    try {
        return schema(result.value);
    } catch (error) {
        if (
            typeof result.value === "object" &&
            result.value !== null &&
            "ok" in result.value &&
            result.value.ok === false
        ) {
            throw protocolFailure(result.value);
        }
        throw error;
    }
}

function success<T>(schema: Schema, value: unknown): T {
    return validateProtocolSuccessEnvelope(schema, value) as T;
}

export function createMeetingClient(remote: ClientRemote): MeetingClient {
    const service = remote.conviviumMeetings;
    return {
        list: (signal) => unwrap(service.list(signal), LocalMeetingListResponseConsumerSchema),
        getStatus: (input, signal) =>
            unwrap(service.getStatus({ ...input }, signal), (value) =>
                success<ProtocolSuccessV1<MeetingStatusResultV1>>(MeetingStatusResultSchema, value)
            ),
        pause: (input, signal) =>
            unwrap(service.pause({ ...input }, signal), (value) =>
                success<ProtocolSuccessV1<MeetingControlResultV1>>(
                    MeetingControlResultSchema,
                    value
                )
            ),
        resume: (input, signal) =>
            unwrap(service.resume({ ...input }, signal), (value) =>
                success<ProtocolSuccessV1<MeetingControlResultV1>>(
                    MeetingControlResultSchema,
                    value
                )
            ),
        reassign: (input, signal) =>
            unwrap(service.reassign({ ...input }, signal), (value) =>
                success<ProtocolSuccessV1<ReassignTurnResultV1>>(ReassignTurnResultSchema, value)
            ),
        end: (input, signal) =>
            unwrap(service.end({ ...input }, signal), (value) =>
                success<ProtocolSuccessV1<EndMeetingResultV1>>(EndMeetingResultSchema, value)
            ),
        acceptDecision: (input, signal) =>
            unwrap(service.acceptDecision({ ...input }, signal), (value) =>
                success<ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1>>(
                    CaptainDecisionAcceptanceResultSchema,
                    value
                )
            ),
        disposeDecision: (input, signal) =>
            unwrap(service.disposeDecision({ ...input }, signal), (value) =>
                success<ProtocolSuccessV1<CaptainDecisionDispositionResultV1>>(
                    CaptainDecisionDispositionResultSchema,
                    value
                )
            ),
        disposeRisk: (input, signal) =>
            unwrap(service.disposeRisk({ ...input }, signal), (value) =>
                success<ProtocolSuccessV1<CaptainRiskDispositionResultV1>>(
                    CaptainRiskDispositionResultSchema,
                    value
                )
            ),
        openUpdates: (onUnavailable) =>
            remote.$stream({
                name: "convivium-meetings",
                open: (signal) => service.watchUpdates(signal),
                ended: () => new Error("Meeting update stream ended."),
                carrierFailed: onUnavailable
            })
    };
}
