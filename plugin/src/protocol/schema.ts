import z from "@deepseek-ai/schemastery";

const requiredString = () => z.string().required();
const requiredNumber = () => z.number().required();

export const ProtocolVersionSchema = z.const(1).required();

export const MeetingProtocolErrorCodeSchema = z
    .union([
        "INVALID_ARGUMENT",
        "MEETING_NOT_FOUND",
        "UNAUTHORIZED_CALLER",
        "INVALID_STATE_TRANSITION",
        "STALE_ATTEMPT",
        "STALE_MANAGER_ATTEMPT",
        "IDEMPOTENCY_CONFLICT",
        "IMMUTABLE_MEETING",
        "ARCHIVED_MEETING",
        "SOURCE_MEETING_NOT_ARCHIVED",
        "ARCHIVE_MATERIAL_NOT_FOUND",
        "PARTICIPANT_NOT_DISPATCHABLE",
        "REQUIRED_SPEAKER_UNAVAILABLE",
        "MANAGER_PLAN_INVALID",
        "DELIVERY_RETRY_EXHAUSTED",
        "INTERNAL_ERROR"
    ])
    .required();

export const ProtocolMetaSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: requiredString(),
    meetingVersion: requiredNumber()
});

export const ProtocolErrorSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    ok: z.const(false).required(),
    code: MeetingProtocolErrorCodeSchema,
    message: requiredString(),
    meetingId: z.string(),
    meetingVersion: z.number(),
    turnId: z.string(),
    stepId: z.string(),
    attemptId: z.string(),
    deliveryId: z.string(),
    participantId: z.string(),
    retryable: z.boolean().required()
});

export const ProtocolSuccessEnvelopeSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    ok: z.const(true).required(),
    meetingId: requiredString(),
    meetingVersion: requiredNumber(),
    result: z.any().required()
});

export function validateProtocolError(value: unknown) {
    return ProtocolErrorSchema(value as Record<string, unknown>);
}

export function validateProtocolSuccessEnvelope(value: unknown) {
    return ProtocolSuccessEnvelopeSchema(value as Record<string, unknown>);
}
