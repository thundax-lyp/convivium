import type { MeetingState, OpaqueId } from "./meeting-state-v1.js";
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
        definitionVersion: textSchema.optional()
    })
    .refine((value) => own(value, "definitionId") === own(value, "definitionVersion"), {
        path: ["definitionVersion"]
    })
    .refine((value) => isAbsentOrDefined(value, "definitionId"), { path: ["definitionId"] })
    .refine((value) => isAbsentOrDefined(value, "definitionVersion"), {
        path: ["definitionVersion"]
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
const pendingSupplementHandSchema = z.object({
    raisedAt: epochSchema,
    purpose: textSchema,
    reviewId: opaqueIdSchema
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
        pendingSupplementHand: pendingSupplementHandSchema.optional(),
        exitReason: textSchema.optional(),
        response: textSchema.optional()
    })
    .refine((value) => isAbsentOrDefined(value, "pendingSupplementHand"), {
        path: ["pendingSupplementHand"]
    })
    .refine(
        (value) =>
            value.pendingSupplementHand === undefined || value.status === "awaiting_response",
        { path: ["pendingSupplementHand"] }
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
        originalSource: textSchema,
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
        status: z.enum(["complete", "needs_correction", "deferred"]),
        missingFields: z.array(textSchema),
        createdAt: epochSchema
    })
    .refine((value) => value.status !== "complete" || value.missingFields.length === 0, {
        path: ["missingFields"]
    })
    .refine((value) => value.status !== "needs_correction" || value.missingFields.length > 0, {
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
    reason: textSchema
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
        failedAt: epochSchema.optional()
    })
    .refine((value) => !(value.status === "sent" ? own(value, "failedAt") : own(value, "sentAt")), {
        path: ["sentAt"]
    });
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
const meetingStateSchema = z.object({
    id: opaqueIdSchema,
    version: positiveIntegerSchema,
    createdAt: epochSchema,
    updatedAt: epochSchema,
    objective: objectiveSchema,
    lifecycle: lifecycleSchema,
    identities: uniqueEntityArray(identitySchema),
    agenda: uniqueEntityArray(agendaSchema),
    agendaCandidates: uniqueEntityArray(candidateSchema),
    rounds: uniqueEntityArray(roundSchema),
    contributions: uniqueEntityArray(contributionSchema),
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
    riskDispositions: z.array(z.unknown()),
    tasks: z.array(z.unknown()),
    completionDeclarations: z.array(z.unknown()),
    completionFacts: z.array(z.unknown()),
    privateMails: z.array(z.unknown()),
    managerPlans: uniqueEntityArray(managerPlanSchema),
    limits: limitsSchema,
    termination: z.unknown().optional(),
    archive: z.unknown().optional(),
    continuation: z.unknown().optional()
});
const outcomes = ["completed", "partial", "no_consensus", "cancelled", "failed"] as const;

function record(value: unknown): value is RecordValue {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function own(value: RecordValue, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function fail(path: string): MeetingStateValidationResultV1 {
    return { kind: "invalid", code: "INVALID_ARGUMENT", path };
}
function id(value: unknown): value is OpaqueId {
    return opaqueIdSchema.safeParse(value).success;
}
function text(value: unknown): value is string {
    return textSchema.safeParse(value).success;
}
function epoch(value: unknown): value is number {
    return epochSchema.safeParse(value).success;
}
function integer(value: unknown): value is number {
    return integerSchema.safeParse(value).success;
}
function positiveInteger(value: unknown): value is number {
    return positiveIntegerSchema.safeParse(value).success;
}
function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
    return typeof value === "string" && values.includes(value as T);
}
function ref(value: unknown, values: ReadonlySet<string>): boolean {
    return id(value) && values.has(value);
}
function required(value: RecordValue, key: string, path: string): string | undefined {
    return own(value, key) && value[key] !== null && value[key] !== undefined ? undefined : path;
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
    const objective = value.objective as RecordValue;
    const lifecycle = value.lifecycle as RecordValue;
    if (ownUndefined(lifecycle, "reason", "$.lifecycle.reason")) return fail("$.lifecycle.reason");
    const identityIds = new Set<string>();
    for (let i = 0; i < parsedState.identities.length; i++) {
        const item = parsedState.identities[i];
        const path = `$.identities[${i}]`;
        identityIds.add(item.id);
    }
    const agendaIds = new Set<string>();
    const outputIds = new Set(
        (objective.requiredOutputs as readonly RecordValue[]).map((item) => item.id as string)
    );
    const criterionIds = new Set(
        (objective.acceptanceCriteria as readonly RecordValue[]).map((item) => item.id as string)
    );
    const constraintIds = new Set(
        (objective.hardConstraints as readonly RecordValue[]).map((item) => item.id as string)
    );
    const unsatisfiedOutputIds = new Set(
        (objective.requiredOutputs as readonly RecordValue[])
            .filter((target) => target.status !== "satisfied")
            .map((target) => target.id as string)
    );
    const unsatisfiedCriterionIds = new Set(
        (objective.acceptanceCriteria as readonly RecordValue[])
            .filter((target) => target.status !== "satisfied")
            .map((target) => target.id as string)
    );
    const unsatisfiedConstraintIds = new Set(
        (objective.hardConstraints as readonly RecordValue[])
            .filter((target) => target.status !== "satisfied")
            .map((target) => target.id as string)
    );
    for (let i = 0; i < parsedState.agenda.length; i++) {
        const item = parsedState.agenda[i];
        const path = `$.agenda[${i}]`;
        agendaIds.add(item.id);
        const requiredOutputIds = item.requiredOutputIds as readonly unknown[];
        const requiredReviewerIds = item.requiredReviewerIds as readonly unknown[];
        for (let j = 0; j < requiredOutputIds.length; j++)
            if (!ref(requiredOutputIds[j], outputIds))
                return fail(`${path}.requiredOutputIds[${j}]`);
        for (let j = 0; j < requiredReviewerIds.length; j++)
            if (!ref(requiredReviewerIds[j], identityIds))
                return fail(`${path}.requiredReviewerIds[${j}]`);
        if (ownUndefined(item, "ownerId", `${path}.ownerId`)) return fail(`${path}.ownerId`);
    }
    const activeAgendaIndexes = parsedState.agenda.flatMap((item, index) =>
        record(item) && item.status === "active" ? [index] : []
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
        const item = parsedState.identities[i] as RecordValue;
        for (const key of ["agendaResponsibilityIds", "reviewResponsibilityIds"] as const) {
            const values = item[key] as readonly unknown[];
            for (let j = 0; j < values.length; j++)
                if (!ref(values[j], agendaIds)) return fail(`$.identities[${i}].${key}[${j}]`);
        }
        if (
            (item.reviewResponsibilityIds as readonly unknown[]).length > 0 &&
            !(item.roles as readonly unknown[]).includes("evidence_reviewer")
        )
            return fail(`$.identities[${i}].reviewResponsibilityIds[0]`);
    }
    for (let i = 0; i < parsedState.agenda.length; i++) {
        const item = parsedState.agenda[i] as RecordValue;
        const reviewers = item.requiredReviewerIds as readonly string[];
        for (let j = 0; j < reviewers.length; j++) {
            const identity = parsedState.identities.find(
                (candidate) => record(candidate) && candidate.id === reviewers[j]
            ) as RecordValue | undefined;
            if (
                !identity ||
                !(identity.roles as readonly unknown[]).includes("evidence_reviewer") ||
                !(identity.reviewResponsibilityIds as readonly unknown[]).includes(
                    item.id as string
                )
            )
                return fail(`$.agenda[${i}].requiredReviewerIds[${j}]`);
        }
    }
    const rounds = parsedState.rounds as readonly unknown[];
    const roundIds = new Set<string>();
    for (let i = 0; i < rounds.length; i++) {
        const item = rounds[i];
        const path = `$.rounds[${i}]`;
        const r = item as RecordValue;
        roundIds.add(r.id as string);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
    }
    const contributions = parsedState.contributions as readonly unknown[];
    const contributionIds = new Set<string>();
    for (let i = 0; i < contributions.length; i++) {
        const item = contributions[i];
        const path = `$.contributions[${i}]`;
        const r = item as RecordValue;
        contributionIds.add(r.id as string);
        if (!ref(r.roundId, roundIds)) return fail(`${path}.roundId`);
        if (!ref(r.contributorId, identityIds)) return fail(`${path}.contributorId`);
        if (ownUndefined(r, "packageId", `${path}.packageId`)) return fail(`${path}.packageId`);
    }
    const packages = value.evidencePackages as readonly unknown[];
    const packageIds = new Set<string>();
    const versionIds = new Set<string>();
    for (let i = 0; i < packages.length; i++) {
        const item = packages[i];
        const path = `$.evidencePackages[${i}]`;
        const r = item as RecordValue;
        if (!ref(r.roundId, roundIds)) return fail(`${path}.roundId`);
        if (!ref(r.contributionId, contributionIds)) return fail(`${path}.contributionId`);
        if (!ref(r.authorId, identityIds)) return fail(`${path}.authorId`);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        const contribution = contributions.find(
            (item) => record(item) && item.id === r.contributionId
        ) as RecordValue | undefined;
        const round = rounds.find((item) => record(item) && item.id === r.roundId) as
            RecordValue | undefined;
        if (!contribution || contribution.roundId !== r.roundId) return fail(`${path}.roundId`);
        if (!round || round.agendaId !== r.agendaId) return fail(`${path}.agendaId`);
        if (!contribution || contribution.contributorId !== r.authorId)
            return fail(`${path}.authorId`);
        packageIds.add(r.id as string);
        const packageVersionIds = new Set<string>();
        for (let j = 0; j < (r.versions as readonly unknown[]).length; j++) {
            const v = (r.versions as readonly unknown[])[j];
            const vp = `${path}.versions[${j}]`;
            const vr = v as RecordValue;
            const claimIds = new Set<string>();
            const materialIds = new Set<string>();
            for (let k = 0; k < (vr.materials as readonly RecordValue[]).length; k++) {
                const material = (vr.materials as readonly RecordValue[])[k];
                materialIds.add(material.id as string);
            }
            for (let k = 0; k < (vr.claims as readonly RecordValue[]).length; k++) {
                const claim = (vr.claims as readonly RecordValue[])[k];
                claimIds.add(claim.id as string);
                for (let m = 0; m < (claim.materialIds as readonly unknown[]).length; m++)
                    if (!materialIds.has((claim.materialIds as readonly unknown[])[m] as string))
                        return fail(`${vp}.claims[${k}].materialIds[${m}]`);
            }
            versionIds.add(vr.id as string);
            packageVersionIds.add(vr.id as string);
        }
        if (!packageVersionIds.has(r.currentVersionId as string))
            return fail(`${path}.currentVersionId`);
    }
    for (let i = 0; i < packages.length; i++) {
        const packageValue = packages[i] as RecordValue;
        if (!ref(packageValue.currentVersionId, versionIds))
            return fail(`$.evidencePackages[${i}].currentVersionId`);
        const contribution = contributions.find(
            (item) => record(item) && item.id === packageValue.contributionId
        ) as RecordValue | undefined;
        if (!contribution || contribution.packageId !== packageValue.id)
            return fail(`$.evidencePackages[${i}].contributionId`);
    }
    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i] as RecordValue;
        for (let j = 0; j < (round.contributionIds as readonly unknown[]).length; j++) {
            const contributionId = (round.contributionIds as readonly unknown[])[j];
            const contribution = contributions.find(
                (item) => record(item) && item.id === contributionId
            ) as RecordValue | undefined;
            if (!contribution || contribution.roundId !== round.id)
                return fail(`$.rounds[${i}].contributionIds[${j}]`);
        }
    }
    for (let i = 0; i < contributions.length; i++) {
        const contribution = contributions[i] as RecordValue;
        const round = rounds.find((item) => record(item) && item.id === contribution.roundId) as
            RecordValue | undefined;
        if (!round || !(round.contributionIds as readonly unknown[]).includes(contribution.id))
            return fail(`$.contributions[${i}].roundId`);
    }
    const registrations = parsedState.registrations as readonly unknown[];
    const registrationIds = new Set<string>();
    for (let i = 0; i < registrations.length; i++) {
        const r = registrations[i] as RecordValue;
        const path = `$.registrations[${i}]`;
        registrationIds.add(r.id as string);
        if (!ref(r.versionId, versionIds)) return fail(`${path}.versionId`);
        if (!ref(r.managerId, identityIds)) return fail(`${path}.managerId`);
        const manager = parsedState.identities.find(
            (identity) => record(identity) && identity.id === r.managerId
        ) as RecordValue | undefined;
        if (!manager || !(manager.roles as readonly unknown[]).includes("manager"))
            return fail(`${path}.managerId`);
    }
    const reviews = parsedState.reviews as readonly unknown[];
    const reviewIds = new Set<string>();
    for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i] as RecordValue;
        const path = `$.reviews[${i}]`;
        reviewIds.add(r.id as string);
        if (!ref(r.versionId, versionIds)) return fail(`${path}.versionId`);
        if (!ref(r.reviewerId, identityIds)) return fail(`${path}.reviewerId`);
        const reviewer = parsedState.identities.find(
            (identity) => record(identity) && identity.id === r.reviewerId
        ) as RecordValue | undefined;
        if (!reviewer || !(reviewer.roles as readonly unknown[]).includes("evidence_reviewer"))
            return fail(`${path}.reviewerId`);
    }
    const deliveries = value.reviewDeliveries as readonly unknown[];
    const deliveryIds = new Set<string>();
    for (let i = 0; i < deliveries.length; i++) {
        const r = deliveries[i] as RecordValue;
        const path = `$.reviewDeliveries[${i}]`;
        deliveryIds.add(r.id as string);
        if (!ref(r.reviewId, reviewIds)) return fail(`${path}.reviewId`);
        if (!ref(r.authorId, identityIds)) return fail(`${path}.authorId`);
        const review = reviews.find((item) => record(item) && item.id === r.reviewId) as
            RecordValue | undefined;
        const reviewedVersion = versionIds.has(review?.versionId as string)
            ? packages
                  .flatMap((item) => (record(item) ? (item.versions as readonly unknown[]) : []))
                  .find((item) => record(item) && item.id === review?.versionId)
            : undefined;
        if (review && reviewedVersion) {
            const ownerPackage = packages.find(
                (item) =>
                    record(item) &&
                    (item.versions as readonly unknown[]).some(
                        (version) => record(version) && version.id === review.versionId
                    )
            ) as RecordValue | undefined;
            if (ownerPackage && ownerPackage.authorId !== r.authorId)
                return fail(`${path}.authorId`);
        }
    }
    const publications = parsedState.publications as readonly unknown[];
    const publicationIds = new Set<string>();
    for (let i = 0; i < publications.length; i++) {
        const r = publications[i] as RecordValue;
        const path = `$.publications[${i}]`;
        publicationIds.add(r.id as string);
        if (!ref(r.roundId, roundIds)) return fail(`${path}.roundId`);
        for (let j = 0; j < (r.finalVersionIds as readonly unknown[]).length; j++)
            if (!ref((r.finalVersionIds as readonly unknown[])[j], versionIds))
                return fail(`${path}.finalVersionIds[${j}]`);
        for (let j = 0; j < (r.finalReviewIds as readonly unknown[]).length; j++)
            if (!ref((r.finalReviewIds as readonly unknown[])[j], reviewIds))
                return fail(`${path}.finalReviewIds[${j}]`);
    }
    for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i] as RecordValue;
        if (r.status === "published") {
            const publication = publications.find(
                (item) => record(item) && item.id === r.publicationId
            ) as RecordValue | undefined;
            if (!publication || publication.roundId !== r.id)
                return fail(`$.rounds[${i}].publicationId`);
        }
    }
    const publishedVersionIds = new Set<string>();
    for (let i = 0; i < publications.length; i++) {
        const publication = publications[i] as RecordValue;
        const round = rounds.find((item) => record(item) && item.id === publication.roundId) as
            RecordValue | undefined;
        for (let j = 0; j < (publication.finalVersionIds as readonly unknown[]).length; j++) {
            const versionId = (publication.finalVersionIds as readonly unknown[])[j];
            const owner = packages.find(
                (item) =>
                    record(item) &&
                    (item.versions as readonly unknown[]).some(
                        (version) => record(version) && version.id === versionId
                    )
            ) as RecordValue | undefined;
            if (!owner || owner.roundId !== publication.roundId || round === undefined)
                return fail(`$.publications[${i}].finalVersionIds[${j}]`);
            publishedVersionIds.add(versionId as string);
        }
        for (let j = 0; j < (publication.finalReviewIds as readonly unknown[]).length; j++) {
            const reviewId = (publication.finalReviewIds as readonly unknown[])[j];
            const review = reviews.find((item) => record(item) && item.id === reviewId) as
                RecordValue | undefined;
            const owner =
                review &&
                (packages.find(
                    (item) =>
                        record(item) &&
                        (item.versions as readonly unknown[]).some(
                            (version) => record(version) && version.id === review.versionId
                        )
                ) as RecordValue | undefined);
            if (!review || !owner || owner.roundId !== publication.roundId)
                return fail(`$.publications[${i}].finalReviewIds[${j}]`);
        }
    }
    const messages = parsedState.messages as readonly unknown[];
    const messageIds = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
        const r = messages[i] as RecordValue;
        const path = `$.messages[${i}]`;
        messageIds.add(r.id as string);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        if (!ref(r.publicationId, publicationIds)) return fail(`${path}.publicationId`);
    }
    const proposals = parsedState.proposals as readonly unknown[];
    const proposalIds = new Set<string>();
    const revisionIds = new Set<string>();
    for (let i = 0; i < proposals.length; i++) {
        const r = proposals[i] as RecordValue;
        const path = `$.proposals[${i}]`;
        proposalIds.add(r.id as string);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        for (let j = 0; j < (r.evidenceIds as readonly unknown[]).length; j++)
            if (!ref((r.evidenceIds as readonly unknown[])[j], publishedVersionIds))
                return fail(`${path}.evidenceIds[${j}]`);
        if (!revisionIds.has(r.id as string)) revisionIds.add(r.id as string);
    }
    const positions = parsedState.positions as readonly unknown[];
    const positionIds = new Set<string>();
    for (let i = 0; i < positions.length; i++) {
        const r = positions[i] as RecordValue;
        const path = `$.positions[${i}]`;
        positionIds.add(r.id as string);
        if (!ref(r.proposalRevisionId, proposalIds)) return fail(`${path}.proposalRevisionId`);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        for (let j = 0; j < (r.evidenceIds as readonly unknown[]).length; j++)
            if (!ref((r.evidenceIds as readonly unknown[])[j], publishedVersionIds))
                return fail(`${path}.evidenceIds[${j}]`);
    }
    const decisionCandidates = parsedState.decisionCandidates as readonly unknown[];
    const decisionCandidateIds = new Set<string>();
    for (let i = 0; i < decisionCandidates.length; i++) {
        const r = decisionCandidates[i] as RecordValue;
        const path = `$.decisionCandidates[${i}]`;
        decisionCandidateIds.add(r.id as string);
        if (!ref(r.proposalRevisionId, proposalIds)) return fail(`${path}.proposalRevisionId`);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        for (let j = 0; j < (r.evidenceIds as readonly unknown[]).length; j++)
            if (!ref((r.evidenceIds as readonly unknown[])[j], publishedVersionIds))
                return fail(`${path}.evidenceIds[${j}]`);
        for (let j = 0; j < (r.positionIds as readonly unknown[]).length; j++)
            if (!ref((r.positionIds as readonly unknown[])[j], positionIds))
                return fail(`${path}.positionIds[${j}]`);
            else {
                const position = positions.find(
                    (item) => record(item) && item.id === (r.positionIds as readonly unknown[])[j]
                ) as RecordValue | undefined;
                if (!position || position.proposalRevisionId !== r.proposalRevisionId)
                    return fail(`${path}.positionIds[${j}]`);
            }
    }
    const decisions = parsedState.decisions as readonly unknown[];
    const decisionIds = new Set<string>();
    for (let i = 0; i < decisions.length; i++) {
        const r = decisions[i] as RecordValue;
        const path = `$.decisions[${i}]`;
        decisionIds.add(r.id as string);
        if (!ref(r.candidateId, decisionCandidateIds)) return fail(`${path}.candidateId`);
        if (!ref(r.proposalRevisionId, proposalIds)) return fail(`${path}.proposalRevisionId`);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        for (let j = 0; j < (r.evidenceIds as readonly unknown[]).length; j++)
            if (!ref((r.evidenceIds as readonly unknown[])[j], publishedVersionIds))
                return fail(`${path}.evidenceIds[${j}]`);
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
        const ownerPackage = packages.find(
            (publication) =>
                record(publication) &&
                (publication.versions as readonly unknown[]).some(
                    (version) => record(version) && version.id === r.versionId
                )
        ) as RecordValue | undefined;
        const round =
            ownerPackage &&
            (rounds.find(
                (candidate) => record(candidate) && candidate.id === ownerPackage.roundId
            ) as RecordValue | undefined);
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
        const r = decisions[i] as RecordValue;
        const candidate = decisionCandidates.find(
            (item) => record(item) && item.id === r.candidateId
        ) as RecordValue | undefined;
        if (candidate && r.proposalRevisionId !== candidate.proposalRevisionId)
            return fail(`$.decisions[${i}].proposalRevisionId`);
        if (candidate && r.actorId !== candidate.actorId) return fail(`$.decisions[${i}].actorId`);
        if (candidate && JSON.stringify(r.evidenceIds) !== JSON.stringify(candidate.evidenceIds))
            return fail(`$.decisions[${i}].evidenceIds`);
        if (candidate && JSON.stringify(r.positionIds) !== JSON.stringify(candidate.positionIds))
            return fail(`$.decisions[${i}].positionIds`);
    }
    const candidates = parsedState.agendaCandidates as readonly unknown[];
    const candidateIds = new Set<string>();
    for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i] as RecordValue;
        const path = `$.agendaCandidates[${i}]`;
        if (candidateIds.has(item.id as string)) return fail(`${path}.id`);
        candidateIds.add(item.id as string);
        if (ownUndefined(item, "sourceMessageId", `${path}.sourceMessageId`))
            return fail(`${path}.sourceMessageId`);
        if (item.sourceMessageId !== undefined && !ref(item.sourceMessageId, messageIds))
            return fail(`${path}.sourceMessageId`);
    }
    const questions = parsedState.questions as readonly unknown[];
    const questionIds = new Set<string>();
    for (let i = 0; i < questions.length; i++) {
        const item = questions[i] as RecordValue;
        const path = `$.questions[${i}]`;
        if (questionIds.has(item.id as string)) return fail(`${path}.id`);
        questionIds.add(item.id as string);
        if (!ref(item.actorId, identityIds)) return fail(`${path}.actorId`);
        if (!ref(item.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        for (const [key, targets] of [
            ["affectedOutputIds", outputIds],
            ["affectedCriterionIds", criterionIds],
            ["affectedConstraintIds", constraintIds]
        ] as const) {
            const values = item[key] as readonly unknown[];
            for (let j = 0; j < values.length; j++)
                if (!ref(values[j], targets)) return fail(`${path}.${key}[${j}]`);
        }
        const unsatisfiedOutputIds = new Set(
            (objective.requiredOutputs as readonly RecordValue[])
                .filter((target) => target.status !== "satisfied")
                .map((target) => target.id as string)
        );
        const unsatisfiedCriterionIds = new Set(
            (objective.acceptanceCriteria as readonly RecordValue[])
                .filter((target) => target.status !== "satisfied")
                .map((target) => target.id as string)
        );
        const unsatisfiedConstraintIds = new Set(
            (objective.hardConstraints as readonly RecordValue[])
                .filter((target) => target.status !== "satisfied")
                .map((target) => target.id as string)
        );
        const blockingQualified =
            (item.affectedOutputIds as readonly string[]).some((targetId) =>
                unsatisfiedOutputIds.has(targetId)
            ) ||
            (item.affectedCriterionIds as readonly string[]).some((targetId) =>
                unsatisfiedCriterionIds.has(targetId)
            ) ||
            (item.affectedConstraintIds as readonly string[]).some((targetId) =>
                unsatisfiedConstraintIds.has(targetId)
            );
        if (item.blocking && !blockingQualified) return fail(`${path}.blocking`);
        if (["answered", "withdrawn"].includes(item.status as string) && item.blocking)
            return fail(`${path}.blocking`);
    }
    if (parsedState.limits.responseDeadlineMs !== 60000) return fail("$.limits.responseDeadlineMs");
    const issues = parsedState.issues as readonly unknown[];
    const issueIds = new Set<string>();
    for (let i = 0; i < issues.length; i++) {
        const item = issues[i] as RecordValue;
        const path = `$.issues[${i}]`;
        if (issueIds.has(item.id as string)) return fail(`${path}.id`);
        issueIds.add(item.id as string);
        if (!agendaIds.has(item.agendaId as string)) return fail(`${path}.agendaId`);
        for (const key of [
            "affectedOutputIds",
            "affectedCriterionIds",
            "affectedConstraintIds",
            "requiredReviewerIds"
        ] as const) {
            const values = item[key] as readonly unknown[];
            const reviewerIds =
                ((
                    parsedState.agenda.find(
                        (agenda) => record(agenda) && agenda.id === item.agendaId
                    ) as RecordValue | undefined
                )?.requiredReviewerIds as readonly string[] | undefined) ?? [];
            const targets =
                key === "affectedOutputIds"
                    ? outputIds
                    : key === "affectedCriterionIds"
                      ? criterionIds
                      : key === "affectedConstraintIds"
                        ? constraintIds
                        : new Set(reviewerIds);
            for (let j = 0; j < values.length; j++)
                if (!ref(values[j], targets)) return fail(`${path}.${key}[${j}]`);
        }
        if (
            item.classification === "accepted_risk" &&
            !(value.riskDispositions as readonly unknown[]).some(
                (disposition) =>
                    record(disposition) &&
                    disposition.issueId === item.id &&
                    disposition.action === "accept"
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
            const agendaReviewers = new Set(
                (
                    parsedState.agenda.find(
                        (agenda) => record(agenda) && agenda.id === item.agendaId
                    ) as RecordValue
                ).requiredReviewerIds as readonly string[]
            );
            const reviewerQualified = (item.requiredReviewerIds as readonly string[]).some(
                (reviewerId) => agendaReviewers.has(reviewerId)
            );
            const outputQualified = (item.affectedOutputIds as readonly string[]).some((targetId) =>
                unsatisfiedOutputIds.has(targetId)
            );
            const criterionQualified = (item.affectedCriterionIds as readonly string[]).some(
                (targetId) => unsatisfiedCriterionIds.has(targetId)
            );
            const constraintQualified = (item.affectedConstraintIds as readonly string[]).some(
                (targetId) => unsatisfiedConstraintIds.has(targetId)
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
    const plans = value.managerPlans as readonly unknown[];
    const planIds = new Set<string>();
    const activePlanAgendas = new Set<string>();
    for (let i = 0; i < plans.length; i++) {
        const item = plans[i] as RecordValue;
        const path = `$.managerPlans[${i}]`;
        if (planIds.has(item.id as string)) return fail(`${path}.id`);
        planIds.add(item.id as string);
        if (!ref(item.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        if (!ref(item.managerId, identityIds)) return fail(`${path}.managerId`);
        const manager = parsedState.identities.find(
            (identity) => record(identity) && identity.id === item.managerId
        ) as RecordValue | undefined;
        if (!manager || !(manager.roles as readonly unknown[]).includes("manager"))
            return fail(`${path}.managerId`);
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
    }
    if (own(value, "termination")) {
        const item = value.termination;
        const path = "$.termination";
        if (!record(item)) return fail(path);
        for (const key of [
            "id",
            "outcome",
            "reason",
            "endedAt",
            "decisionIds",
            "completionFactIds",
            "unresolvedQuestionIds",
            "unresolvedIssueIds",
            "unclosedContributionIds"
        ] as const) {
            const p = required(item, key, `${path}.${key}`);
            if (p) return fail(p);
        }
        if (!id(item.id)) return fail(`${path}.id`);
        if (!oneOf(item.outcome, outcomes)) return fail(`${path}.outcome`);
        if (!text(item.reason)) return fail(`${path}.reason`);
        if (!epoch(item.endedAt)) return fail(`${path}.endedAt`);
        for (const key of [
            "decisionIds",
            "completionFactIds",
            "unresolvedQuestionIds",
            "unresolvedIssueIds",
            "unclosedContributionIds"
        ] as const) {
        }
    }
    return { kind: "valid", state: value as unknown as MeetingState };
}
