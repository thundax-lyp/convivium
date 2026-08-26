import z from "@deepseek-ai/schemastery";

const requiredString = () => z.string().required();
const requiredNumber = () => z.number().required();

export const ProtocolVersionSchema = z.const(1).required();

export const ProtocolMetaSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: requiredString(),
    meetingVersion: requiredNumber()
});

export const ProtocolErrorSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    ok: z.const(false).required(),
    code: z.string().required(),
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
