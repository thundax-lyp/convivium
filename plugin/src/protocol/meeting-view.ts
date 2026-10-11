import { z } from "zod";
import { RoleErrorCodeSchema } from "./meeting-identity.ts";

const id = z.string().trim().min(1);
const text = z.string().trim().min(1);
const epoch = z.number().int().nonnegative();
const role = z.enum(["captain", "manager", "contributor", "evidence_reviewer"]);
const lifecycle = z.enum([
    "preparing",
    "running",
    "paused",
    "converging",
    "ending",
    "terminal",
    "archiving",
    "archived"
]);
const MEETING_EVENT_KINDS = [
    "meeting.created",
    "meeting.lifecycle_changed",
    "agenda.activated",
    "agenda_candidate.disposed",
    "manager_plan.recorded",
    "round.opened",
    "round.participation_recorded",
    "hand_raise.recorded",
    "hand_raise.disposed",
    "evidence.submitted",
    "contribution.closed",
    "contribution.failed",
    "evidence_review.claimed",
    "evidence_validation.failed",
    "evidence_review.submitted",
    "review_delivery.recorded",
    "round.published",
    "formal_message.published",
    "round.aborted",
    "identity.recommended",
    "identity.admission_recorded",
    "question.disposed",
    "issue.disposed",
    "risk.disposed",
    "decision.recorded",
    "decision.changed",
    "completion_fact.recorded",
    "completion_fact.changed",
    "meeting.ended",
    "archive.started",
    "archive.completed"
] as const;
export const MeetingEventKindSchema = z.enum(MEETING_EVENT_KINDS);
export const MeetingEventObjectRefSchema = z.strictObject({
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
        "decision",
        "completion_fact",
        "risk_disposition",
        "termination",
        "archive"
    ]),
    id
});
export const MeetingEventActorSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("captain"), actorId: id }),
    z.strictObject({ kind: z.literal("identity"), actorId: id }),
    z.strictObject({ kind: z.literal("system") })
]);
const eventEpoch = z.number().int().nonnegative().safe();
const MeetingEventDataSchemaByKind = {
    "meeting.created": z.strictObject({}),
    "meeting.lifecycle_changed": z
        .strictObject({ from: lifecycle, to: lifecycle, reason: text.optional() })
        .refine((value) => value.from !== value.to, {
            path: ["to"],
            message: "Lifecycle must change"
        }),
    "agenda.activated": z.strictObject({
        previousDisposition: z.enum(["completed", "deferred", "closed"]),
        reason: text
    }),
    "agenda_candidate.disposed": z.strictObject({
        disposition: z.enum(["promoted", "parked", "rejected"]),
        reason: text
    }),
    "manager_plan.recorded": z.strictObject({
        planKind: z.enum([
            "open_round",
            "continue_agenda",
            "stop_agenda",
            "raise_agenda_candidate",
            "wait_for_required_identity"
        ]),
        rationale: text,
        blockingReason: text.optional()
    }),
    "round.opened": z.strictObject({ deadlineAt: eventEpoch.optional() }),
    "round.participation_recorded": z.discriminatedUnion("status", [
        z.strictObject({ contributorId: id, status: z.literal("declined"), reason: text }),
        z.strictObject({ contributorId: id, status: z.literal("no_response") })
    ]),
    "hand_raise.recorded": z.strictObject({ contributorId: id, purpose: text }),
    "hand_raise.disposed": z.discriminatedUnion("disposition", [
        z.strictObject({
            contributorId: id,
            disposition: z.literal("accepted"),
            reason: text,
            contributionId: id
        }),
        z.strictObject({
            contributorId: id,
            disposition: z.enum(["rejected", "deferred"]),
            reason: text
        })
    ]),
    "evidence.submitted": z.strictObject({ summary: text }),
    "contribution.closed": z.strictObject({
        exit: z.enum(["withdrawn", "timed_out", "submission_missing"]),
        reason: text
    }),
    "contribution.failed": z.strictObject({
        sourceEffectId: id,
        stage: text,
        failureCode: text,
        failureSummary: text,
        attemptCount: z.number().int().positive().safe(),
        retryable: z.boolean()
    }),
    "evidence_review.claimed": z.strictObject({ claimId: id, sourceEffectId: id }),
    "evidence_validation.failed": z.strictObject({
        claimId: id,
        reason: z.enum(["review_timeout", "review_interrupted", "dispatch_failed"])
    }),
    "evidence_review.submitted": z.strictObject({ claimId: id, scope: text }),
    "review_delivery.recorded": z.discriminatedUnion("status", [
        z.strictObject({ status: z.literal("sent") }),
        z.strictObject({ status: z.literal("failed"), failureReason: text })
    ]),
    "round.published": z.strictObject({}),
    "formal_message.published": z.strictObject({ messageKind: text }),
    "round.aborted": z.strictObject({ reason: text }),
    "identity.recommended": z.discriminatedUnion("decision", [
        z.strictObject({
            decision: z.literal("reject"),
            status: z.literal("rejected"),
            rationale: text
        }),
        z.strictObject({
            decision: z.literal("admit"),
            status: z.enum(["provisioning", "active"]),
            rationale: text
        })
    ]),
    "identity.admission_recorded": z.discriminatedUnion("status", [
        z.strictObject({ status: z.literal("active") }),
        z.strictObject({ status: z.literal("failed"), failureCode: text })
    ]),
    "question.disposed": z.strictObject({
        status: z.enum(["answered", "withdrawn", "deferred"]),
        rationale: text
    }),
    "issue.disposed": z.strictObject({
        status: z.enum(["resolved", "deferred", "out_of_scope"]),
        rationale: text
    }),
    "risk.disposed": z.strictObject({
        action: z.enum(["accept", "reject"]),
        scope: text,
        rationale: text
    }),
    "decision.recorded": z.strictObject({ status: z.literal("accepted") }),
    "decision.changed": z.discriminatedUnion("status", [
        z.strictObject({
            status: z.literal("superseded"),
            rationale: text,
            replacementDecisionId: id
        }),
        z.strictObject({ status: z.literal("revoked"), rationale: text })
    ]),
    "completion_fact.recorded": z.strictObject({ outputId: id, statement: text, rationale: text }),
    "completion_fact.changed": z.discriminatedUnion("status", [
        z.strictObject({ status: z.literal("superseded"), rationale: text, replacementFactId: id }),
        z.strictObject({ status: z.literal("revoked"), rationale: text })
    ]),
    "meeting.ended": z.strictObject({
        outcome: z.enum(["completed", "partial", "no_consensus", "cancelled", "failed"]),
        reason: text
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
        meetingVersion: z.number().int().positive().safe(),
        kind: z.literal(kind),
        occurredAt: eventEpoch,
        actor: MeetingEventActorSchema,
        subject: z.strictObject({ kind: z.literal(subjectKind), id }),
        relatedObjects: z.array(MeetingEventObjectRefSchema),
        data: MeetingEventDataSchemaByKind[kind]
    });
export const MeetingEventViewSchema = z.discriminatedUnion("kind", [
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
    meetingEvent("decision.recorded", "decision"),
    meetingEvent("decision.changed", "decision"),
    meetingEvent("completion_fact.recorded", "completion_fact"),
    meetingEvent("completion_fact.changed", "completion_fact"),
    meetingEvent("meeting.ended", "termination"),
    meetingEvent("archive.started", "archive"),
    meetingEvent("archive.completed", "archive")
]);
export type MeetingEventKind = z.infer<typeof MeetingEventKindSchema>;
export type MeetingEventObjectRef = z.infer<typeof MeetingEventObjectRefSchema>;
export type MeetingEventActor = z.infer<typeof MeetingEventActorSchema>;
export type MeetingEventView = z.infer<typeof MeetingEventViewSchema>;
const risk = z.enum(["low", "medium", "high"]);
const target = z.object({
    id,
    text,
    status: z.enum(["pending", "satisfied", "unsatisfied"])
});

export const ObjectiveViewSchema = z.object({
    statement: text,
    requiredOutputs: z.array(target),
    acceptanceCriteria: z.array(target),
    hardConstraints: z.array(
        z.object({ id, text, status: z.enum(["pending", "satisfied", "violated"]) })
    ),
    acceptableRiskLevel: risk
});
export const LifecycleViewSchema = z.object({
    status: lifecycle,
    changedAt: epoch,
    reason: text.optional()
});
export const AgendaViewSchema = z.object({
    id,
    title: text,
    question: text,
    status: z.enum(["pending", "active", "blocked", "completed", "deferred", "closed"]),
    ownerId: id.optional(),
    requiredOutputIds: z.array(id)
});
export const AgendaCandidateViewSchema = z.object({
    id,
    title: text,
    reason: text,
    sourceMessageId: id.optional(),
    status: z.enum(["pending", "promoted", "parked", "rejected"])
});
export const EvidenceOpportunityRequestViewSchema = z.object({
    id,
    agendaId: id,
    contributorId: id,
    purpose: text,
    requestedAt: epoch
});
export const PendingHandRaiseViewSchema = z.object({
    roundId: id,
    contributorId: id,
    purpose: text,
    raisedAt: epoch
});
export const ContributionViewSchema = z.object({
    id,
    contributorId: id,
    status: z.enum([
        "preparing",
        "registered",
        "under_review",
        "awaiting_response",
        "withdrawn",
        "submission_missing",
        "execution_failed",
        "timed_out",
        "supplement_rejected",
        "aborted",
        "closed"
    ]),
    packageId: id.optional(),
    substantiveSupplementCount: z.number().int().nonnegative(),
    exitReason: text.optional(),
    failure: z
        .object({
            sourceEffectId: id,
            stage: text,
            failureCode: text,
            failureSummary: text,
            attemptCount: z.number().int().positive(),
            retryable: z.boolean(),
            occurredAt: epoch
        })
        .optional()
});
export const RoundViewSchema = z.object({
    id,
    agendaId: id,
    planId: id,
    roundGoal: z.object({ question: text, evidenceGap: text, expectedOutput: text }),
    status: z.enum(["open", "published", "aborted"]),
    baselinePublicationIds: z.array(id),
    openedAt: epoch,
    deadlineAt: epoch.optional(),
    publicationId: id.optional(),
    abortReason: text.optional(),
    abortedAt: epoch.optional(),
    participationResponses: z
        .array(
            z.object({
                contributorId: id,
                status: z.enum(["raised", "declined", "no_response"]),
                recordedAt: epoch
            })
        )
        .optional(),
    invitedContributorIds: z.array(id).optional(),
    pendingHandRaises: z.array(PendingHandRaiseViewSchema),
    contributions: z.array(ContributionViewSchema)
});
export const PublicationViewSchema = z.object({
    id,
    roundId: id,
    seq: z.number().int().positive(),
    finalVersionIds: z.array(id),
    finalReviewIds: z.array(id),
    exitReasons: z.array(text),
    contributionFailures: z
        .array(
            z.object({
                contributionId: id,
                failure: z.object({
                    sourceEffectId: id,
                    stage: text,
                    failureCode: text,
                    failureSummary: text,
                    attemptCount: z.number().int().positive(),
                    retryable: z.boolean(),
                    occurredAt: epoch
                })
            })
        )
        .optional(),
    publishedAt: epoch
});
const textWithReason = z.object({ value: text, reason: text.optional() });
const evidenceClaim = z.object({
    id,
    statement: text,
    materialIds: z.array(id),
    qualification: text
});
const material = z.object({
    id,
    kind: z.enum([
        "document",
        "dataset",
        "experiment",
        "observation",
        "tool_output",
        "unknown",
        "not_applicable"
    ]),
    originator: text,
    originalSource: text,
    sourcePublishedAt: text,
    acquiredAt: text,
    version: text,
    locator: text,
    location: text,
    verificationConditions: text,
    limitations: text,
    sharedDependencies: z.array(text),
    reason: text.optional()
});
export const EvidenceVersionViewSchema = z.object({
    id,
    ordinal: z.number().int().positive(),
    summary: text.optional(),
    observation: text,
    interpretation: text,
    method: text,
    falsifiers: z.array(textWithReason),
    uncertainties: z.array(textWithReason),
    limitations: z.array(textWithReason),
    claims: z.array(evidenceClaim),
    materials: z.array(material),
    submittedAt: epoch,
    status: z.enum([
        "submitted",
        "validating",
        "validated",
        "validation_failed",
        "validation_cancelled"
    ]),
    failureCount: z.number().int().nonnegative(),
    lastFailureReason: z
        .enum(["review_timeout", "review_interrupted", "dispatch_failed"])
        .optional()
});
export const EvidencePackageViewSchema = z.object({
    id,
    roundId: id,
    contributionId: id,
    authorId: id,
    agendaId: id,
    currentVersion: EvidenceVersionViewSchema
});
export const EvidenceValidationStatusViewSchema = z.object({
    packageId: id,
    contributionId: id,
    versionId: id,
    status: z.enum([
        "submitted",
        "validating",
        "validated",
        "validation_failed",
        "validation_cancelled"
    ]),
    failureCount: z.number().int().nonnegative(),
    lastFailureReason: z
        .enum(["review_timeout", "review_interrupted", "dispatch_failed"])
        .optional()
});
const dimension = z.object({
    score: z.union([
        z.literal(0),
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal("unable_to_assess")
    ]),
    reason: text,
    scope: text,
    baselineEvidenceIds: z.array(id)
});
const reviewFields = {
    id,
    versionId: id,
    baselinePublicationIds: z.array(id),
    scope: text,
    dimensions: z.object({
        source: dimension,
        credibility: dimension,
        completeness: dimension,
        support: dimension
    }),
    createdAt: epoch
};
export const EvidenceReviewViewSchema = z.object({
    ...reviewFields,
    reviewerId: id
});
export const ReviewDeliveryViewSchema = z
    .object({
        id,
        reviewId: id,
        authorId: id,
        status: z.enum(["sent", "failed"]),
        sentAt: epoch.optional(),
        failedAt: epoch.optional(),
        failureReason: text.optional()
    })
    .superRefine((value, ctx) => {
        const valid =
            value.status === "sent"
                ? value.sentAt !== undefined &&
                  value.failedAt === undefined &&
                  value.failureReason === undefined
                : value.sentAt === undefined &&
                  value.failedAt !== undefined &&
                  value.failureReason !== undefined;
        if (!valid) {
            ctx.addIssue({ code: "custom", path: ["status"] });
        }
    });
export const FormalMessageViewSchema = z.object({
    id,
    seq: z.number().int().positive(),
    actorId: id,
    agendaId: id,
    kind: text,
    body: text,
    publicationId: id,
    relatedIds: z.array(id),
    createdAt: epoch
});
export const ProposalRevisionViewSchema = z.object({
    id,
    proposalId: id,
    ordinal: z.number().int().positive(),
    actorId: id,
    agendaId: id,
    summary: text,
    body: text,
    evidenceIds: z.array(id),
    supersedesRevisionId: id.optional(),
    createdAt: epoch
});
export const PositionViewSchema = z.object({
    id,
    proposalRevisionId: id,
    actorId: id,
    stance: z.enum(["support", "oppose", "abstain", "conditional"]),
    rationale: text,
    evidenceIds: z.array(id),
    createdAt: epoch
});
export const DecisionCandidateViewSchema = z.object({
    id,
    proposalRevisionId: id,
    actorId: id,
    outcome: z.enum(["adopt", "reject", "defer"]),
    rationale: text,
    evidenceIds: z.array(id),
    positionIds: z.array(id),
    createdAt: epoch
});
export const DecisionViewSchema = z.object({
    ...DecisionCandidateViewSchema.shape,
    candidateId: id,
    status: z.enum(["accepted", "superseded", "revoked"]),
    replacesDecisionId: id.optional()
});
export const QuestionViewSchema = z.object({
    id,
    actorId: id,
    agendaId: id,
    text,
    blocking: z.boolean(),
    status: z.enum(["open", "answered", "withdrawn", "deferred"]),
    affectedOutputIds: z.array(id),
    affectedCriterionIds: z.array(id),
    affectedConstraintIds: z.array(id)
});
export const IssueViewSchema = z.object({
    id,
    actorId: id,
    agendaId: id,
    description: text,
    riskLevel: risk,
    classification: z.enum([
        "blocking",
        "follow_up",
        "pending_discussion",
        "accepted_risk",
        "out_of_scope"
    ]),
    affectedOutputIds: z.array(id),
    affectedCriterionIds: z.array(id),
    affectedConstraintIds: z.array(id),
    requiresEvidenceReview: z.boolean(),
    blocking: z.boolean(),
    status: z.enum(["open", "resolved", "deferred", "out_of_scope"]),
    rationale: text
});
export const CompletionFactViewSchema = z.object({
    id,
    actorId: id,
    outputId: id,
    criterionId: id.optional(),
    status: z.enum(["active", "superseded", "revoked"]),
    statement: text,
    rationale: text,
    evidenceIds: z.array(id),
    decisionIds: z.array(id),
    createdAt: epoch
});
export const RiskDispositionViewSchema = z.object({
    id,
    actorId: id,
    issueId: id,
    action: z.enum(["accept", "reject"]),
    scope: text,
    rationale: text,
    evidenceIds: z.array(id),
    createdAt: epoch
});
export const TerminationViewSchema = z.object({
    id,
    outcome: z.enum(["completed", "partial", "no_consensus", "cancelled", "failed"]),
    reason: text,
    endedAt: epoch,
    decisionIds: z.array(id),
    completionFactIds: z.array(id),
    unresolvedQuestionIds: z.array(id),
    unresolvedIssueIds: z.array(id),
    unclosedContributionIds: z.array(id)
});
export const OutcomeViewSchema = z.object({
    decisions: z.array(DecisionViewSchema),
    completionFacts: z.array(CompletionFactViewSchema),
    riskDispositions: z.array(RiskDispositionViewSchema),
    pendingDecisionCandidates: z.array(DecisionCandidateViewSchema).optional(),
    termination: TerminationViewSchema.optional()
});

const factBase = { factId: id, actorId: id, occurredAt: epoch, relatedIds: z.array(id) };
export const CommittedFactViewSchema = z.discriminatedUnion("kind", [
    z.object({
        ...factBase,
        kind: z.literal("resolve_question"),
        payload: z.object({
            kind: z.literal("question_disposition"),
            questionId: id,
            oldStatus: z.enum(["open", "deferred"]),
            newStatus: z.enum(["answered", "withdrawn", "deferred"]),
            oldBlocking: z.boolean(),
            newBlocking: z.boolean(),
            rationale: text,
            evidenceIds: z.array(id)
        })
    }),
    z.object({
        ...factBase,
        kind: z.literal("dispose_issue"),
        payload: z.object({
            kind: z.literal("issue_disposition"),
            issueId: id,
            oldStatus: z.enum(["open", "deferred"]),
            newStatus: z.enum(["resolved", "deferred", "out_of_scope"]),
            oldBlocking: z.boolean(),
            newBlocking: z.boolean(),
            rationale: text,
            evidenceIds: z.array(id)
        })
    })
]);
export const UnclosedContributionViewSchema = z.object({
    contributionId: id,
    contributorIdentityId: id,
    agendaId: id,
    status: ContributionViewSchema.shape.status,
    exitReason: text.optional()
});
export const ArchiveMaterialViewSchema = z.object({
    id,
    kind: z.enum([
        "published_evidence",
        "formal_message",
        "accepted_decision",
        "active_completion_fact"
    ]),
    title: text,
    sourceObjectIds: z.array(id)
});
const continuationReviewDimension = z.object({
    score: dimension.shape.score,
    reason: text,
    scope: text
});
const continuationReview = z.object({
    scope: text,
    dimensions: z.object({
        source: continuationReviewDimension,
        credibility: continuationReviewDimension,
        completeness: continuationReviewDimension,
        support: continuationReviewDimension
    }),
    createdAt: epoch
});
export const ContinuationMaterialViewSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("published_evidence"),
        sourceArchiveId: id,
        sourceMaterialId: id,
        title: text,
        evidence: z.object({ version: EvidenceVersionViewSchema, review: continuationReview })
    }),
    z.object({
        kind: z.literal("formal_message"),
        sourceArchiveId: id,
        sourceMaterialId: id,
        title: text,
        message: z.object({ kind: text, body: text, createdAt: epoch })
    }),
    z.object({
        kind: z.literal("accepted_decision"),
        sourceArchiveId: id,
        sourceMaterialId: id,
        title: text,
        decision: z.object({
            outcome: z.enum(["adopt", "reject", "defer"]),
            rationale: text,
            createdAt: epoch
        })
    }),
    z.object({
        kind: z.literal("active_completion_fact"),
        sourceArchiveId: id,
        sourceMaterialId: id,
        title: text,
        completionFact: z.object({ statement: text, rationale: text, createdAt: epoch })
    })
]);
export const ContinuationProvenanceViewSchema = z.object({
    sourceArchiveId: id,
    selectedMaterialIds: z.array(id),
    materials: z.array(ContinuationMaterialViewSchema)
});
export const ManagerPlanViewSchema = z.object({
    id,
    agendaId: id,
    managerId: id,
    basedOnPublicationId: id.optional(),
    roundGoal: z.object({ question: text, evidenceGap: text, expectedOutput: text }).optional(),
    kind: z.enum([
        "open_round",
        "continue_agenda",
        "stop_agenda",
        "raise_agenda_candidate",
        "wait_for_required_identity"
    ]),
    rationale: text,
    blockingReason: text.optional(),
    status: z.enum(["active", "superseded", "completed"]),
    createdAt: epoch
});
export const TaskViewSchema = z.object({
    id,
    assigneeId: id,
    agendaId: id.optional(),
    title: text,
    status: z.enum(["open", "claimed", "completed", "cancelled", "expired"]),
    authorizationId: id,
    authorizationStatus: z.enum(["active", "revoked", "expired"]),
    attempt: z.number().int().nonnegative(),
    reassignedFromTaskId: id.optional(),
    deadlineAt: epoch.optional(),
    result: text.optional(),
    exitReason: text.optional(),
    startedAt: epoch.optional(),
    completedAt: epoch.optional()
});
export const PrivateMailViewSchema = z.object({
    id,
    senderId: id,
    recipientId: id,
    agendaId: id.optional(),
    body: text,
    relatedIds: z.array(id),
    sendContextPublicationUpperBound: z.array(id),
    processingContextPublicationUpperBound: z.array(id).optional(),
    status: z.enum(["queued", "processing", "completed", "timed_out", "cancelled"]),
    deadlineAt: epoch,
    createdAt: epoch,
    processingStartedAt: epoch.optional(),
    completedAt: epoch.optional(),
    failureReason: text.optional()
});

