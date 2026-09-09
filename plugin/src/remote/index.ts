import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { Context } from "@deepseek-ai/cordis";
import type Schema from "@deepseek-ai/schemastery";
import {
    CaptainDecisionAcceptanceInputSchema,
    CaptainDecisionAcceptanceResultSchema,
    CaptainDecisionDispositionInputSchema,
    CaptainDecisionDispositionResultSchema,
    CaptainRiskDispositionInputSchema,
    CaptainRiskDispositionResultSchema,
    EndMeetingInputSchema,
    EndMeetingResultSchema,
    LocalMeetingListResponseSchema,
    MeetingControlResultSchema,
    MeetingStatusInputSchema,
    MeetingStatusResultSchema,
    PauseMeetingInputSchema,
    ReassignTurnResultSchema,
    ResumeMeetingInputSchema,
    validateReassignTurnInput,
    validateProtocolError,
    validateProtocolSuccessEnvelope,
    type CaptainDecisionAcceptanceResultV1,
    type CaptainDecisionDispositionResultV1,
    type CaptainRiskDispositionResultV1,
    type EndMeetingResultV1,
    type LocalMeetingListResponseV1,
    type MeetingControlResultV1,
    type MeetingStatusResultV1,
    type ReassignTurnResultV1,
    type ProtocolErrorV1,
    type ProtocolSuccessV1,
    type MeetingRefreshNoticeV1
} from "@/protocol/index.js";
import {
    LocalMeetingRecoveryUnavailableError,
    type LocalMeetingWebRuntime
} from "@/runtime/index.js";
import type {
    RemoteAcceptDecisionInput,
    RemoteDisposeDecisionInput,
    RemoteDisposeRiskInput,
    RemoteEndInput,
    RemotePauseInput,
    RemoteReassignInput,
    RemoteResumeInput,
    RemoteStatusInput
} from "./types.js";

const maxInputBytes = 16_384;
type InputValidator<T> = Schema | ((value: unknown) => T);

function assertExactInputKeys(
    input: unknown,
    expected: readonly string[]
): asserts input is object {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("Meeting input must be an object.");
    }
    const actual = Object.keys(input).sort();
    const keys = [...expected].sort();
    if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
        throw new TypeError("Meeting input has unexpected fields.");
    }
}

function validateInput<T>(
    input: unknown,
    expected: readonly string[],
    schema: InputValidator<T>
): T {
    const bytes = Buffer.byteLength(JSON.stringify(input), "utf8");
    if (bytes > maxInputBytes) throw new TypeError("Meeting input is too large.");
    assertExactInputKeys(input, expected);
    return (schema as (value: unknown) => T)(input);
}

function invalidRequest(cause: unknown): RemoteError<"convivium/invalid-request"> {
    return new RemoteError(
        "convivium/invalid-request",
        "Invalid meeting request.",
        {
            retryable: false
        },
        { cause }
    );
}

function recoveryUnavailable(cause: unknown): RemoteError<"convivium/recovery-unavailable"> {
    return new RemoteError(
        "convivium/recovery-unavailable",
        "Meeting data is unavailable.",
        {
            retryable: true
        },
        { cause }
    );
}

function internalFailure(cause: unknown): RemoteError<"convivium/internal"> {
    return new RemoteError(
        "convivium/internal",
        "Meeting data is unavailable.",
        {
            retryable: false
        },
        { cause }
    );
}

