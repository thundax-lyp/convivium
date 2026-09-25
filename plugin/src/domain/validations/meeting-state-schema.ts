import { z } from "zod";

type RecordValue = Record<string, unknown>;

function own(value: RecordValue, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

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
const targetStatusSchema = z.enum(["pending", "satisfied", "unsatisfied"]);
const constraintStatusSchema = z.enum(["pending", "satisfied", "violated"]);
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
const hardConstraintSchema = z.object({
    id: opaqueIdSchema,
    text: textSchema,
    status: constraintStatusSchema
});
const objectiveSchema = z.object({
    statement: textSchema,
    requiredOutputs: uniqueEntityArray(objectiveTargetSchema),
    acceptanceCriteria: uniqueEntityArray(objectiveTargetSchema),
    hardConstraints: uniqueEntityArray(hardConstraintSchema),
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
        sessionId: opaqueIdSchema.optional(),
        definitionHash: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        resolvedAt: epochSchema.optional(),
        failureCode: textSchema.optional()
    }),
    ["identityId", "sessionId", "definitionHash", "resolvedAt", "failureCode"]
).superRefine((value, ctx) => {
    if (value.decision === "reject") {
        if (
            value.status !== "rejected" ||
            value.identityId !== undefined ||
            value.sessionId !== undefined ||
            value.definitionHash !== undefined ||
            value.failureCode !== undefined ||
            value.resolvedAt === undefined
        )
            ctx.addIssue({ code: "custom", path: ["status"] });
    } else if (
        value.identityId === undefined ||
        value.sessionId === undefined ||
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
    actorId: opaqueIdSchema,
    agendaId: opaqueIdSchema,
    description: textSchema,
    riskLevel: riskLevelSchema,
    classification: issueClassificationSchema,
    affectedOutputIds: uniqueIdArraySchema,
    affectedCriterionIds: uniqueIdArraySchema,
    affectedConstraintIds: uniqueIdArraySchema,
    requiresEvidenceReview: z.boolean(),
    blocking: z.boolean(),
    status: issueStatusSchema,
    rationale: textSchema
});
const managerPlanSchema = z.object({
    id: opaqueIdSchema,
    agendaId: opaqueIdSchema,
    managerId: opaqueIdSchema,
    basedOnPublicationId: opaqueIdSchema.optional(),
    roundGoal: z
        .object({ question: textSchema, evidenceGap: textSchema, expectedOutput: textSchema })
        .optional(),
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
const roundSchema = z
    .object({
        id: opaqueIdSchema,
        agendaId: opaqueIdSchema,
        planId: opaqueIdSchema,
        roundGoal: z.object({
            question: textSchema,
            evidenceGap: textSchema,
            expectedOutput: textSchema
        }),
        publicBaselinePublicationIds: uniqueIdArraySchema,
        openedAt: epochSchema,
        status: z.enum(["open", "published", "aborted"]),
        contributionIds: uniqueIdArraySchema,
        deadlineAt: epochSchema.optional(),
        publicationId: opaqueIdSchema.optional(),
        abortReason: textSchema.optional(),
        abortedAt: epochSchema.optional()
    })
    .refine((value) => isAbsentOrDefined(value, "publicationId"), { path: ["publicationId"] })
    .refine((value) => (value.status === "published") === own(value, "publicationId"), {
        path: ["publicationId"]
    })
    .refine(
        (value) =>
            (value.status === "aborted") === (own(value, "abortReason") && own(value, "abortedAt")),
        { path: ["abortReason"] }
    );
const contributionSchema = z
    .object({
        id: opaqueIdSchema,
        roundId: opaqueIdSchema,
        contributorId: opaqueIdSchema,
        handRaise: handRaiseSchema,
        acceptedAt: epochSchema,
        status: z.enum([
            "preparing",
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
    materialIds: uniqueIdArraySchema.min(1),
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
const evidenceVersionSchema = withDefinedOptionals(
    z.object({
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
        submittedAt: epochSchema,
        status: z.enum([
            "submitted",
            "validating",
            "validated",
            "validation_failed",
            "validation_cancelled"
        ]),
        failureCount: integerSchema,
        lastFailureReason: z
            .enum(["review_timeout", "review_interrupted", "dispatch_failed"])
            .optional()
    }),
    ["lastFailureReason"]
).superRefine((version, ctx) => {
    if ((version.status === "validation_failed") !== (version.lastFailureReason !== undefined))
        ctx.addIssue({ code: "custom", path: ["lastFailureReason"] });
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
const registrationSchema = z.object({
    id: opaqueIdSchema,
    versionId: opaqueIdSchema,
    status: z.literal("complete"),
    createdAt: epochSchema
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
const reviewClaimSchema = z
    .object({
        id: opaqueIdSchema,
        sourceEffectId: opaqueIdSchema,
        roundId: opaqueIdSchema,
        reviewerId: opaqueIdSchema,
        versionId: opaqueIdSchema,
        claimedAt: epochSchema,
        expiresAt: epochSchema
    })
    .refine((claim) => claim.expiresAt > claim.claimedAt, { path: ["expiresAt"] });
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
        evidenceIds: uniqueIdArraySchema.min(1),
        decisionIds: uniqueIdArraySchema.min(1),
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
const archiveQuestionDispositionPayloadSchema = z.object({
    kind: z.literal("question_disposition"),
    questionId: opaqueIdSchema,
    oldStatus: z.enum(["open", "deferred"]),
    newStatus: z.enum(["answered", "withdrawn", "deferred"]),
    oldBlocking: z.boolean(),
    newBlocking: z.boolean(),
    rationale: textSchema,
    evidenceIds: uniqueIdArraySchema
});
const archiveIssueDispositionPayloadSchema = z.object({
    kind: z.literal("issue_disposition"),
    issueId: opaqueIdSchema,
    oldStatus: z.enum(["open", "deferred"]),
    newStatus: z.enum(["resolved", "deferred", "out_of_scope"]),
    oldBlocking: z.boolean(),
    newBlocking: z.boolean(),
    rationale: textSchema,
    evidenceIds: uniqueIdArraySchema
});
const archiveDispositionFactSchema = z.union([
    z.object({
        factId: opaqueIdSchema,
        kind: z.literal("resolve_question"),
        actorId: opaqueIdSchema,
        occurredAt: epochSchema,
        relatedIds: uniqueIdArraySchema,
        payload: archiveQuestionDispositionPayloadSchema
    }),
    z.object({
        factId: opaqueIdSchema,
        kind: z.literal("dispose_issue"),
        actorId: opaqueIdSchema,
        occurredAt: epochSchema,
        relatedIds: uniqueIdArraySchema,
        payload: archiveIssueDispositionPayloadSchema
    })
]);
const archiveEvidenceBundleSchema = z.object({
    packageId: opaqueIdSchema,
    authorIdentityId: opaqueIdSchema,
    agendaId: opaqueIdSchema,
    version: evidenceVersionSchema,
    review: evidenceReviewSchema
});
const archiveUnclosedContributionSchema = withDefinedOptionals(
    z.object({
        contributionId: opaqueIdSchema,
        contributorIdentityId: opaqueIdSchema,
        agendaId: opaqueIdSchema,
        status: contributionSchema.shape.status,
        exitReason: textSchema.optional()
    }),
    ["exitReason"]
);
const archiveIdentityProvenanceSchema = withDefinedOptionals(
    z
        .object({
            identityId: opaqueIdSchema,
            displayName: textSchema,
            roles: uniqueRoleArraySchema,
            definitionId: opaqueIdSchema.optional(),
            definitionVersion: textSchema.optional(),
            definitionHash: z
                .string()
                .regex(/^[a-f0-9]{64}$/)
                .optional()
        })
        .refine(
            (value) =>
                (value.definitionId !== undefined &&
                    value.definitionVersion !== undefined &&
                    value.definitionHash !== undefined) ||
                (value.definitionId === undefined &&
                    value.definitionVersion === undefined &&
                    value.definitionHash === undefined),
            { path: ["definitionId"] }
        ),
    ["definitionId", "definitionVersion", "definitionHash"]
);
const archiveMaterialSchema = z.object({
    id: opaqueIdSchema,
    kind: z.enum([
        "published_evidence",
        "formal_message",
        "accepted_decision",
        "active_completion_fact"
    ]),
    title: textSchema,
    sourceObjectIds: uniqueIdArraySchema
});
const archiveSchema = z.lazy(() =>
    z.object({
        id: opaqueIdSchema,
        status: z.enum(["pending", "complete", "failed"]),
        createdAt: epochSchema,
        publicSnapshotVersion: positiveIntegerSchema,
        terminationId: opaqueIdSchema,
        objective: objectiveSchema,
        agenda: z.array(agendaSchema),
        agendaCandidates: z.array(candidateSchema),
        publications: z.array(publicationSchema),
        messages: z.array(formalMessageSchema),
        evidenceBundles: z.array(archiveEvidenceBundleSchema),
        proposalRevisions: z.array(proposalRevisionSchema),
        positions: z.array(positionSchema),
        decisionCandidates: z.array(decisionCandidateSchema),
        decisions: z.array(decisionSchema),
        completionFacts: z.array(completionFactSchema),
        questions: z.array(questionSchema),
        issues: z.array(issueSchema),
        riskDispositions: z.array(riskDispositionSchema),
        questionIssueDispositionFacts: z.array(archiveDispositionFactSchema),
        termination: terminationSchema,
        unresolvedQuestionIds: uniqueIdArraySchema,
        unresolvedIssueIds: uniqueIdArraySchema,
        unresolvedItemIds: uniqueIdArraySchema,
        unclosedContributions: z.array(archiveUnclosedContributionSchema),
        identityProvenance: z.array(archiveIdentityProvenanceSchema),
        exportMaterials: uniqueEntityArray(archiveMaterialSchema)
    })
);
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
        evidenceReviewerId: opaqueIdSchema,
        identities: uniqueEntityArray(identitySchema),
        identityRecommendations: uniqueEntityArray(identityRecommendationSchema),
        agenda: uniqueEntityArray(agendaSchema),
        agendaCandidates: uniqueEntityArray(candidateSchema),
        rounds: uniqueEntityArray(roundSchema),
        opportunityRequests: uniqueEntityArray(opportunityRequestSchema),
        pendingHandRaises: z.array(pendingHandRaiseSchema),
        contributions: uniqueEntityArray(contributionSchema),
        evidencePackages: uniqueEntityArray(evidencePackageSchema),
        registrations: uniqueEntityArray(registrationSchema),
        reviews: uniqueEntityArray(evidenceReviewSchema),
        reviewClaims: uniqueEntityArray(reviewClaimSchema),
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

export function parseMeetingStateShape(value: unknown) {
    return meetingStateSchema.safeParse(value);
}