export const ArchiveViewSchema = z
    .object({
        id,
        status: z.enum(["pending", "complete", "failed"]),
        createdAt: epoch,
        publicSnapshotVersion: z.number().int().nonnegative(),
        terminationId: id,
        objective: ObjectiveViewSchema,
        agenda: z.array(AgendaViewSchema),
        agendaCandidates: z.array(AgendaCandidateViewSchema),
        publications: z.array(PublicationViewSchema),
        messages: z.array(FormalMessageViewSchema),
        evidenceBundles: z.array(
            z.object({
                packageId: id,
                authorIdentityId: id,
                agendaId: id,
                version: EvidenceVersionViewSchema,
                review: EvidenceReviewViewSchema
            })
        ),
        proposalRevisions: z.array(ProposalRevisionViewSchema),
        positions: z.array(PositionViewSchema),
        decisionCandidates: z.array(DecisionCandidateViewSchema),
        decisions: z.array(DecisionViewSchema),
        completionFacts: z.array(CompletionFactViewSchema),
        questions: z.array(QuestionViewSchema),
        issues: z.array(IssueViewSchema),
        riskDispositions: z.array(RiskDispositionViewSchema),
        questionIssueDispositionFacts: z.array(CommittedFactViewSchema),
        termination: TerminationViewSchema,
        unresolvedItemIds: z.array(id),
        unclosedContributions: z.array(UnclosedContributionViewSchema),
        identityProvenance: z.array(
            z.object({
                identityId: id,
                displayName: text,
                roles: z.array(role),
                definitionId: id.optional(),
                definitionHash: text.optional()
            })
        ),
        controlActorProvenance: z
            .array(z.object({ actorId: id, kind: z.literal("captain") }))
            .length(1),
        exportMaterials: z.array(ArchiveMaterialViewSchema)
    })
    .superRefine((value, ctx) => {
        if (value.terminationId !== value.termination.id) {
            ctx.addIssue({ code: "custom", path: ["terminationId"] });
        }
        const actual = value.unclosedContributions.map(({ contributionId }) => contributionId);
        if (JSON.stringify(actual) !== JSON.stringify(value.termination.unclosedContributionIds)) {
            ctx.addIssue({ code: "custom", path: ["unclosedContributions"] });
        }
    });

