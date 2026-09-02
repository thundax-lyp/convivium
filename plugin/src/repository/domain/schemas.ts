import { z } from "zod";
import { DomainEventTypes } from "../../domain/model.js";
import type {
    CommandAuthorization,
    CreateMeetingResult,
    JsonObject,
    MeetingBootstrap,
    MeetingSnapshot,
    OutboxKind,
    PrivateMeetingMail,
    SessionOwnership
} from "../types.js";
import type { JsonValue } from "./canonical-json.js";

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(JsonValueSchema),
        JsonObjectSchema
    ])
);
const dangerousKeys = new Set(["__proto__", "prototype", "constructor"]);
function safeRecord<T>(valueSchema: z.ZodType<T>): z.ZodType<Record<string, T>> {
    return z.preprocess(
        (value) =>
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            Object.keys(value).some((key) => dangerousKeys.has(key))
                ? null
                : value,
        z.record(z.string(), valueSchema).transform((value) => {
            const output: Record<string, T> = Object.create(null);
            for (const [key, item] of Object.entries(value)) output[key] = item;
            return output;
        })
    );
}
export const JsonObjectSchema: z.ZodType<JsonObject> = safeRecord(JsonValueSchema);

const authorization = z
    .object({
        callerBinding: z.string(),
        capabilityId: z.string(),
        attemptId: z.string().optional()
    })
    .strict() satisfies z.ZodType<CommandAuthorization>;
const sessionOwnership = z
    .object({
        sessionId: z.string(),
        parentSessionId: z.string(),
        sessionLabel: z.string(),
        provider: z.string(),
        initialMessageId: z.string().optional(),
        role: z.enum(["manager", "participant"]),
        participantId: z.string().optional(),
        lifecycleStatus: z.enum(["provisioning", "active", "closed"]),
        capabilityStatus: z.enum(["active", "revoked"]),
        createdAt: z.number().int(),
        updatedAt: z.number().int()
    })
    .strict() satisfies z.ZodType<SessionOwnership>;
const createResult = z
    .object({
        meetingId: z.string(),
        meetingVersion: z.number().int(),
        status: z.enum(["created", "running"]).optional(),
        participants: z
            .array(z.object({ participantKey: z.string(), participantId: z.string() }).strict())
            .readonly()
            .optional()
    })
    .strict() satisfies z.ZodType<CreateMeetingResult>;
const outboxKind = z.enum(["dispatch"] satisfies [OutboxKind, ...OutboxKind[]]);
const outboxSeed = z
    .object({
        formatVersion: z.literal(1),
        id: z.string(),
        deliveryId: z.string(),
        kind: outboxKind,
        priority: z.number().int(),
        payload: JsonObjectSchema,
        availableAt: z.number().int(),
        createdAt: z.number().int()
    })
    .strict();
const meetingSnapshot = z
    .object({
        teamId: z.string(),
        meetingId: z.string(),
        version: z.number().int(),
        state: JsonObjectSchema,
        createdAt: z.number().int(),
        updatedAt: z.number().int()
    })
    .strict() satisfies z.ZodType<MeetingSnapshot>;
const meetingBootstrap = z
    .object({
        status: z.enum(["creating", "ready", "creation_failed"]),
        createRequestId: z.string(),
        requestHash: z.string(),
        createResult: createResult.optional(),
        createdAt: z.number().int(),
        updatedAt: z.number().int(),
        failureCode: z.string().optional()
    })
    .strict() satisfies z.ZodType<MeetingBootstrap>;
const privateMail = z
    .object({
        mailId: z.string(),
        meetingId: z.string(),
        senderParticipantId: z.string(),
        recipientParticipantId: z.string(),
        content: z.string(),
        meetingContext: JsonObjectSchema,
        replyToMailId: z.string().optional(),
        handlingAttemptId: z.string(),
        status: z.enum([
            "pending",
            "processing",
            "processed",
            "obsolete",
            "failed",
            "timed_out",
            "cancelled"
        ]),
        snapshotThroughSeq: z.number().int(),
        processingThroughSeq: z.number().int().optional(),
        deliveryId: z.string().optional(),
        deadlineAt: z.number().int().optional(),
        createdAt: z.number().int(),
        updatedAt: z.number().int()
    })
    .strict() satisfies z.ZodType<PrivateMeetingMail>;

export const CatalogMeetingRecordV1Schema = z
    .object({
        formatVersion: z.literal(1),
        teamId: z.string(),
        meetingId: z.string(),
        domainName: z.string(),
        status: z.enum(["creating", "ready", "creation_failed"]),
        createRequestId: z.string(),
        requestHash: z.string(),
        createdAt: z.number().int(),
        updatedAt: z.number().int(),
        failureCode: z.string().nullable()
    })
    .strict();