function validateResult<T>(schema: Schema, value: unknown): ProtocolSuccessV1<T> | ProtocolErrorV1 {
    if (typeof value !== "object" || value === null || !Object.hasOwn(value, "ok")) {
        throw new TypeError("Meeting result envelope is invalid.");
    }
    if ((value as { ok?: unknown }).ok === false) return validateProtocolError(value);
    return validateProtocolSuccessEnvelope(schema, value);
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
    async list(signal: AbortSignal): Promise<LocalMeetingListResponseV1> {
        signal.throwIfAborted();
        let value: LocalMeetingListResponseV1;
        try {
            value = await this.runtime.listLocalMeetings();
        } catch (cause) {
            throw mapFailure(signal, cause);
        }
        try {
            return LocalMeetingListResponseSchema(value);
        } catch (cause) {
            throw internalFailure(cause);
        }
    }

    @Remote("getStatus")
    getStatus(
        input: RemoteStatusInput,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingStatusResultV1> | ProtocolErrorV1> {
        return this.unary(
            input,
            signal,
            ["protocolVersion", "meetingId"],
            MeetingStatusInputSchema,
            MeetingStatusResultSchema,
            (value) => this.runtime.getLocalMeetingStatus(value)
        );
    }

    @Remote("pause")
    pause(
        input: RemotePauseInput,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1> {
        return this.unary(
            input,
            signal,
            ["protocolVersion", "meetingId", "expectedMeetingVersion", "requestId", "reason"],
            PauseMeetingInputSchema,
            MeetingControlResultSchema,
            (value) => this.runtime.pauseLocalMeeting(value)
        );
    }

    @Remote("resume")
    resume(
        input: RemoteResumeInput,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1> {
        return this.unary(
            input,
            signal,
            ["protocolVersion", "meetingId", "expectedMeetingVersion", "requestId"],
            ResumeMeetingInputSchema,
            MeetingControlResultSchema,
            (value) => this.runtime.resumeLocalMeeting(value)
        );
    }

    @Remote("reassign")
    reassign(
        input: RemoteReassignInput,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<ReassignTurnResultV1> | ProtocolErrorV1> {
        return this.unary(
            input,
            signal,
            [
                "protocolVersion",
                "meetingId",
                "expectedMeetingVersion",
                "currentAttemptId",
                "action",
                "reason",
                "requestId"
            ],
            validateReassignTurnInput,
            ReassignTurnResultSchema,
            (value) => this.runtime.reassignLocalTurn(value)
        );
    }

    @Remote("end")
    end(
        input: RemoteEndInput,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<EndMeetingResultV1> | ProtocolErrorV1> {
        return this.unary(
            input,
            signal,
            [
                "protocolVersion",
                "meetingId",
                "expectedMeetingVersion",
                "outcome",
                "reason",
                "acceptedDecisionIds",
                "deferredAgendaItemIds",
                "waivers",
                "requestId"
            ],
            EndMeetingInputSchema,
            EndMeetingResultSchema,
            (value) => this.runtime.endLocalMeeting(value)
        );
    }

    @Remote("acceptDecision")
    acceptDecision(
        input: RemoteAcceptDecisionInput,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1> | ProtocolErrorV1> {
        return this.unary(
            input,
            signal,
            [
                "protocolVersion",
                "meetingId",
                "expectedMeetingVersion",
                "requestId",
                "decisionCandidateId",
                "reason",
                "evidenceMessageIds"
            ],
            CaptainDecisionAcceptanceInputSchema,
            CaptainDecisionAcceptanceResultSchema,
            (value) => this.runtime.acceptLocalDecision(value)
        );
    }

    @Remote("disposeDecision")
    disposeDecision(
        input: RemoteDisposeDecisionInput,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainDecisionDispositionResultV1> | ProtocolErrorV1> {
        return this.unary(
            input,
            signal,
            [
                "protocolVersion",
                "meetingId",
                "expectedMeetingVersion",
                "requestId",
                "decisionId",
                "action",
                "reason",
                "evidenceMessageIds"
            ],
            CaptainDecisionDispositionInputSchema,
            CaptainDecisionDispositionResultSchema,
            (value) => this.runtime.disposeLocalDecision(value)
        );
    }

    @Remote("disposeRisk")
    disposeRisk(
        input: RemoteDisposeRiskInput,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainRiskDispositionResultV1> | ProtocolErrorV1> {
        return this.unary(
            input,
            signal,
            [
                "protocolVersion",
                "meetingId",
                "expectedMeetingVersion",
                "requestId",
                "issueId",
                "decision",
                "reason",
                "evidenceMessageIds"
            ],
            CaptainRiskDispositionInputSchema,
            CaptainRiskDispositionResultSchema,
            (value) => this.runtime.disposeLocalRisk(value)
        );
    }

    @Remote({ mode: "stream" })
    watchUpdates(signal: AbortSignal): AsyncIterable<MeetingRefreshNoticeV1> {
        return this.runtime.watchLocalMeetingUpdates(
            AbortSignal.any([signal, this.lifetime.signal])
        );
    }

    private async unary<Input, Parsed, Result>(
        input: Input,
        signal: AbortSignal,
        expected: readonly string[],
        inputSchema: InputValidator<Parsed>,
        resultSchema: Schema,
        invoke: (value: Parsed) => Promise<unknown>
    ): Promise<ProtocolSuccessV1<Result> | ProtocolErrorV1> {
        signal.throwIfAborted();
        let parsed: Parsed;
        try {
            parsed = validateInput(input, expected, inputSchema);
        } catch (cause) {
            throw invalidRequest(cause);
        }
        signal.throwIfAborted();
        let value: unknown;
        try {
            value = await invoke(parsed);
        } catch (cause) {
            throw mapFailure(signal, cause);
        }
        try {
            return validateResult(resultSchema, value);
        } catch (cause) {
            if (isProtocolError(value)) return validateProtocolError(value);
            throw internalFailure(cause);
        }
    }
}

function isProtocolError(value: unknown): value is ProtocolErrorV1 {
    return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;
}

function mapFailure(signal: AbortSignal, cause: unknown): RemoteError | never {
    if (signal.aborted) throw signal.reason;
    if (cause instanceof LocalMeetingRecoveryUnavailableError) throw recoveryUnavailable(cause);
    throw internalFailure(cause);
}
