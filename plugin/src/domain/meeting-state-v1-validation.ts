import type { MeetingState } from "./meeting-state-v1.js";
import { z } from "zod";

export type MeetingStateValidationResultV1 =
    | { kind: "valid"; state: MeetingState }
    | { kind: "invalid"; code: "INVALID_ARGUMENT"; path: string };

type RecordValue = Record<string, unknown>;

const opaqueIdSchema = z.string().refine((value) => value.trim().length > 0);
const textSchema = z.string().refine((value) => value.trim().length > 0);
const uniqueIdArraySchema = z.array(opaqueIdSchema).superRefine((values, ctx) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
        if (seen.has(value))
            ctx.addIssue({ code: "custom", path: [index], message: "duplicate id" });
        seen.add(value);
    });
});
function uniqueEntityArray<T extends z.ZodType<{ id: string }>>(schema: T) {
    return z.array(schema).superRefine((values, ctx) => {
        const seen = new Set<string>();
        values.forEach((value, index) => {
            if (seen.has(value.id))
                ctx.addIssue({ code: "custom", path: [index, "id"], message: "duplicate id" });
            seen.add(value.id);
        });
    });
}
const epochSchema = z.number().int().safe().nonnegative();
const positiveIntegerSchema = z.number().int().safe().min(1);
const integerSchema = z.number().int().safe().nonnegative();
const roleSchema = z.enum(["captain", "manager", "contributor", "evidence_reviewer"]);
const uniqueRoleArraySchema = z.array(roleSchema).superRefine((values, ctx) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
        if (seen.has(value))
            ctx.addIssue({ code: "custom", path: [index], message: "duplicate role" });
        seen.add(value);
    });
});
const isAbsentOrDefined = (value: Record<string, unknown>, key: string) =>
    !own(value, key) || value[key] !== undefined;
function withDefinedOptionals<T extends z.ZodTypeAny>(schema: T, keys: readonly string[]) {
    return schema.superRefine((value, ctx) => {
        for (const key of keys)
            if (!isAbsentOrDefined(value as Record<string, unknown>, key))
                ctx.addIssue({ code: "custom", path: [key], message: "undefined" });
    });
}
const targetStatusSchema = z.enum(["pending", "satisfied", "unsatisfied", "violated"]);
const agendaStatusSchema = z.enum([
    "pending",
    "active",
    "blocked",
    "completed",
    "deferred",
    "closed"
]);
const riskLevelSchema = z.enum(["low", "medium", "high"]);
const issueClassificationSchema = z.enum([
    "blocking",
    "follow_up",
    "pending_discussion",
    "accepted_risk",
    "out_of_scope"
]);
const issueStatusSchema = z.enum(["open", "resolved", "deferred", "out_of_scope"]);
const objectiveTargetSchema = z.object({
    id: opaqueIdSchema,
    text: textSchema,
    status: targetStatusSchema
});
const objectiveSchema = z.object({
    statement: textSchema,
    requiredOutputs: uniqueEntityArray(objectiveTargetSchema),
    acceptanceCriteria: uniqueEntityArray(objectiveTargetSchema),
    hardConstraints: uniqueEntityArray(objectiveTargetSchema),
    acceptableRiskLevel: riskLevelSchema
});
const lifecycleSchema = z.object({
    status: z.enum([
        "preparing",
        "running",
        "paused",
        "converging",
        "ending",
        "terminal",
        "archiving",
        "archived"
    ]),
    changedAt: epochSchema,
    changedBy: opaqueIdSchema,
    reason: textSchema.optional()
});
const identitySchema = z
    .object({
        id: opaqueIdSchema,
        displayName: textSchema,
        roles: uniqueRoleArraySchema,
        agendaResponsibilityIds: uniqueIdArraySchema,
        reviewResponsibilityIds: uniqueIdArraySchema,
        riskAuthority: z.boolean(),
        required: z.boolean(),
        definitionId: opaqueIdSchema.optional(),
        definitionVersion: textSchema.optional(),
        definitionHash: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        sessionOwnershipId: opaqueIdSchema.optional()
    })
    .refine((value) => own(value, "definitionId") === own(value, "definitionVersion"), {
        path: ["definitionVersion"]
    })
    .refine((value) => isAbsentOrDefined(value, "definitionId"), { path: ["definitionId"] })
    .refine((value) => isAbsentOrDefined(value, "definitionVersion"), {
        path: ["definitionVersion"]
    });
const identityRecommendationSchema = withDefinedOptionals(
    z.object({
        id: opaqueIdSchema,
        candidateId: opaqueIdSchema,
        definitionId: opaqueIdSchema,
        definitionVersion: textSchema,
        catalogId: opaqueIdSchema,
        catalogVersion: textSchema,
        agendaId: opaqueIdSchema,
        managerId: opaqueIdSchema,
        decision: z.enum(["admit", "reject"]),
        status: z.enum(["provisioning", "rejected", "active", "failed"]),
        rationale: textSchema,
        expectedContribution: textSchema,
        evidenceGap: textSchema,
        createdAt: epochSchema,
        identityId: opaqueIdSchema.optional(),
        childSessionId: opaqueIdSchema.optional(),
        definitionHash: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        resolvedAt: epochSchema.optional(),
        failureCode: textSchema.optional()
    }),
    ["identityId", "childSessionId", "definitionHash", "resolvedAt", "failureCode"]
).superRefine((value, ctx) => {
    if (value.decision === "reject") {
        if (
            value.status !== "rejected" ||
            value.identityId !== undefined ||
            value.childSessionId !== undefined ||
            value.definitionHash !== undefined ||
            value.failureCode !== undefined ||
            value.resolvedAt === undefined
        )
            ctx.addIssue({ code: "custom", path: ["status"] });
    } else if (
        value.identityId === undefined ||
        value.childSessionId === undefined ||
        value.definitionHash === undefined ||
        value.status === "rejected"
    ) {
        ctx.addIssue({ code: "custom", path: ["status"] });
    }
});
const agendaSchema = z.object({
    id: opaqueIdSchema,
    title: textSchema,
    question: textSchema,
    status: agendaStatusSchema,
    requiredOutputIds: uniqueIdArraySchema,
    requiredReviewerIds: uniqueIdArraySchema,
    ownerId: opaqueIdSchema.optional()
});
const candidateSchema = z.object({
    id: opaqueIdSchema,
    title: textSchema,
    reason: textSchema,
    sourceMessageId: opaqueIdSchema.optional(),
    status: z.enum(["pending", "promoted", "parked", "rejected"])
});
const questionSchema = z.object({
    id: opaqueIdSchema,
    actorId: opaqueIdSchema,
    agendaId: opaqueIdSchema,
    text: textSchema,
    affectedOutputIds: uniqueIdArraySchema,
    affectedCriterionIds: uniqueIdArraySchema,
    affectedConstraintIds: uniqueIdArraySchema,
    blocking: z.boolean(),
    status: z.enum(["open", "answered", "withdrawn", "deferred"])
});
const issueSchema = z.object({
    id: opaqueIdSchema,
    agendaId: opaqueIdSchema,
    description: textSchema,
    riskLevel: riskLevelSchema,
    classification: issueClassificationSchema,
    affectedOutputIds: uniqueIdArraySchema,
    affectedCriterionIds: uniqueIdArraySchema,
    affectedConstraintIds: uniqueIdArraySchema,
    requiredReviewerIds: uniqueIdArraySchema,
    blocking: z.boolean(),
    status: issueStatusSchema,
    rationale: textSchema
});
const managerPlanSchema = z.object({
    id: opaqueIdSchema,
    agendaId: opaqueIdSchema,
    managerId: opaqueIdSchema,
    basedOnPublicationId: opaqueIdSchema.optional(),
    kind: z.enum([
        "open_round",
        "continue_agenda",
        "stop_agenda",
        "raise_agenda_candidate",
        "wait_for_required_identity"
    ]),
    rationale: textSchema,
    blockingReason: textSchema.optional(),
    createdAt: epochSchema,
    status: z.enum(["active", "superseded", "completed"])
});
const handRaiseSchema = z.object({ raisedAt: epochSchema, purpose: textSchema });
const textWithReasonSchema = z.object({ value: textSchema, reason: textSchema.optional() });
const supplementHandSchema = z
    .object({
        raisedAt: epochSchema,
        purpose: textSchema,
        status: z.enum(["pending", "accepted"]),
        acceptedAt: epochSchema.optional()
    })
    .refine((value) => isAbsentOrDefined(value, "acceptedAt"), { path: ["acceptedAt"] })
    .refine((value) => (value.status === "accepted") === own(value, "acceptedAt"), {
        path: ["acceptedAt"]
    });