export const IdentityViewSchema = z.object({ id, displayName: text, roles: z.array(role) });
export const IdentityRecommendationViewSchema = z.object({
    id,
    candidateId: id,
    agendaId: id,
    decision: z.enum(["admit", "reject"]),
    status: z.enum(["provisioning", "rejected", "active", "failed"]),
    rationale: text,
    createdAt: epoch,
    identityId: id.optional(),
    failureCode: RoleErrorCodeSchema.optional()
});
export const ManagerCatalogViewSchema = z.object({
    catalogId: id,
    catalogVersion: text,
    candidates: z.array(
        z.object({
            candidateId: id,
            definitionId: id,
            displayName: text,
            availability: z.enum(["available", "unavailable"]),
            meetingRoles: z.array(role),
            responsibilitySummary: text,
            capabilitySummary: z.array(
                z.object({ kind: z.enum(["preset", "skill", "tool", "mcp"]), label: text })
            ),
            suitability: z.array(z.object({ scope: text, rationale: text }))
        })
    )
});
export const AllowedControlSchema = z.enum([
    "activate_agenda",
    "dispose_agenda_candidate",
    "resolve_question",
    "dispose_issue",
    "abort_round",
    "decide",
    "change_decision",
    "dispose_risk",
    "record_completion_fact",
    "change_completion_fact",
    "create_meeting",
    "submit_manager_plan",
    "open_round",
    "raise_hand",
    "decline_hand",
    "dispose_hand_raise",
    "submit_evidence",
    "close_contribution",
    "submit_evidence_review",
    "record_review_delivery",
    "publish_round",
    "pause_meeting",
    "resume_meeting",
    "end_meeting",
    "start_archive",
    "record_archive_session_result",
    "recommend_identity",
    "record_identity_admission_result"
]);

