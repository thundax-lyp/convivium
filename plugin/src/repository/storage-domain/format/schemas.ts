import { z } from "zod";
import { abilityNames } from "@/role-skills/index.ts";
import type {
    CommandAuthorization,
    CreateMeetingResult,
    JsonObject,
    MeetingBootstrap,
    MeetingSnapshot,
    OutboxKind,
    SessionOwnership
} from "@/repository/index.ts";
import type { JsonValue } from "@/utils/index.ts";

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
const safeRecord = <T>(valueSchema: z.ZodType<T>): z.ZodType<Record<string, T>> => {
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
            for (const [key, item] of Object.entries(value)) {
                output[key] = item;
            }
            return output;
        })
    );
};
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
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/)
});

const nonempty = z.string().trim().min(1);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const epoch = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const eventLifecycle = z.enum([
    "preparing",
    "running",
    "paused",
    "converging",
    "ending",
    "terminal",
    "archiving",
    "archived"
]);
const MeetingEventObjectRefSchema = z.strictObject({
    kind: z.enum([
        "meeting",
        "agenda",
        "agenda_candidate",
        "manager_plan",
        "round",
        "contribution",
        "evidence_version",
        "evidence_review",
        "review_delivery",
        "publication",
        "formal_message",
        "identity_recommendation",
        "identity",
        "question",
        "issue",
        "completion_fact",
        "risk_disposition",
        "termination",
        "archive"
    ]),
    id: nonempty
});
const MeetingEventActorSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("captain"), actorId: nonempty }),
    z.strictObject({ kind: z.literal("identity"), actorId: nonempty }),
    z.strictObject({ kind: z.literal("system") })
]);
const eventEpoch = z.number().int().nonnegative().safe();
const MeetingEventDataSchemaByKind = {
    "meeting.created": z.strictObject({}),
    "meeting.lifecycle_changed": z
        .strictObject({ from: eventLifecycle, to: eventLifecycle, reason: nonempty.optional() })
        .refine((value) => value.from !== value.to, {
            path: ["to"],
            message: "Lifecycle must change"
        }),
    "agenda.activated": z.strictObject({
        previousDisposition: z.enum(["completed", "deferred", "closed"]),
        reason: nonempty
    }),
    "agenda_candidate.disposed": z.strictObject({
        disposition: z.enum(["promoted", "parked", "rejected"]),
        reason: nonempty
    }),
    "manager_plan.recorded": z.strictObject({
        planKind: z.enum([
            "open_round",
            "continue_agenda",
            "stop_agenda",
            "raise_agenda_candidate",
            "wait_for_required_identity"
        ]),
        rationale: nonempty,
        blockingReason: nonempty.optional()
    }),
    "round.opened": z.strictObject({ deadlineAt: eventEpoch.optional() }),
    "round.participation_recorded": z.discriminatedUnion("status", [
        z.strictObject({
            contributorId: nonempty,
            status: z.literal("declined"),
            reason: nonempty
        }),
        z.strictObject({ contributorId: nonempty, status: z.literal("no_response") })
    ]),
    "hand_raise.recorded": z.strictObject({ contributorId: nonempty, purpose: nonempty }),
    "hand_raise.disposed": z.discriminatedUnion("disposition", [
        z.strictObject({
            contributorId: nonempty,
            disposition: z.literal("accepted"),
            reason: nonempty,
            contributionId: nonempty
        }),
        z.strictObject({
            contributorId: nonempty,
            disposition: z.enum(["rejected", "deferred"]),
            reason: nonempty
        })
    ]),
    "evidence.submitted": z.strictObject({ summary: nonempty }),
    "contribution.closed": z.strictObject({
        exit: z.enum(["withdrawn", "submission_missing"]),
        reason: nonempty
    }),
    "contribution.failed": z.strictObject({
        sourceEffectId: nonempty,
        stage: nonempty,
        failureCode: nonempty,
        failureSummary: nonempty,
        attemptCount: z.number().int().positive().safe(),
        retryable: z.boolean()
    }),
    "evidence_review.claimed": z.strictObject({ claimId: nonempty, sourceEffectId: nonempty }),
    "evidence_validation.failed": z.strictObject({
        claimId: nonempty,
        reason: z.enum(["review_timeout", "review_interrupted", "dispatch_failed"])
    }),
    "evidence_review.submitted": z.strictObject({ claimId: nonempty, scope: nonempty }),
    "review_delivery.recorded": z.discriminatedUnion("status", [
        z.strictObject({ status: z.literal("sent") }),
        z.strictObject({ status: z.literal("failed"), failureReason: nonempty })
    ]),
    "round.published": z.strictObject({}),
    "formal_message.published": z.strictObject({ messageKind: nonempty }),
    "round.aborted": z.strictObject({ reason: nonempty }),
    "identity.recommended": z.discriminatedUnion("decision", [
        z.strictObject({
            decision: z.literal("reject"),
            status: z.literal("rejected"),
            rationale: nonempty
        }),
        z.strictObject({
            decision: z.literal("admit"),
            status: z.enum(["provisioning", "active"]),
            rationale: nonempty
        })
    ]),
    "identity.admission_recorded": z.discriminatedUnion("status", [
        z.strictObject({ status: z.literal("active") }),
        z.strictObject({ status: z.literal("failed"), failureCode: nonempty })
    ]),
    "question.disposed": z.strictObject({
        status: z.enum(["answered", "withdrawn", "deferred"]),
        rationale: nonempty
    }),
    "issue.disposed": z.strictObject({
        status: z.enum(["resolved", "deferred", "out_of_scope"]),
        rationale: nonempty
    }),
    "risk.disposed": z.strictObject({
        action: z.enum(["accept", "reject"]),
        scope: nonempty,
        rationale: nonempty
    }),
    "completion_fact.recorded": z.strictObject({
        outputId: nonempty,
        statement: nonempty,
        rationale: nonempty
    }),
    "completion_fact.changed": z.discriminatedUnion("status", [
        z.strictObject({
            status: z.literal("superseded"),
            rationale: nonempty,
            replacementFactId: nonempty
        }),
        z.strictObject({ status: z.literal("revoked"), rationale: nonempty })
    ]),
    "meeting.ended": z.strictObject({
        outcome: z.enum(["completed", "partial", "no_consensus", "cancelled", "failed"]),
        reason: nonempty
    }),
    "archive.started": z.strictObject({ status: z.literal("complete") }),
    "archive.completed": z.strictObject({ status: z.literal("complete") })
};
const meetingEvent = <
    K extends keyof typeof MeetingEventDataSchemaByKind,
    S extends z.infer<typeof MeetingEventObjectRefSchema>["kind"]
