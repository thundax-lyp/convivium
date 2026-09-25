import { z } from "zod";
import { abilityNames } from "@/role-composition/model.js";
import type {
    CommandAuthorization,
    CreateMeetingResult,
    JsonObject,
    MeetingBootstrap,
    MeetingSnapshot,
    OutboxKind,
    PrivateMeetingMail,
    SessionOwnership
} from "@/repository/types.js";
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

const meetingStateTransport: z.ZodType<JsonObject> = JsonObjectSchema;

const authorization = z
    .object({
        callerBinding: z.string(),
        capabilityId: z.string(),
        attemptId: z.string().optional()
    })
    .strict() satisfies z.ZodType<CommandAuthorization>;
export const AgentDefinitionBindingSchema = z.strictObject({
    agentDefinitionId: z.string().refine((value) => value.trim().length > 0),
    definitionVersion: z.string().refine((value) => value.trim().length > 0),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/)
});

const nonempty = z.string().trim().min(1);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const epoch = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const EffectiveAgentOptionsSchema = z.strictObject({
    provider: nonempty,
    model: nonempty,
    reasoningEffort: nonempty.optional()
});
export const ResourceBindingSchema = z.strictObject({
    instructions: z.strictObject({
        roleDefinitionId: z.enum([
            "meeting_manager",
            "domain_architect",
            "runtime_engineer",
            "protocol_ui_engineer",
            "verification_reviewer",
            "github_research_analyst",
            "arxiv_research_analyst"
        ]),
        version: nonempty,
        sha256: sha
    }),
    presetId: nonempty,
    presetSha256: sha,
    skills: z
        .array(z.strictObject({ name: z.enum(abilityNames), sha256: sha }))
        .refine((values) => new Set(values.map((v) => v.name)).size === values.length),
    compositionHash: sha
});
export const PreparedDescriptorSchema = z.strictObject({
    descriptorId: nonempty,
    meetingId: nonempty,
    identityId: nonempty,
    sessionId: nonempty,
    definition: AgentDefinitionBindingSchema,
    resources: ResourceBindingSchema,
    agentOptions: EffectiveAgentOptionsSchema,
    descriptorHash: sha,
    expiresAt: epoch
});
export const SessionOwnershipSchema = z.strictObject({
    id: nonempty,
    meetingId: nonempty,
    identityId: nonempty,
    sessionId: nonempty,
    admissionId: nonempty.optional(),
    definition: AgentDefinitionBindingSchema,
    resources: ResourceBindingSchema,
    agentOptions: EffectiveAgentOptionsSchema,
    descriptorId: nonempty,
    descriptorHash: sha,
    sessionLabel: nonempty,
    role: z.enum(["manager", "evidence_reviewer", "participant"]),
    lifecycleStatus: z.enum(["provisioning", "active", "closed"]),
    capabilityStatus: z.enum(["active", "revoked"]),
    createdAt: epoch,
    updatedAt: epoch
}) satisfies z.ZodType<SessionOwnership>;
const sessionOwnershipMap = safeRecord(SessionOwnershipSchema).refine((values) =>
    Object.entries(values).every(([key, value]) => key === value.sessionId)
);
const creator = z.strictObject({
    kind: z.literal("local_user"),
    principalId: z.literal("local-controller"),
    sourceSessionId: nonempty.optional()
});
const createResult = z
    .object({
        meetingId: z.string(),
        meetingVersion: z.number().int(),
        status: z.enum(["created", "running", "waiting"]).optional(),
        participants: z
            .array(z.object({ participantKey: z.string(), participantId: z.string() }).strict())
            .readonly()
            .optional(),
        kind: z.literal("accepted").optional(),
        committedVersion: z.number().int().nonnegative().optional(),
        receiptId: z.string().optional(),
        factIds: z.array(z.string()).readonly().optional(),
        effects: z
            .array(
                z
                    .object({
                        id: z.string(),
                        kind: z.enum([
                            "refresh",
                            "session_mail",
                            "agent_notice",
                            "review_delivery",
                            "markdown_projection",
                            "archive",
                            "identity_provision"
                        ]),
                        status: z.literal("queued")
                    })
                    .strict()
            )
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
        meetingId: z.string(),
        version: z.number().int(),
        state: meetingStateTransport,
        createdAt: z.number().int(),
        updatedAt: z.number().int()
    })
    .strict() satisfies z.ZodType<MeetingSnapshot>;