const opportunityRequestSchema = z.object({
    id: opaqueIdSchema,
    agendaId: opaqueIdSchema,
    contributorId: opaqueIdSchema,
    purpose: textSchema,
    requestedAt: epochSchema
});
const pendingHandRaiseSchema = z.object({
    roundId: opaqueIdSchema,
    contributorId: opaqueIdSchema,
    purpose: textSchema,
    raisedAt: epochSchema
});
const formatApprovalSchema = z.object({
    id: opaqueIdSchema,
    contributionId: opaqueIdSchema,
    managerId: opaqueIdSchema,
    evidenceHash: z.string().regex(/^[0-9a-f]{64}$/),
    approvedAt: epochSchema
});
const roundSchema = z
    .object({
        id: opaqueIdSchema,
        agendaId: opaqueIdSchema,
        publicBaselinePublicationIds: uniqueIdArraySchema,
        openedAt: epochSchema,
        status: z.enum(["open", "published", "aborted"]),
        contributionIds: uniqueIdArraySchema,
        deadlineAt: epochSchema.optional(),
        publicationId: opaqueIdSchema.optional()
    })
    .refine((value) => isAbsentOrDefined(value, "publicationId"), { path: ["publicationId"] })
    .refine((value) => (value.status === "published") === own(value, "publicationId"), {
        path: ["publicationId"]
    });
const contributionSchema = z
    .object({
        id: opaqueIdSchema,
        roundId: opaqueIdSchema,
        contributorId: opaqueIdSchema,
        handRaise: handRaiseSchema,
        acceptedAt: epochSchema,
        status: z.enum([
            "preparing",
            "format_correction",
            "registered",
            "under_review",
            "awaiting_response",
            "withdrawn",
            "submission_missing",
            "timed_out",
            "supplement_rejected",
            "closed"
        ]),
        packageId: opaqueIdSchema.optional(),
        substantiveSupplementCount: integerSchema.max(2),
        supplementHand: supplementHandSchema.optional(),
        exitReason: textSchema.optional(),
        response: textSchema.optional()
    })
    .refine((value) => isAbsentOrDefined(value, "supplementHand"), {
        path: ["supplementHand"]
    })
    .refine(
        (value) =>
            value.supplementHand === undefined ||
            value.status === "awaiting_response" ||
            value.supplementHand.status === "accepted",
        { path: ["supplementHand"] }
    );
const claimSchema = z.object({
    id: opaqueIdSchema,
    statement: textSchema,
    materialIds: uniqueIdArraySchema,
    qualification: textSchema
});
const materialSchema = z
    .object({
        id: opaqueIdSchema,
        kind: z.enum([
            "document",
            "dataset",
            "experiment",
            "observation",
            "tool_output",
            "unknown",
            "not_applicable"
        ]),
        originator: textSchema,
        originalSource: textSchema,
        sourcePublishedAt: textSchema,
        acquiredAt: textSchema,
        version: textSchema,
        locator: textSchema,
        location: textSchema,
        verificationConditions: textSchema,
        limitations: textSchema,
        sharedDependencies: z.array(textSchema),
        reason: textSchema.optional()
    })
    .refine((value) => isAbsentOrDefined(value, "reason"), { path: ["reason"] })
    .refine(
        (value) => !["unknown", "not_applicable"].includes(value.kind) || own(value, "reason"),
        {
            path: ["reason"]
        }
    );
const evidenceVersionSchema = z.object({
    id: opaqueIdSchema,
    ordinal: positiveIntegerSchema,
    observation: textSchema,
    interpretation: textSchema,
    method: textSchema,
    falsifiers: z.array(textWithReasonSchema),
    uncertainties: z.array(textWithReasonSchema),
    limitations: z.array(textWithReasonSchema),
    claims: uniqueEntityArray(claimSchema),
    materials: uniqueEntityArray(materialSchema),
    submittedAt: epochSchema
});
const evidencePackageSchema = z.object({
    id: opaqueIdSchema,
    roundId: opaqueIdSchema,
    contributionId: opaqueIdSchema,
    authorId: opaqueIdSchema,
    agendaId: opaqueIdSchema,
    currentVersionId: opaqueIdSchema,
    versions: z.array(evidenceVersionSchema)
});
const registrationSchema = z
    .object({
        id: opaqueIdSchema,
        versionId: opaqueIdSchema,
        managerId: opaqueIdSchema,
        status: z.literal("complete"),
        missingFields: z.array(textSchema),
        createdAt: epochSchema
    })
    .refine((value) => value.status !== "complete" || value.missingFields.length === 0, {
        path: ["missingFields"]
    });
const reviewDimensionSchema = z.object({
    score: z.union([
        z.literal(0),
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal("unable_to_assess")
    ]),
    reason: textSchema,
    scope: textSchema,
    baselineEvidenceIds: uniqueIdArraySchema
});
const evidenceReviewSchema = z.object({
    id: opaqueIdSchema,
    versionId: opaqueIdSchema,
    reviewerId: opaqueIdSchema,
    baselinePublicationIds: uniqueIdArraySchema,
    scope: textSchema,
    dimensions: z.object({
        source: reviewDimensionSchema,
        credibility: reviewDimensionSchema,
        completeness: reviewDimensionSchema,
        support: reviewDimensionSchema
    }),
    createdAt: epochSchema
});
const reviewDeliverySchema = z
    .object({
        id: opaqueIdSchema,
        reviewId: opaqueIdSchema,
        authorId: opaqueIdSchema,
        status: z.enum(["sent", "failed"]),
        sentAt: epochSchema.optional(),
        failedAt: epochSchema.optional(),
        failureReason: textSchema.optional()
    })
    .refine((value) => value.status !== "sent" || own(value, "sentAt"), { path: ["sentAt"] })
    .refine((value) => value.status !== "failed" || own(value, "failedAt"), {
        path: ["failedAt"]
    })
    .refine((value) => value.status !== "failed" || own(value, "failureReason"), {
        path: ["failureReason"]
    })
    .refine(
        (value) =>
            !(value.status === "sent"
                ? own(value, "failedAt") || own(value, "failureReason")
                : own(value, "sentAt")),
        {
            path: ["sentAt"]
        }
    );