>(
    kind: K,
    subjectKind: S
) =>
    z.strictObject({
        eventSeq: z.number().int().positive().safe(),
        meetingVersion: z.number().int().nonnegative().safe(),
        formatVersion: z.literal(1),
        type: z.literal(kind),
        createdAt: eventEpoch,
        turnId: z.string().nullable(),
        attemptId: z.string().nullable(),
        payload: z.strictObject({
            logVersion: z.literal(1),
            actor: MeetingEventActorSchema,
            subject: z.strictObject({ kind: z.literal(subjectKind), id: nonempty }),
            relatedObjects: z.array(MeetingEventObjectRefSchema),
            data: MeetingEventDataSchemaByKind[kind]
        })
    });
export const CommittedMeetingEventSchema = z.discriminatedUnion("type", [
    meetingEvent("meeting.created", "meeting"),
    meetingEvent("meeting.lifecycle_changed", "meeting"),
    meetingEvent("agenda.activated", "agenda"),
    meetingEvent("agenda_candidate.disposed", "agenda_candidate"),
    meetingEvent("manager_plan.recorded", "manager_plan"),
    meetingEvent("round.opened", "round"),
    meetingEvent("round.participation_recorded", "round"),
    meetingEvent("hand_raise.recorded", "round"),
    meetingEvent("hand_raise.disposed", "round"),
    meetingEvent("evidence.submitted", "evidence_version"),
    meetingEvent("contribution.closed", "contribution"),
    meetingEvent("contribution.failed", "contribution"),
    meetingEvent("evidence_review.claimed", "evidence_version"),
    meetingEvent("evidence_validation.failed", "evidence_version"),
    meetingEvent("evidence_review.submitted", "evidence_review"),
    meetingEvent("review_delivery.recorded", "review_delivery"),
    meetingEvent("round.published", "publication"),
    meetingEvent("formal_message.published", "formal_message"),
    meetingEvent("round.aborted", "round"),
    meetingEvent("identity.recommended", "identity_recommendation"),
    meetingEvent("identity.admission_recorded", "identity_recommendation"),
    meetingEvent("question.disposed", "question"),
    meetingEvent("issue.disposed", "issue"),
    meetingEvent("risk.disposed", "risk_disposition"),
    meetingEvent("completion_fact.recorded", "completion_fact"),
    meetingEvent("completion_fact.changed", "completion_fact"),
    meetingEvent("meeting.ended", "termination"),
    meetingEvent("archive.started", "archive"),
    meetingEvent("archive.completed", "archive")
]);
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
            "arxiv_research_analyst",
            "web_research_analyst"
        ]),
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
        status: z.enum(["creating", "ready", "creation_failed", "deleting"]),
        deletionSummary: z
            .object({
                objective: z.string(),
                version: z.number().int().nonnegative(),
                lifecycle: z.enum([
                    "preparing",
                    "running",
                    "paused",
                    "converging",
                    "ending",
                    "terminal",
                    "archiving",
                    "archived"
                ])
            })
            .optional(),
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