const meetingBootstrap = z
    .object({
        creator,
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

export const CommittedFactRecordSchema = z
    .object({
        factId: z.string().min(1),
        kind: z.string().min(1),
        actorId: z.string().min(1),
        occurredAt: z.number().int(),
        meetingVersion: z.number().int().positive(),
        relatedIds: z.array(z.string().min(1)).readonly(),
        payload: JsonObjectSchema,
        resultingState: JsonObjectSchema
    })
    .strict();

export const CatalogMeetingRecordSchema = z
    .object({
        formatVersion: z.literal(1),
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
export const CreationRecordSchema = z
    .object({
        formatVersion: z.literal(2),
        meetingId: z.string(),
        status: z.enum(["creating", "ready", "creation_failed"]),
        requestId: z.string(),
        requestHash: z.string(),
        authorization,
        creator,
        preparedDescriptors: z.array(PreparedDescriptorSchema),
        initialState: JsonObjectSchema,
        createResult: createResult.nullable(),
        initialOutbox: z.array(outboxSeed),
        sessionOwnership: sessionOwnershipMap,
        createdAt: z.number().int(),
        updatedAt: z.number().int(),
        failureCode: z.string().nullable()
    })
    .strict();
export const PersistedReceiptSchema = z
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
export const PersistedEventSchema = z
    .object({
        formatVersion: z.literal(1),
        eventSeq: z.number().int(),
        meetingVersion: z.number().int(),
        type: z.string(),
        payload: JsonObjectSchema,
        turnId: z.string().nullable(),
        attemptId: z.string().nullable(),
        createdAt: z.number().int()
    })
    .strict();
export const PersistedOutboxSchema = z
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
export const PersistenceProjectionSchema = z
    .object({
        formatVersion: z.literal(2),
        snapshot: meetingSnapshot.nullable(),
        bootstrap: meetingBootstrap,
        preparedDescriptors: z.array(PreparedDescriptorSchema),
        receipts: safeRecord(PersistedReceiptSchema),
        facts: safeRecord(CommittedFactRecordSchema),
        events: safeRecord(PersistedEventSchema),
        outbox: safeRecord(PersistedOutboxSchema),
        sessionOwnership: sessionOwnershipMap,
        privateMail: safeRecord(privateMail),
        nextEventSeq: z.number().int()
    })
    .strict();

export const JsonPatchOperationSchema = z.discriminatedUnion("op", [
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
export const CommitRecordSchema = z
    .object({
        formatVersion: z.literal(1),
        seq: z.number().int(),
        previousSeq: z.number().int(),
        previousDigest: z.string().nullable(),
        operation: z.string(),
        patch: z.array(JsonPatchOperationSchema),
        committedAt: z.number().int(),
        digest: z.string()
    })
    .strict();
export const CheckpointPageSchema = z
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
export const CheckpointRootSchema = z
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
export const CheckpointPointerSchema = z
    .object({
        formatVersion: z.literal(1),
        generation: z.string(),
        baseSeq: z.number().int(),
        rootDigest: z.string(),
        publishedAt: z.number().int()
    })
    .strict();
export type CatalogMeetingRecord = z.infer<typeof CatalogMeetingRecordSchema>;
export type CreationRecord = z.infer<typeof CreationRecordSchema>;
export type PersistenceProjection = z.infer<typeof PersistenceProjectionSchema>;
export type CommitRecord = z.infer<typeof CommitRecordSchema>;
export type CheckpointPage = z.infer<typeof CheckpointPageSchema>;
export type CheckpointRoot = z.infer<typeof CheckpointRootSchema>;
export type CheckpointPointer = z.infer<typeof CheckpointPointerSchema>;