const publicationSchema = z.object({
    id: opaqueIdSchema,
    roundId: opaqueIdSchema,
    seq: positiveIntegerSchema,
    finalVersionIds: uniqueIdArraySchema,
    finalReviewIds: uniqueIdArraySchema,
    publishedAt: epochSchema,
    exitReasons: z.array(textSchema)
});
const formalMessageSchema = z.object({
    id: opaqueIdSchema,
    seq: positiveIntegerSchema,
    actorId: opaqueIdSchema,
    agendaId: opaqueIdSchema,
    kind: textSchema,
    body: textSchema,
    publicationId: opaqueIdSchema,
    relatedIds: uniqueIdArraySchema,
    createdAt: epochSchema
});
const proposalRevisionSchema = z
    .object({
        id: opaqueIdSchema,
        proposalId: opaqueIdSchema,
        ordinal: positiveIntegerSchema,
        actorId: opaqueIdSchema,
        agendaId: opaqueIdSchema,
        summary: textSchema,
        body: textSchema,
        evidenceIds: uniqueIdArraySchema,
        supersedesRevisionId: opaqueIdSchema.optional(),
        createdAt: epochSchema
    })
    .refine((value) => isAbsentOrDefined(value, "supersedesRevisionId"), {
        path: ["supersedesRevisionId"]
    })
    .refine((value) => value.ordinal !== 1 || !own(value, "supersedesRevisionId"), {
        path: ["supersedesRevisionId"]
    })
    .refine((value) => value.ordinal === 1 || own(value, "supersedesRevisionId"), {
        path: ["supersedesRevisionId"]
    });
