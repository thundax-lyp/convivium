import Schema from "@deepseek-ai/schemastery";
import type { KnownMeetingProtocolErrorCodeV1 } from "./types.js";

const requiredString = () => Schema.string().required();
const requiredNumber = () => Schema.number().required();

export const ProtocolVersionSchema = Schema.const(1).required();

const knownErrorCodes = [
    "INVALID_ARGUMENT",
    "MEETING_NOT_FOUND",
    "UNAUTHORIZED_CALLER",
    "INVALID_STATE_TRANSITION",
    "STALE_ATTEMPT",
    "STALE_MANAGER_ATTEMPT",
    "VERSION_CONFLICT",
    "IDEMPOTENCY_CONFLICT",
    "IMMUTABLE_MEETING",
    "ARCHIVED_MEETING",
    "SOURCE_MEETING_NOT_ARCHIVED",
    "ARCHIVE_MATERIAL_NOT_FOUND",
    "PARTICIPANT_NOT_DISPATCHABLE",
    "REQUIRED_SPEAKER_UNAVAILABLE",
    "MANAGER_PLAN_INVALID",
    "DELIVERY_RETRY_EXHAUSTED",
    "UNSUPPORTED_CAPABILITY",
    "INTERNAL_ERROR"
] as const;

export const KnownMeetingProtocolErrorCodeSchema = Schema.union(knownErrorCodes).required();
export const MeetingProtocolErrorCodeSchema = Schema.string().required();

export function isKnownMeetingProtocolErrorCode(
    value: string
): value is KnownMeetingProtocolErrorCodeV1 {
    return (knownErrorCodes as readonly string[]).includes(value);
}

export const ProtocolMetaSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: requiredString(),
    meetingVersion: requiredNumber()
});

export const ProtocolErrorSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    ok: Schema.const(false).required(),
    code: MeetingProtocolErrorCodeSchema,
    message: requiredString(),
    meetingId: Schema.string(),
    meetingVersion: Schema.number(),
    turnId: Schema.string(),
    stepId: Schema.string(),
    attemptId: Schema.string(),
    deliveryId: Schema.string(),
    participantId: Schema.string(),
    retryable: Schema.boolean().required()
});

export function createProtocolSuccessEnvelopeSchema<T>(resultSchema: Schema<T>) {
    return Schema.object({
        protocolVersion: ProtocolVersionSchema,
        ok: Schema.const(true).required(),
        meetingId: requiredString(),
        meetingVersion: requiredNumber(),
        result: resultSchema.required()
    });
}

export function validateProtocolError(value: unknown) {
    return ProtocolErrorSchema(value as Record<string, unknown>);
}

export function validateProtocolSuccessEnvelope<T>(resultSchema: Schema<T>, value: unknown) {
    const envelope = createProtocolSuccessEnvelopeSchema(resultSchema)(
        value as Record<string, unknown>
    );
    const result = envelope.result as Record<string, unknown>;
    for (const key of ["meetingId", "meetingVersion"] as const) {
        if (Object.prototype.hasOwnProperty.call(result, key) && result[key] !== envelope[key]) {
            throw new TypeError(`success envelope ${key} does not match result metadata`);
        }
    }
    return envelope;
}