export const CreationRecordV1Schema = z
    .object({
        formatVersion: z.literal(1),
        teamId: z.string(),
        meetingId: z.string(),
        status: z.enum(["creating", "ready", "creation_failed"]),
        requestId: z.string(),
        requestHash: z.string(),
        authorization,
        initialState: JsonObjectSchema,
        createResult: createResult.nullable(),
        initialOutbox: z.array(outboxSeed),
        sessionOwnership: safeRecord(sessionOwnership),
        createdAt: z.number().int(),
        updatedAt: z.number().int(),
        failureCode: z.string().nullable()
    })
    .strict();
export const PersistedReceiptV1Schema = z
    .object({
        formatVersion: z.literal(1),
        requestId: z.string(),
        commandKind: z.string(),
        callerBinding: z.string(),
        requestHash: z.string(),
        meetingVersion: z.number().int(),
        result: JsonValueSchema,
        eventSeqs: z.array(z.number().int()),
        createdAt: z.number().int()
    })
    .strict();
export const PersistedEventV1Schema = z
    .object({
        formatVersion: z.literal(1),
        eventSeq: z.number().int(),
        meetingVersion: z.number().int(),
        type: z.enum(DomainEventTypes),
        payload: JsonObjectSchema,
        turnId: z.string().nullable(),
        attemptId: z.string().nullable(),
        createdAt: z.number().int()
    })
    .strict();
export const PersistedOutboxV1Schema = z
    .object({
        formatVersion: z.literal(1),
        id: z.string(),
        deliveryId: z.string(),
        kind: outboxKind,
        priority: z.number().int(),
        payload: JsonObjectSchema,
        status: z.enum(["pending", "leased", "delivered", "failed"]),
        attempts: z.number().int(),
        availableAt: z.number().int(),
        leaseOwner: z.string().nullable(),
        leaseToken: z.string().nullable(),
        leaseDeadline: z.number().int().nullable(),
        deliveredAt: z.number().int().nullable(),
        failedAt: z.number().int().nullable(),
        lastError: z.string().nullable(),
        createdAt: z.number().int()
    })
    .strict();
export const PersistenceProjectionV1Schema = z
    .object({
        formatVersion: z.literal(1),
        snapshot: meetingSnapshot.nullable(),
        bootstrap: meetingBootstrap,
        receipts: safeRecord(PersistedReceiptV1Schema),
        events: safeRecord(PersistedEventV1Schema),
        outbox: safeRecord(PersistedOutboxV1Schema),
        sessionOwnership: safeRecord(sessionOwnership),
        privateMail: safeRecord(privateMail),
        nextEventSeq: z.number().int()
    })
    .strict();

export const JsonPatchOperationV1Schema = z.discriminatedUnion("op", [
    z
        .object({ op: z.literal("remove"), path: z.array(z.union([z.string(), z.number().int()])) })
        .strict(),
    z
        .object({
            op: z.literal("set"),
            path: z.array(z.union([z.string(), z.number().int()])),
            value: JsonValueSchema
        })
        .strict(),
    z
        .object({
            op: z.literal("splice"),
            path: z.array(z.union([z.string(), z.number().int()])),
            start: z.number().int(),
            deleteCount: z.number().int(),
            items: z.array(JsonValueSchema)
        })
        .strict()
]);
export const CommitRecordV1Schema = z
    .object({
        formatVersion: z.literal(1),
        seq: z.number().int(),
        previousSeq: z.number().int(),
        previousDigest: z.string().nullable(),
        operation: z.string(),
        patch: z.array(JsonPatchOperationV1Schema),
        committedAt: z.number().int(),
        digest: z.string()
    })
    .strict();
export const CheckpointPageV1Schema = z
    .object({
        formatVersion: z.literal(1),
        generation: z.string(),
        baseSeq: z.number().int(),
        pageIndex: z.number().int(),
        pageCount: z.number().int(),
        payloadBase64: z.string(),
        payloadDigest: z.string()
    })
    .strict();
export const CheckpointRootV1Schema = z
    .object({
        formatVersion: z.literal(1),
        generation: z.string(),
        baseSeq: z.number().int(),
        pageCount: z.number().int(),
        totalBytes: z.number().int(),
        projectionDigest: z.string(),
        createdAt: z.number().int()
    })
    .strict();
export const CheckpointPointerV1Schema = z
    .object({
        formatVersion: z.literal(1),
        generation: z.string(),
        baseSeq: z.number().int(),
        rootDigest: z.string(),
        publishedAt: z.number().int()
    })
    .strict();
export type CatalogMeetingRecordV1 = z.infer<typeof CatalogMeetingRecordV1Schema>;
export type CreationRecordV1 = z.infer<typeof CreationRecordV1Schema>;
export type PersistenceProjectionV1 = z.infer<typeof PersistenceProjectionV1Schema>;
export type CommitRecordV1 = z.infer<typeof CommitRecordV1Schema>;
export type CheckpointPageV1 = z.infer<typeof CheckpointPageV1Schema>;
export type CheckpointRootV1 = z.infer<typeof CheckpointRootV1Schema>;
export type CheckpointPointerV1 = z.infer<typeof CheckpointPointerV1Schema>;