const riskDispositionSchema = z.object({
    id: opaqueIdSchema,
    issueId: opaqueIdSchema,
    actorId: opaqueIdSchema,
    action: z.enum(["accept", "reject"]),
    scope: textSchema,
    rationale: textSchema,
    evidenceIds: uniqueIdArraySchema,
    createdAt: epochSchema
});
const completionDeclarationSchema = withDefinedOptionals(
    z.object({
        id: opaqueIdSchema,
        actorId: opaqueIdSchema,
        outputId: opaqueIdSchema,
        criterionId: opaqueIdSchema.optional(),
        statement: textSchema,
        evidenceIds: uniqueIdArraySchema,
        taskId: opaqueIdSchema.optional(),
        createdAt: epochSchema
    }),
    ["criterionId", "taskId"]
);
const completionFactSchema = withDefinedOptionals(
    z.object({
        id: opaqueIdSchema,
        outputId: opaqueIdSchema,
        criterionId: opaqueIdSchema.optional(),
        actorId: opaqueIdSchema,
        status: z.enum(["active", "superseded", "revoked"]),
        statement: textSchema,
        rationale: textSchema,
        evidenceIds: uniqueIdArraySchema,
        decisionIds: uniqueIdArraySchema,
        supersedesFactId: opaqueIdSchema.optional(),
        createdAt: epochSchema
    }),
    ["criterionId", "supersedesFactId"]
);
const taskSchema = withDefinedOptionals(
    z.object({
        id: opaqueIdSchema,
        createdBy: opaqueIdSchema,
        assigneeId: opaqueIdSchema,
        agendaId: opaqueIdSchema.optional(),
        title: textSchema,
        instructions: textSchema,
        contextPublicationUpperBound: uniqueIdArraySchema,
        status: z.enum(["open", "claimed", "completed", "cancelled", "expired"]),
        deadlineAt: epochSchema.optional(),
        result: textSchema.optional(),
        exitReason: textSchema.optional(),
        createdAt: epochSchema,
        updatedAt: epochSchema,
        authorizationId: opaqueIdSchema,
        authorizationStatus: z.enum(["active", "revoked", "expired"]),
        attempt: integerSchema,
        reassignedFromTaskId: opaqueIdSchema.optional(),
        startedAt: epochSchema.optional(),
        completedAt: epochSchema.optional()
    }),
    [
        "agendaId",
        "deadlineAt",
        "result",
        "exitReason",
        "reassignedFromTaskId",
        "startedAt",
        "completedAt"
    ]
);
const privateMailSchema = withDefinedOptionals(
    z.object({
        id: opaqueIdSchema,
        senderId: opaqueIdSchema,
        recipientId: opaqueIdSchema,
        agendaId: opaqueIdSchema.optional(),
        body: textSchema,
        relatedIds: uniqueIdArraySchema.min(1),
        sendContextPublicationUpperBound: uniqueIdArraySchema,
        processingContextPublicationUpperBound: uniqueIdArraySchema.optional(),
        status: z.enum(["queued", "processing", "completed", "timed_out", "cancelled"]),
        deadlineAt: epochSchema,
        createdAt: epochSchema,
        processingStartedAt: epochSchema.optional(),
        completedAt: epochSchema.optional(),
        failureReason: textSchema.optional()
    }),
    [
        "agendaId",
        "processingContextPublicationUpperBound",
        "processingStartedAt",
        "completedAt",
        "failureReason"
    ]
);
const terminationSchema = z.object({
    id: opaqueIdSchema,
    outcome: z.enum(["completed", "partial", "no_consensus", "cancelled", "failed"]),
    reason: textSchema,
    endedAt: epochSchema,
    decisionIds: uniqueIdArraySchema,
    completionFactIds: uniqueIdArraySchema,
    unresolvedQuestionIds: uniqueIdArraySchema,
    unresolvedIssueIds: uniqueIdArraySchema,
    unclosedContributionIds: uniqueIdArraySchema
});
const archiveSchema = z.object({
    id: opaqueIdSchema,
    createdAt: epochSchema,
    createdBy: opaqueIdSchema,
    terminationId: opaqueIdSchema,
    publicSnapshotVersion: positiveIntegerSchema,
    includedPublicationIds: uniqueIdArraySchema,
    includedDecisionIds: uniqueIdArraySchema,
    includedCompletionFactIds: uniqueIdArraySchema,
    status: z.enum(["pending", "complete", "failed"]),
    identityProvenance: z.array(
        z.object({
            id: opaqueIdSchema.optional(),
            identityId: opaqueIdSchema,
            displayName: textSchema,
            roles: uniqueRoleArraySchema,
            definitionId: opaqueIdSchema,
            definitionVersion: textSchema,
            definitionHash: z.string().regex(/^[a-f0-9]{64}$/)
        })
    )
});
const continuationSchema = z.object({
    sourceArchiveId: opaqueIdSchema,
    selectedMaterialIds: uniqueIdArraySchema,
    importedAt: epochSchema,
    importedBy: opaqueIdSchema
});
const positionSchema = z.object({
    id: opaqueIdSchema,
    proposalRevisionId: opaqueIdSchema,
    actorId: opaqueIdSchema,
    stance: z.enum(["support", "oppose", "abstain", "conditional"]),
    rationale: textSchema,
    evidenceIds: uniqueIdArraySchema,
    createdAt: epochSchema
});
const decisionCandidateSchema = z.object({
    id: opaqueIdSchema,
    proposalRevisionId: opaqueIdSchema,
    actorId: opaqueIdSchema,
    outcome: z.enum(["adopt", "reject", "defer"]),
    rationale: textSchema,
    evidenceIds: uniqueIdArraySchema,
    positionIds: uniqueIdArraySchema,
    createdAt: epochSchema
});
const decisionSchema = decisionCandidateSchema.extend({
    candidateId: opaqueIdSchema,
    status: z.enum(["accepted", "superseded", "revoked"]),
    replacesDecisionId: opaqueIdSchema.optional()
});
const limitsSchema = z.object({
    maxFormalMessages: integerSchema,
    maxDurationMs: integerSchema,
    taskDeadlineMs: integerSchema,
    reviewDeadlineMs: integerSchema,
    responseDeadlineMs: z.literal(60000)
});
const meetingStateSchema = withDefinedOptionals(
    z.object({
        id: opaqueIdSchema,
        version: positiveIntegerSchema,
        createdAt: epochSchema,
        updatedAt: epochSchema,
        objective: objectiveSchema,
        lifecycle: lifecycleSchema,
        identities: uniqueEntityArray(identitySchema),
        identityRecommendations: uniqueEntityArray(identityRecommendationSchema),
        agenda: uniqueEntityArray(agendaSchema),
        agendaCandidates: uniqueEntityArray(candidateSchema),
        rounds: uniqueEntityArray(roundSchema),
        opportunityRequests: uniqueEntityArray(opportunityRequestSchema),
        pendingHandRaises: z.array(pendingHandRaiseSchema),
        contributions: uniqueEntityArray(contributionSchema),
        formatApprovals: uniqueEntityArray(formatApprovalSchema),
        evidencePackages: uniqueEntityArray(evidencePackageSchema),
        registrations: uniqueEntityArray(registrationSchema),
        reviews: uniqueEntityArray(evidenceReviewSchema),
        reviewDeliveries: uniqueEntityArray(reviewDeliverySchema),
        publications: uniqueEntityArray(publicationSchema),
        messages: uniqueEntityArray(formalMessageSchema),
        proposals: uniqueEntityArray(proposalRevisionSchema),
        positions: uniqueEntityArray(positionSchema),
        decisionCandidates: uniqueEntityArray(decisionCandidateSchema),
        decisions: uniqueEntityArray(decisionSchema),
        questions: uniqueEntityArray(questionSchema),
        issues: uniqueEntityArray(issueSchema),
        riskDispositions: uniqueEntityArray(riskDispositionSchema),
        tasks: uniqueEntityArray(taskSchema),
        completionDeclarations: uniqueEntityArray(completionDeclarationSchema),
        completionFacts: uniqueEntityArray(completionFactSchema),
        privateMails: uniqueEntityArray(privateMailSchema),
        managerPlans: uniqueEntityArray(managerPlanSchema),
        limits: limitsSchema,
        termination: terminationSchema.optional(),
        archive: archiveSchema.optional(),
        continuation: continuationSchema.optional()
    }),
    ["termination", "archive", "continuation"]
);
function record(value: unknown): value is RecordValue {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function own(value: RecordValue, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function fail(path: string): MeetingStateValidationResultV1 {
    return { kind: "invalid", code: "INVALID_ARGUMENT", path };
}
function ref(value: unknown, values: ReadonlySet<string>): boolean {
    return typeof value === "string" && value.trim().length > 0 && values.has(value);
}
function checkRefs(values: readonly string[], ids: ReadonlySet<string>, path: string) {
    for (let i = 0; i < values.length; i++) if (!ids.has(values[i])) return `${path}[${i}]`;
    return undefined;
}
function indexById<T extends { id: string }>(items: readonly T[]) {
    return new Map(items.map((item) => [item.id, item] as const));
}
function ownUndefined(value: RecordValue, key: string, path: string): string | undefined {
    return own(value, key) && value[key] === undefined ? path : undefined;
}
export function validateMeetingStateV1(value: unknown): MeetingStateValidationResultV1 {
    if (!record(value)) return fail("$");
    const parsed = meetingStateSchema.safeParse(value);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const suffix = issue.path.reduce<string>(
            (text, segment) =>
                typeof segment === "number"
                    ? `${text}[${String(segment)}]`
                    : `${text}.${String(segment)}`,
            ""
        );
        return fail(`$${suffix}`);
    }
    const parsedState = parsed.data;
    if (
        own(value, "continuation") &&
        (value.continuation === undefined || !record(value.continuation))
    )
        return fail("$.continuation");
    const { objective, lifecycle } = parsedState;
    if (ownUndefined(lifecycle, "reason", "$.lifecycle.reason")) return fail("$.lifecycle.reason");
    const identityById = indexById(parsedState.identities);
    const identityIds = new Set(identityById.keys());
    const agendaById = indexById(parsedState.agenda);
    const agendaIds = new Set(agendaById.keys());
    const ids = (targets: readonly { id: string }[]) => new Set(targets.map(({ id }) => id));
    const outputIds = ids(objective.requiredOutputs);
    const criterionIds = ids(objective.acceptanceCriteria);
    const constraintIds = ids(objective.hardConstraints);
    const unsatisfied = (targets: readonly { id: string; status: string }[]) =>
        new Set(targets.filter(({ status }) => status !== "satisfied").map(({ id }) => id));
    const unsatisfiedOutputIds = unsatisfied(objective.requiredOutputs);
    const unsatisfiedCriterionIds = unsatisfied(objective.acceptanceCriteria);
    const unsatisfiedConstraintIds = unsatisfied(objective.hardConstraints);
    for (let i = 0; i < parsedState.agenda.length; i++) {
        const item = parsedState.agenda[i];
        const path = `$.agenda[${i}]`;
        for (const [key, ids] of [
            ["requiredOutputIds", outputIds],
            ["requiredReviewerIds", identityIds]
        ] as const) {
            const p = checkRefs(item[key], ids, `${path}.${key}`);
            if (p) return fail(p);
        }
        if (ownUndefined(item, "ownerId", `${path}.ownerId`)) return fail(`${path}.ownerId`);
    }
    const activeAgendaIndexes = parsedState.agenda.flatMap((item, index) =>
        item.status === "active" ? [index] : []
    );
    if (activeAgendaIndexes.length > 1) return fail(`$.agenda[${activeAgendaIndexes[1]}].status`);
    if (
        !(["terminal", "archiving", "archived"] as readonly string[]).includes(
            lifecycle.status as string
        ) &&
        activeAgendaIndexes.length !== 1
    )
        return fail("$.agenda");
    for (let i = 0; i < parsedState.identities.length; i++) {
        const item = parsedState.identities[i];
        for (const key of ["agendaResponsibilityIds", "reviewResponsibilityIds"] as const) {
            const p = checkRefs(item[key], agendaIds, `$.identities[${i}].${key}`);
            if (p) return fail(p);
        }
        if (item.reviewResponsibilityIds.length > 0 && !item.roles.includes("evidence_reviewer"))
            return fail(`$.identities[${i}].reviewResponsibilityIds[0]`);
    }
    for (let i = 0; i < parsedState.agenda.length; i++) {
        const item = parsedState.agenda[i];
        const reviewers = item.requiredReviewerIds;
        for (let j = 0; j < reviewers.length; j++) {
            const identity = identityById.get(reviewers[j]);
            if (
                !identity ||
                !identity.roles.includes("evidence_reviewer") ||
                !identity.reviewResponsibilityIds.includes(item.id)
            )
                return fail(`$.agenda[${i}].requiredReviewerIds[${j}]`);
        }
    }
    const rounds = parsedState.rounds;
    const roundById = indexById(rounds);
    const roundIds = new Set<string>();
    for (let i = 0; i < rounds.length; i++) {
        const item = rounds[i];
        const path = `$.rounds[${i}]`;
        const r = item;
        roundIds.add(r.id);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        if (r.status === "open") {
            const agenda = agendaById.get(r.agendaId as string);
            if (!agenda || agenda.status !== "active") return fail(`${path}.agendaId`);
        }
    }
    const opportunityRequestIds = new Set<string>();
    for (let i = 0; i < parsedState.opportunityRequests.length; i++) {
        const request = parsedState.opportunityRequests[i];
        const path = `$.opportunityRequests[${i}]`;
        opportunityRequestIds.add(request.id);
        if (!ref(request.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        if (!ref(request.contributorId, identityIds)) return fail(`${path}.contributorId`);
    }
    const pendingHandKeys = new Set<string>();
    for (let i = 0; i < parsedState.pendingHandRaises.length; i++) {
        const hand = parsedState.pendingHandRaises[i];
        const path = `$.pendingHandRaises[${i}]`;
        const key = `${hand.roundId}\0${hand.contributorId}`;
        if (pendingHandKeys.has(key)) return fail(`${path}.contributorId`);
        pendingHandKeys.add(key);
        if (!ref(hand.roundId, roundIds)) return fail(`${path}.roundId`);
        if (!ref(hand.contributorId, identityIds)) return fail(`${path}.contributorId`);
    }
    const contributions = parsedState.contributions;
    const contributionById = indexById(contributions);
    const contributionIds = new Set<string>();
    const contributorRounds = new Set<string>();
    for (let i = 0; i < contributions.length; i++) {
        const item = contributions[i];
        const path = `$.contributions[${i}]`;
        const r = item;
        contributionIds.add(r.id);
        const contributorRound = `${r.contributorId}\0${r.roundId}`;
        if (contributorRounds.has(contributorRound)) return fail(`${path}.roundId`);
        contributorRounds.add(contributorRound);
        if (!ref(r.roundId, roundIds)) return fail(`${path}.roundId`);
        if (!ref(r.contributorId, identityIds)) return fail(`${path}.contributorId`);
        if (ownUndefined(r, "packageId", `${path}.packageId`)) return fail(`${path}.packageId`);
    }
    for (let i = 0; i < parsedState.formatApprovals.length; i++) {
        const approval = parsedState.formatApprovals[i];
        const path = `$.formatApprovals[${i}]`;
        if (!ref(approval.contributionId, contributionIds)) return fail(`${path}.contributionId`);
        if (!ref(approval.managerId, identityIds)) return fail(`${path}.managerId`);
        const manager = identityById.get(approval.managerId);
        if (!manager || !manager.roles.includes("manager")) return fail(`${path}.managerId`);
    }
    const packages = parsedState.evidencePackages;
    const versionOwnerById = new Map<string, (typeof packages)[number]>();
    const packageIds = new Set<string>();
    const versionIds = new Set<string>();
    for (let i = 0; i < packages.length; i++) {
        const item = packages[i];
        const path = `$.evidencePackages[${i}]`;
        const r = item;
        if (!ref(r.roundId, roundIds)) return fail(`${path}.roundId`);
        if (!ref(r.contributionId, contributionIds)) return fail(`${path}.contributionId`);
        if (!ref(r.authorId, identityIds)) return fail(`${path}.authorId`);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        const contribution = contributionById.get(r.contributionId as string);
        const round = roundById.get(r.roundId as string);
        if (!contribution || contribution.roundId !== r.roundId) return fail(`${path}.roundId`);
        if (!round || round.agendaId !== r.agendaId) return fail(`${path}.agendaId`);
        if (!contribution || contribution.contributorId !== r.authorId)
            return fail(`${path}.authorId`);
        packageIds.add(r.id as string);
        const packageVersionIds = new Set<string>();
        for (let j = 0; j < r.versions.length; j++) {
            const v = r.versions[j];
            const vp = `${path}.versions[${j}]`;
            const vr = v;
            const materialIds = new Set<string>();
            for (const material of vr.materials) {
                materialIds.add(material.id);
            }
            for (let k = 0; k < vr.claims.length; k++) {
                const claim = vr.claims[k];
                for (let m = 0; m < claim.materialIds.length; m++)
                    if (!materialIds.has(claim.materialIds[m]))
                        return fail(`${vp}.claims[${k}].materialIds[${m}]`);
            }
            if (versionIds.has(vr.id)) return fail(`${vp}.id`);
            versionIds.add(vr.id);
            packageVersionIds.add(vr.id);
            versionOwnerById.set(vr.id, item);
        }
        if (!packageVersionIds.has(r.currentVersionId as string))
            return fail(`${path}.currentVersionId`);
    }
    for (let i = 0; i < packages.length; i++) {
        const packageValue = packages[i] as RecordValue;
        if (!ref(packageValue.currentVersionId, versionIds))
            return fail(`$.evidencePackages[${i}].currentVersionId`);
        const contribution = contributionById.get(packageValue.contributionId as string);
        if (!contribution || contribution.packageId !== packageValue.id)
            return fail(`$.evidencePackages[${i}].contributionId`);
    }
    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i] as RecordValue;
        for (let j = 0; j < (round.contributionIds as readonly unknown[]).length; j++) {
            const contributionId = (round.contributionIds as readonly unknown[])[j];
            const contribution = contributionById.get(contributionId as string);
            if (!contribution || contribution.roundId !== round.id)
                return fail(`$.rounds[${i}].contributionIds[${j}]`);
        }
    }
    for (let i = 0; i < contributions.length; i++) {
        const contribution = contributions[i] as RecordValue;
        const round = roundById.get(contribution.roundId as string);
        if (!round || !(round.contributionIds as readonly unknown[]).includes(contribution.id))
            return fail(`$.contributions[${i}].roundId`);
    }
    const registrations = parsedState.registrations;
    for (let i = 0; i < registrations.length; i++) {
        const r = registrations[i];
        const path = `$.registrations[${i}]`;
        if (!ref(r.versionId, versionIds)) return fail(`${path}.versionId`);
        if (!ref(r.managerId, identityIds)) return fail(`${path}.managerId`);
        const manager = identityById.get(r.managerId as string);
        if (!manager || !manager.roles.includes("manager")) return fail(`${path}.managerId`);
    }
    const reviews = parsedState.reviews;
    const reviewById = indexById(reviews);
    const reviewIds = new Set<string>();
    for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i];
        const path = `$.reviews[${i}]`;
        reviewIds.add(r.id as string);
        if (!ref(r.versionId, versionIds)) return fail(`${path}.versionId`);
        if (!ref(r.reviewerId, identityIds)) return fail(`${path}.reviewerId`);
        const reviewer = identityById.get(r.reviewerId as string);
        if (!reviewer || !reviewer.roles.includes("evidence_reviewer"))
            return fail(`${path}.reviewerId`);
    }
    for (let i = 0; i < contributions.length; i++) {
        const hand = (contributions[i] as RecordValue).supplementHand as RecordValue | undefined;
        if (hand && hand.status !== "pending" && hand.status !== "accepted")
            return fail(`$.contributions[${i}].supplementHand.status`);
    }
    const deliveries = parsedState.reviewDeliveries;
    for (let i = 0; i < deliveries.length; i++) {
        const r = deliveries[i];
        const path = `$.reviewDeliveries[${i}]`;
        if (!ref(r.reviewId, reviewIds)) return fail(`${path}.reviewId`);
        if (!ref(r.authorId, identityIds)) return fail(`${path}.authorId`);
        const review = reviewById.get(r.reviewId);
        const ownerPackage = review && versionOwnerById.get(review.versionId);
        if (ownerPackage && ownerPackage.authorId !== r.authorId) return fail(`${path}.authorId`);
    }
    const publications = parsedState.publications;
    const publicationById = indexById(publications);
    const publicationIds = new Set<string>();
    for (let i = 0; i < publications.length; i++) {
        const r = publications[i];
        const path = `$.publications[${i}]`;
        publicationIds.add(r.id as string);
        if (!ref(r.roundId, roundIds)) return fail(`${path}.roundId`);
        for (const [key, ids] of [
            ["finalVersionIds", versionIds],
            ["finalReviewIds", reviewIds]
        ] as const) {
            const p = checkRefs(r[key], ids, `${path}.${key}`);
            if (p) return fail(p);
        }
    }
    for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i] as RecordValue;
        if (r.status === "published") {
            const publication = publicationById.get(r.publicationId as string);
            if (!publication || publication.roundId !== r.id)
                return fail(`$.rounds[${i}].publicationId`);
        }
    }
    const publishedVersionIds = new Set<string>();
    for (let i = 0; i < publications.length; i++) {
        const publication = publications[i] as RecordValue;
        const round = roundById.get(publication.roundId as string);
        for (let j = 0; j < (publication.finalVersionIds as readonly unknown[]).length; j++) {
            const versionId = (publication.finalVersionIds as readonly unknown[])[j];
            const owner = versionOwnerById.get(versionId as string);
            if (!owner || owner.roundId !== publication.roundId || round === undefined)
                return fail(`$.publications[${i}].finalVersionIds[${j}]`);
            publishedVersionIds.add(versionId as string);
        }
        for (let j = 0; j < (publication.finalReviewIds as readonly unknown[]).length; j++) {
            const reviewId = (publication.finalReviewIds as readonly unknown[])[j];
            const review = reviewById.get(reviewId as string);
            const owner = review && versionOwnerById.get(review.versionId);
            if (!review || !owner || owner.roundId !== publication.roundId)
                return fail(`$.publications[${i}].finalReviewIds[${j}]`);
        }
    }
    const messages = parsedState.messages;
    const messageIds = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
        const r = messages[i];
        const path = `$.messages[${i}]`;
        messageIds.add(r.id as string);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        if (!ref(r.publicationId, publicationIds)) return fail(`${path}.publicationId`);
    }
    const proposals = parsedState.proposals;
    const proposalIds = new Set<string>();
    for (let i = 0; i < proposals.length; i++) {
        const r = proposals[i];
        const path = `$.proposals[${i}]`;
        proposalIds.add(r.id as string);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        const evidencePath = checkRefs(r.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (evidencePath) return fail(evidencePath);
    }
    const positions = parsedState.positions;
    const positionById = indexById(positions);
    const positionIds = new Set<string>();
    for (let i = 0; i < positions.length; i++) {
        const r = positions[i];
        const path = `$.positions[${i}]`;
        positionIds.add(r.id as string);
        if (!ref(r.proposalRevisionId, proposalIds)) return fail(`${path}.proposalRevisionId`);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        const evidencePath = checkRefs(r.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (evidencePath) return fail(evidencePath);
    }
    const decisionCandidates = parsedState.decisionCandidates;
    const decisionCandidateIds = new Set<string>();
    for (let i = 0; i < decisionCandidates.length; i++) {
        const r = decisionCandidates[i];
        const path = `$.decisionCandidates[${i}]`;
        decisionCandidateIds.add(r.id as string);
        if (!ref(r.proposalRevisionId, proposalIds)) return fail(`${path}.proposalRevisionId`);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        const evidencePath = checkRefs(r.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (evidencePath) return fail(evidencePath);
        for (let j = 0; j < r.positionIds.length; j++) {
            const position = positionById.get(r.positionIds[j]);
            if (!position || position.proposalRevisionId !== r.proposalRevisionId)
                return fail(`${path}.positionIds[${j}]`);
        }
    }
    const decisions = parsedState.decisions;
    const decisionCandidateById = indexById(decisionCandidates);
    const decisionIds = new Set<string>();
    for (let i = 0; i < decisions.length; i++) {
        const r = decisions[i];
        const path = `$.decisions[${i}]`;
        decisionIds.add(r.id as string);
        if (!ref(r.candidateId, decisionCandidateIds)) return fail(`${path}.candidateId`);
        if (!ref(r.proposalRevisionId, proposalIds)) return fail(`${path}.proposalRevisionId`);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        const evidencePath = checkRefs(r.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (evidencePath) return fail(evidencePath);
        if (ownUndefined(r, "replacesDecisionId", `${path}.replacesDecisionId`))
            return fail(`${path}.replacesDecisionId`);
        if (r.replacesDecisionId !== undefined && !decisionIds.has(r.replacesDecisionId as string))
            return fail(`${path}.replacesDecisionId`);
        if (r.replacesDecisionId === r.id) return fail(`${path}.replacesDecisionId`);
    }
    for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i] as RecordValue;
        const path = `$.rounds[${i}]`;
        for (let j = 0; j < (r.contributionIds as readonly unknown[]).length; j++)
            if (!ref((r.contributionIds as readonly unknown[])[j], contributionIds))
                return fail(`${path}.contributionIds[${j}]`);
        for (let j = 0; j < (r.publicBaselinePublicationIds as readonly unknown[]).length; j++)
            if (!ref((r.publicBaselinePublicationIds as readonly unknown[])[j], publicationIds))
                return fail(`${path}.publicBaselinePublicationIds[${j}]`);
    }
    for (let i = 0; i < contributions.length; i++) {
        const r = contributions[i] as RecordValue;
        const path = `$.contributions[${i}]`;
        if (r.packageId !== undefined && !packageIds.has(r.packageId as string))
            return fail(`${path}.packageId`);
    }
    for (let i = 0; i < publications.length; i++) {
        const r = publications[i] as RecordValue;
        const path = `$.publications[${i}]`;
        if (i > 0 && ((publications[i - 1] as RecordValue).seq as number) >= (r.seq as number))
            return fail(`${path}.seq`);
    }
    for (let i = 0; i < messages.length; i++) {
        const r = messages[i] as RecordValue;
        const path = `$.messages[${i}]`;
        if (i > 0 && ((messages[i - 1] as RecordValue).seq as number) >= (r.seq as number))
            return fail(`${path}.seq`);
    }
    for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i] as RecordValue;
        const path = `$.reviews[${i}]`;
        const ownerPackage = versionOwnerById.get(r.versionId as string);
        const round = ownerPackage && roundById.get(ownerPackage.roundId);
        if (round) {
            const baseline = r.baselinePublicationIds as readonly unknown[];
            if (JSON.stringify(baseline) !== JSON.stringify(round.publicBaselinePublicationIds))
                return fail(`${path}.baselinePublicationIds`);
        }
    }
    const proposalGroups = new Map<string, { ordinal: number; id: string }>();
    for (let i = 0; i < proposals.length; i++) {
        const r = proposals[i] as RecordValue;
        const path = `$.proposals[${i}]`;
        const previous = proposalGroups.get(r.proposalId as string);
        if ((r.ordinal as number) !== (previous?.ordinal ?? 0) + 1) return fail(`${path}.ordinal`);
        proposalGroups.set(r.proposalId as string, {
            ordinal: r.ordinal as number,
            id: r.id as string
        });
        if ((r.ordinal as number) === 1 && r.supersedesRevisionId !== undefined)
            return fail(`${path}.supersedesRevisionId`);
        if ((r.ordinal as number) > 1 && r.supersedesRevisionId !== previous?.id)
            return fail(`${path}.supersedesRevisionId`);
    }
    for (let i = 0; i < decisions.length; i++) {
        const r = decisions[i];
        const candidate = decisionCandidateById.get(r.candidateId);
        if (candidate && r.proposalRevisionId !== candidate.proposalRevisionId)
            return fail(`$.decisions[${i}].proposalRevisionId`);
        if (candidate && r.actorId !== candidate.actorId) return fail(`$.decisions[${i}].actorId`);
        if (candidate && JSON.stringify(r.evidenceIds) !== JSON.stringify(candidate.evidenceIds))
            return fail(`$.decisions[${i}].evidenceIds`);
        if (candidate && JSON.stringify(r.positionIds) !== JSON.stringify(candidate.positionIds))
            return fail(`$.decisions[${i}].positionIds`);
    }
    const candidates = parsedState.agendaCandidates;
    for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i];
        const path = `$.agendaCandidates[${i}]`;
        if (ownUndefined(item, "sourceMessageId", `${path}.sourceMessageId`))
            return fail(`${path}.sourceMessageId`);
        if (item.sourceMessageId !== undefined && !ref(item.sourceMessageId, messageIds))
            return fail(`${path}.sourceMessageId`);
    }
    const questions = parsedState.questions;
    const questionIds = new Set<string>();
    for (let i = 0; i < questions.length; i++) {
        const item = questions[i];
        const path = `$.questions[${i}]`;
        questionIds.add(item.id);
        if (!ref(item.actorId, identityIds)) return fail(`${path}.actorId`);
        if (!ref(item.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        for (const [key, targets] of [
            ["affectedOutputIds", outputIds],
            ["affectedCriterionIds", criterionIds],
            ["affectedConstraintIds", constraintIds]
        ] as const) {
            const p = checkRefs(item[key], targets, `${path}.${key}`);
            if (p) return fail(p);
        }
        const blockingQualified =
            item.affectedOutputIds.some((targetId) => unsatisfiedOutputIds.has(targetId)) ||
            item.affectedCriterionIds.some((targetId) => unsatisfiedCriterionIds.has(targetId)) ||
            item.affectedConstraintIds.some((targetId) => unsatisfiedConstraintIds.has(targetId));
        if (item.blocking && !blockingQualified) return fail(`${path}.blocking`);
        if (["answered", "withdrawn"].includes(item.status as string) && item.blocking)
            return fail(`${path}.blocking`);
    }
    if (parsedState.limits.responseDeadlineMs !== 60000) return fail("$.limits.responseDeadlineMs");
    const riskDispositions = parsedState.riskDispositions;
    const issues = parsedState.issues;
    const issueIds = new Set<string>();
    for (let i = 0; i < issues.length; i++) {
        const item = issues[i];
        const path = `$.issues[${i}]`;
        issueIds.add(item.id);
        if (!agendaIds.has(item.agendaId as string)) return fail(`${path}.agendaId`);
        const agenda = agendaById.get(item.agendaId)!;
        for (const key of [
            "affectedOutputIds",
            "affectedCriterionIds",
            "affectedConstraintIds",
            "requiredReviewerIds"
        ] as const) {
            const targets =
                key === "affectedOutputIds"
                    ? outputIds
                    : key === "affectedCriterionIds"
                      ? criterionIds
                      : key === "affectedConstraintIds"
                        ? constraintIds
                        : new Set(agenda.requiredReviewerIds);
            const p = checkRefs(item[key], targets, `${path}.${key}`);
            if (p) return fail(p);
        }
        if (
            item.classification === "accepted_risk" &&
            !riskDispositions.some(
                (disposition) => disposition.issueId === item.id && disposition.action === "accept"
            )
        )
            return fail(`${path}.classification`);
        if (
            item.status === "open" &&
            (item.classification === "blocking" ? item.blocking !== true : item.blocking !== false)
        )
            return fail(`${path}.blocking`);
        if (
            item.riskLevel === "high" &&
            (item.status === "open" || item.status === "deferred") &&
            item.classification !== "accepted_risk" &&
            item.blocking !== true
        )
            return fail(`${path}.blocking`);
        if (["resolved", "out_of_scope"].includes(item.status as string) && item.blocking)
            return fail(`${path}.blocking`);
        if (item.blocking && item.riskLevel !== "high") {
            const reviewerQualified = item.requiredReviewerIds.some((id) =>
                agenda.requiredReviewerIds.includes(id)
            );
            const outputQualified = item.affectedOutputIds.some((id) =>
                unsatisfiedOutputIds.has(id)
            );
            const criterionQualified = item.affectedCriterionIds.some((id) =>
                unsatisfiedCriterionIds.has(id)
            );
            const constraintQualified = item.affectedConstraintIds.some((id) =>
                unsatisfiedConstraintIds.has(id)
            );
            if (
                !reviewerQualified &&
                !outputQualified &&
                !criterionQualified &&
                !constraintQualified
            )
                return fail(`${path}.blocking`);
        }
    }
    const plans = parsedState.managerPlans;
    const activePlanAgendas = new Set<string>();
    for (let i = 0; i < plans.length; i++) {
        const item = plans[i];
        const path = `$.managerPlans[${i}]`;
        if (!ref(item.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        if (!ref(item.managerId, identityIds)) return fail(`${path}.managerId`);
        const manager = identityById.get(item.managerId);
        if (!manager || !manager.roles.includes("manager")) return fail(`${path}.managerId`);
        if (item.status === "active") {
            if (activePlanAgendas.has(item.agendaId as string)) return fail(`${path}.agendaId`);
            activePlanAgendas.add(item.agendaId as string);
        }
        if (ownUndefined(item, "blockingReason", `${path}.blockingReason`))
            return fail(`${path}.blockingReason`);
        if (ownUndefined(item, "basedOnPublicationId", `${path}.basedOnPublicationId`))
            return fail(`${path}.basedOnPublicationId`);
        if (
            item.basedOnPublicationId !== undefined &&
            !ref(item.basedOnPublicationId, publicationIds)
        )
            return fail(`${path}.basedOnPublicationId`);
        if (item.basedOnPublicationId !== undefined) {
            const publication = publications.find(({ id }) => id === item.basedOnPublicationId);
            const round = publication && roundById.get(publication.roundId);
            if (!round || round.agendaId !== item.agendaId)
                return fail(`${path}.basedOnPublicationId`);
        }
    }
    const completionFactIds = ids(parsedState.completionFacts);
    const taskIds = ids(parsedState.tasks);
    const issueIdsForRefs = ids(parsedState.issues);
    for (let i = 0; i < riskDispositions.length; i++) {
        const item = riskDispositions[i];
        const path = `$.riskDispositions[${i}]`;
        if (!ref(item.issueId, issueIdsForRefs)) return fail(`${path}.issueId`);
        const p = checkRefs(item.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (p) return fail(p);
    }
    const declarations = parsedState.completionDeclarations;
    for (let i = 0; i < declarations.length; i++) {
        const item = declarations[i];
        const path = `$.completionDeclarations[${i}]`;
        if (!ref(item.actorId, identityIds)) return fail(`${path}.actorId`);
        if (!ref(item.outputId, outputIds)) return fail(`${path}.outputId`);
        if (item.criterionId !== undefined && !ref(item.criterionId, criterionIds))
            return fail(`${path}.criterionId`);
        const p = checkRefs(item.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (p) return fail(p);
        if (item.taskId !== undefined && !ref(item.taskId, taskIds)) return fail(`${path}.taskId`);
    }
    const facts = parsedState.completionFacts;
    for (let i = 0; i < facts.length; i++) {
        const item = facts[i];
        const path = `$.completionFacts[${i}]`;
        if (!ref(item.outputId, outputIds)) return fail(`${path}.outputId`);
        if (item.criterionId !== undefined && !ref(item.criterionId, criterionIds))
            return fail(`${path}.criterionId`);
        if (!ref(item.actorId, identityIds)) return fail(`${path}.actorId`);
        const actor = identityById.get(item.actorId);
        if (!actor || !actor.roles.includes("captain")) return fail(`${path}.actorId`);
        for (const [key, values] of [
            ["evidenceIds", publishedVersionIds],
            ["decisionIds", decisionIds]
        ] as const) {
            const p = checkRefs(item[key], values, `${path}.${key}`);
            if (p) return fail(p);
        }
        if (
            item.supersedesFactId !== undefined &&
            !completionFactIds.has(item.supersedesFactId as string)
        )
            return fail(`${path}.supersedesFactId`);
    }
    const tasks = parsedState.tasks;
    for (let i = 0; i < tasks.length; i++) {
        const item = tasks[i];
        const path = `$.tasks[${i}]`;
        for (const [key, values] of [
            ["createdBy", identityIds],
            ["assigneeId", identityIds]
        ] as const)
            if (!ref(item[key], values)) return fail(`${path}.${key}`);
        if (item.agendaId !== undefined && !ref(item.agendaId, agendaIds))
            return fail(`${path}.agendaId`);
        const p = checkRefs(
            item.contextPublicationUpperBound,
            publicationIds,
            `${path}.contextPublicationUpperBound`
        );
        if (p) return fail(p);
        if (
            item.reassignedFromTaskId !== undefined &&
            !taskIds.has(item.reassignedFromTaskId as string)
        )
            return fail(`${path}.reassignedFromTaskId`);
    }
    const mails = parsedState.privateMails;
    for (let i = 0; i < mails.length; i++) {
        const item = mails[i];
        const path = `$.privateMails[${i}]`;
        if (!ref(item.senderId, identityIds) || !ref(item.recipientId, identityIds))
            return fail(`${path}.${!ref(item.senderId, identityIds) ? "senderId" : "recipientId"}`);
        if (item.senderId === item.recipientId) return fail(`${path}.recipientId`);
        if (item.agendaId !== undefined && !ref(item.agendaId, agendaIds))
            return fail(`${path}.agendaId`);
        for (const key of [
            "sendContextPublicationUpperBound",
            "processingContextPublicationUpperBound"
        ] as const) {
            if (item[key] !== undefined) {
                const p = checkRefs(item[key], publicationIds, `${path}.${key}`);
                if (p) return fail(p);
            }
            const publicRefs = new Set([
                ...publications.map((p) => p.id),
                ...parsedState.messages.map((m) => m.id)
            ]);
            const related = checkRefs(item.relatedIds, publicRefs, `${path}.relatedIds`);
            if (related) return fail(related);
            const send = item.sendContextPublicationUpperBound;
            for (let j = 0; j < send.length; j++)
                if (send[j] !== publications[j]?.id)
                    return fail(`${path}.sendContextPublicationUpperBound[${j}]`);
            if (
                item.deadlineAt !== item.createdAt + parsedState.limits.taskDeadlineMs ||
                !Number.isSafeInteger(item.createdAt + parsedState.limits.taskDeadlineMs)
            )
                return fail(`${path}.deadlineAt`);
            if (
                item.status === "queued" &&
                (item.processingContextPublicationUpperBound !== undefined ||
                    item.processingStartedAt !== undefined ||
                    item.completedAt !== undefined ||
                    item.failureReason !== undefined)
            )
                return fail(
                    `${path}.${item.processingContextPublicationUpperBound !== undefined ? "processingContextPublicationUpperBound" : item.processingStartedAt !== undefined ? "processingStartedAt" : item.completedAt !== undefined ? "completedAt" : "failureReason"}`
                );
            if (
                item.status === "processing" &&
                (item.processingContextPublicationUpperBound === undefined ||
                    item.processingStartedAt === undefined)
            )
                return fail(
                    `${path}.${item.processingContextPublicationUpperBound === undefined ? "processingContextPublicationUpperBound" : "processingStartedAt"}`
                );
            if (
                item.status === "processing" &&
                (item.completedAt !== undefined || item.failureReason !== undefined)
            )
                return fail(
                    `${path}.${item.completedAt !== undefined ? "completedAt" : "failureReason"}`
                );
            if (
                item.status === "completed" &&
                (item.processingContextPublicationUpperBound === undefined ||
                    item.processingStartedAt === undefined ||
                    item.completedAt === undefined)
            )
                return fail(
                    `${path}.${item.processingContextPublicationUpperBound === undefined ? "processingContextPublicationUpperBound" : item.processingStartedAt === undefined ? "processingStartedAt" : "completedAt"}`
                );
            if (item.status === "completed" && item.failureReason !== undefined)
                return fail(`${path}.failureReason`);
            if (
                (item.status === "timed_out" || item.status === "cancelled") &&
                (item.completedAt === undefined || item.failureReason === undefined)
            )
                return fail(
                    `${path}.${item.completedAt === undefined ? "completedAt" : "failureReason"}`
                );
            if (
                item.processingStartedAt !== undefined &&
                (item.processingStartedAt < item.createdAt ||
                    item.processingStartedAt >= item.deadlineAt)
            )
                return fail(`${path}.processingStartedAt`);
            if (
                item.completedAt !== undefined &&
                (item.completedAt < item.createdAt ||
                    (item.processingStartedAt !== undefined &&
                        item.completedAt < item.processingStartedAt) ||
                    (item.status === "completed" && item.completedAt >= item.deadlineAt) ||
                    (item.status === "timed_out" && item.completedAt < item.deadlineAt))
            )
                return fail(`${path}.completedAt`);
            if (item.processingContextPublicationUpperBound !== undefined) {
                for (let j = 0; j < item.sendContextPublicationUpperBound.length; j++)
                    if (
                        item.processingContextPublicationUpperBound[j] !==
                        item.sendContextPublicationUpperBound[j]
                    )
                        return fail(`${path}.processingContextPublicationUpperBound[${j}]`);
                for (let j = 0; j < item.processingContextPublicationUpperBound.length; j++)
                    if (item.processingContextPublicationUpperBound[j] !== publications[j]?.id)
                        return fail(`${path}.processingContextPublicationUpperBound[${j}]`);
            }
            if (
                mails.some(
                    (other, j) =>
                        j < i &&
                        other.recipientId === item.recipientId &&
                        other.status === "processing"
                ) ||
                (item.status === "processing" &&
                    parsedState.contributions.some(
                        (c) =>
                            c.contributorId === item.recipientId &&
                            ![
                                "withdrawn",
                                "submission_missing",
                                "timed_out",
                                "supplement_rejected",
                                "closed"
                            ].includes(c.status)
                    ))
            )
                return fail(`${path}.recipientId`);
        }
    }
    if (own(value, "termination")) {
        const termination = parsedState.termination!;
        for (const [values, refs, path] of [
            [termination.decisionIds, decisionIds, "$.termination.decisionIds"],
            [termination.completionFactIds, completionFactIds, "$.termination.completionFactIds"],
            [termination.unresolvedQuestionIds, questionIds, "$.termination.unresolvedQuestionIds"],
            [termination.unresolvedIssueIds, issueIds, "$.termination.unresolvedIssueIds"],
            [
                termination.unclosedContributionIds,
                contributionIds,
                "$.termination.unclosedContributionIds"
            ]
        ] as const) {
            const p = checkRefs(values, refs, path);
            if (p) return fail(p);
        }
    }
    if (own(value, "archive")) {
        const archive = parsedState.archive!;
        for (const [values, refs, path] of [
            [archive.includedPublicationIds, publicationIds, "$.archive.includedPublicationIds"],
            [archive.includedDecisionIds, decisionIds, "$.archive.includedDecisionIds"],
            [
                archive.includedCompletionFactIds,
                completionFactIds,
                "$.archive.includedCompletionFactIds"
            ]
        ] as const) {
            const p = checkRefs(values, refs, path);
            if (p) return fail(p);
        }
    }
    const terminal = ["terminal", "archiving", "archived"].includes(lifecycle.status as string);
    if (terminal && !own(value, "termination")) return fail("$.termination");
    if (["archiving", "archived"].includes(lifecycle.status as string) && !own(value, "archive"))
        return fail("$.archive");
    if (own(value, "archive")) {
        const archive = value.archive as RecordValue;
        const termination = value.termination as RecordValue | undefined;
        if (!termination || archive.terminationId !== termination.id)
            return fail("$.archive.terminationId");
        if ((archive.publicSnapshotVersion as number) > (value.version as number))
            return fail("$.archive.publicSnapshotVersion");
        if (!["archiving", "archived"].includes(lifecycle.status as string))
            return fail("$.archive");
    }
    if (lifecycle.status === "archived" && (value.archive as RecordValue).status !== "complete")
        return fail("$.archive.status");
    return { kind: "valid", state: value as unknown as MeetingState };
}