export const MeetingSummarySchema = z.object({
    meetingId: id,
    version: z.number().int().nonnegative(),
    objective: text,
    lifecycle,
    activeAgenda: z.object({ id, title: text }).optional(),
    updatedAt: epoch,
    unavailableReason: text.optional()
});
export const MeetingViewSchema = z.object({
    timelineEvents: z.array(MeetingEventViewSchema).optional(),
    agendaCandidates: z.array(AgendaCandidateViewSchema),
    meetingId: id,
    version: z.number().int().nonnegative(),
    objective: ObjectiveViewSchema,
    lifecycle: LifecycleViewSchema,
    continuation: ContinuationProvenanceViewSchema.optional(),
    identities: z.array(IdentityViewSchema),
    identityRecommendations: z.array(IdentityRecommendationViewSchema).optional(),
    managerCatalog: ManagerCatalogViewSchema.optional(),
    agenda: z.array(AgendaViewSchema),
    opportunityRequests: z.array(EvidenceOpportunityRequestViewSchema),
    rounds: z.array(RoundViewSchema),
    publications: z.array(PublicationViewSchema),
    evidencePackages: z.array(EvidencePackageViewSchema),
    evidenceValidationStatuses: z.array(EvidenceValidationStatusViewSchema),
    evidenceReviews: z.array(EvidenceReviewViewSchema),
    reviewDeliveries: z.array(ReviewDeliveryViewSchema),
    messages: z.array(FormalMessageViewSchema),
    questions: z.array(QuestionViewSchema),
    issues: z.array(IssueViewSchema),
    outcomes: OutcomeViewSchema,
    archive: ArchiveViewSchema.optional(),
    managerPlans: z.array(ManagerPlanViewSchema),
    tasks: z.array(TaskViewSchema),
    privateMail: z.array(PrivateMailViewSchema),
    controls: z.array(AllowedControlSchema)
});
export const MeetingListResultSchema = z.object({ meetings: z.array(MeetingSummarySchema) });
export const MeetingReadResultSchema = MeetingViewSchema;
export const RefreshNoticeSchema = z.object({
    kind: z.literal("refresh"),
    meetingId: id,
    committedVersion: z.number().int().nonnegative()
});

export type ObjectiveView = z.infer<typeof ObjectiveViewSchema>;
export type LifecycleView = z.infer<typeof LifecycleViewSchema>;
export type AgendaView = z.infer<typeof AgendaViewSchema>;
export type AgendaCandidateView = z.infer<typeof AgendaCandidateViewSchema>;
export type EvidenceOpportunityRequestView = z.infer<typeof EvidenceOpportunityRequestViewSchema>;
export type PendingHandRaiseView = z.infer<typeof PendingHandRaiseViewSchema>;
export type ContributionView = z.infer<typeof ContributionViewSchema>;
export type RoundView = z.infer<typeof RoundViewSchema>;
export type PublicationView = z.infer<typeof PublicationViewSchema>;
export type EvidenceVersionView = z.infer<typeof EvidenceVersionViewSchema>;
export type EvidencePackageView = z.infer<typeof EvidencePackageViewSchema>;
export type EvidenceReviewView = z.infer<typeof EvidenceReviewViewSchema>;
export type ReviewDeliveryView = z.infer<typeof ReviewDeliveryViewSchema>;
export type FormalMessageView = z.infer<typeof FormalMessageViewSchema>;
export type ProposalRevisionView = z.infer<typeof ProposalRevisionViewSchema>;
export type PositionView = z.infer<typeof PositionViewSchema>;
export type DecisionCandidateView = z.infer<typeof DecisionCandidateViewSchema>;
export type DecisionView = z.infer<typeof DecisionViewSchema>;
export type QuestionView = z.infer<typeof QuestionViewSchema>;
export type IssueView = z.infer<typeof IssueViewSchema>;
export type CompletionFactView = z.infer<typeof CompletionFactViewSchema>;
export type RiskDispositionView = z.infer<typeof RiskDispositionViewSchema>;
export type TerminationView = z.infer<typeof TerminationViewSchema>;
export type OutcomeView = z.infer<typeof OutcomeViewSchema>;
export type CommittedFactView = z.infer<typeof CommittedFactViewSchema>;
export type UnclosedContributionView = z.infer<typeof UnclosedContributionViewSchema>;
export type ArchiveMaterialView = z.infer<typeof ArchiveMaterialViewSchema>;
export type ContinuationMaterialView = z.infer<typeof ContinuationMaterialViewSchema>;
export type ContinuationProvenanceView = z.infer<typeof ContinuationProvenanceViewSchema>;
export type ManagerPlanView = z.infer<typeof ManagerPlanViewSchema>;
export type TaskView = z.infer<typeof TaskViewSchema>;
export type PrivateMailView = z.infer<typeof PrivateMailViewSchema>;
export type IdentityView = z.infer<typeof IdentityViewSchema>;
export type IdentityRecommendationView = z.infer<typeof IdentityRecommendationViewSchema>;
export type ManagerCatalogView = z.infer<typeof ManagerCatalogViewSchema>;
export type AllowedControl = z.infer<typeof AllowedControlSchema>;
export type ArchiveView = z.infer<typeof ArchiveViewSchema>;
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;
export type MeetingView = z.infer<typeof MeetingViewSchema>;
export type MeetingListResult = z.infer<typeof MeetingListResultSchema>;
export type MeetingReadResult = z.infer<typeof MeetingReadResultSchema>;
export type RefreshNotice = z.infer<typeof RefreshNoticeSchema>;
