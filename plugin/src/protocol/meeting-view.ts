import { z } from "zod";
import { RoleErrorCodeV1Schema } from "./meeting-identity.js";

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
const risk = z.enum(["low", "medium", "high"]);
const target = z.object({
    id,
    text,
    status: z.enum(["pending", "satisfied", "unsatisfied"])
});

export const ObjectiveViewV1Schema = z.object({
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
export const PendingHandRaiseViewV1Schema = z.object({
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
        "timed_out",
        "supplement_rejected",
        "aborted",
        "closed"
    ]),
    packageId: id.optional(),
    substantiveSupplementCount: z.number().int().nonnegative(),
    exitReason: text.optional()
});
export const RoundViewV1Schema = z.object({
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
    pendingHandRaises: z.array(PendingHandRaiseViewV1Schema),
    contributions: z.array(ContributionViewSchema)
});
export const PublicationViewV1Schema = z.object({
    id,
    roundId: id,
    seq: z.number().int().positive(),
    finalVersionIds: z.array(id),
    finalReviewIds: z.array(id),
    exitReasons: z.array(text),
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
    observation: text,
    interpretation: text,
    method: text,
    falsifiers: z.array(textWithReason),
    uncertainties: z.array(textWithReason),
    limitations: z.array(textWithReason),
    claims: z.array(evidenceClaim),
    materials: z.array(material),
    submittedAt: epoch
});
export const EvidencePackageViewSchema = z.object({
    id,
    roundId: id,
    contributionId: id,
    authorId: id,
    agendaId: id,
    currentVersion: EvidenceVersionViewSchema
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
export const ReviewDeliveryViewV1Schema = z
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
        if (!valid) ctx.addIssue({ code: "custom", path: ["status"] });
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
export const ProposalRevisionViewV1Schema = z.object({
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
export const PositionViewV1Schema = z.object({
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
export const QuestionViewV1Schema = z.object({
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
export const RiskDispositionViewV1Schema = z.object({
    id,
    actorId: id,
    issueId: id,
    action: z.enum(["accept", "reject"]),
    scope: text,
    rationale: text,
    evidenceIds: z.array(id),
    createdAt: epoch
});
export const TerminationViewV1Schema = z.object({
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
export const OutcomeViewV1Schema = z.object({
    decisions: z.array(DecisionViewSchema),
    completionFacts: z.array(CompletionFactViewSchema),
    riskDispositions: z.array(RiskDispositionViewV1Schema),
    pendingDecisionCandidates: z.array(DecisionCandidateViewSchema).optional(),
    termination: TerminationViewV1Schema.optional()
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
export const UnclosedContributionViewV1Schema = z.object({
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
export const TaskViewV1Schema = z.object({
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
export const PrivateMailViewV1Schema = z.object({
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
        objective: ObjectiveViewV1Schema,
        agenda: z.array(AgendaViewSchema),
        agendaCandidates: z.array(AgendaCandidateViewSchema),
        publications: z.array(PublicationViewV1Schema),
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
        proposalRevisions: z.array(ProposalRevisionViewV1Schema),
        positions: z.array(PositionViewV1Schema),
        decisionCandidates: z.array(DecisionCandidateViewSchema),
        decisions: z.array(DecisionViewSchema),
        completionFacts: z.array(CompletionFactViewSchema),
        questions: z.array(QuestionViewV1Schema),
        issues: z.array(IssueViewSchema),
        riskDispositions: z.array(RiskDispositionViewV1Schema),
        questionIssueDispositionFacts: z.array(CommittedFactViewSchema),
        termination: TerminationViewV1Schema,
        unresolvedItemIds: z.array(id),
        unclosedContributions: z.array(UnclosedContributionViewV1Schema),
        identityProvenance: z.array(
            z.object({
                identityId: id,
                displayName: text,
                roles: z.array(role),
                definitionId: id.optional(),
                definitionVersion: text.optional(),
                definitionHash: text.optional()
            })
        ),
        exportMaterials: z.array(ArchiveMaterialViewSchema)
    })
    .superRefine((value, ctx) => {
        if (value.terminationId !== value.termination.id)
            ctx.addIssue({ code: "custom", path: ["terminationId"] });
        const actual = value.unclosedContributions.map(({ contributionId }) => contributionId);
        if (JSON.stringify(actual) !== JSON.stringify(value.termination.unclosedContributionIds))
            ctx.addIssue({ code: "custom", path: ["unclosedContributions"] });
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
    failureCode: RoleErrorCodeV1Schema.optional()
});
export const ManagerCatalogViewSchema = z.object({
    catalogId: id,
    catalogVersion: text,
    candidates: z.array(
        z.object({
            candidateId: id,
            definitionId: id,
            definitionVersion: text,
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
    "create_meeting",
    "submit_manager_plan",
    "open_round",
    "raise_hand",
    "dispose_hand_raise",
    "submit_evidence",
    "close_contribution",
    "submit_review_batch",
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
    meetingId: id,
    version: z.number().int().nonnegative(),
    objective: ObjectiveViewV1Schema,
    lifecycle: LifecycleViewSchema,
    continuation: ContinuationProvenanceViewSchema.optional(),
    identities: z.array(IdentityViewSchema),
    identityRecommendations: z.array(IdentityRecommendationViewSchema).optional(),
    managerCatalog: ManagerCatalogViewSchema.optional(),
    agenda: z.array(AgendaViewSchema),
    opportunityRequests: z.array(EvidenceOpportunityRequestViewSchema),
    rounds: z.array(RoundViewV1Schema),
    publications: z.array(PublicationViewV1Schema),
    evidencePackages: z.array(EvidencePackageViewSchema),
    evidenceReviews: z.array(EvidenceReviewViewSchema),
    reviewDeliveries: z.array(ReviewDeliveryViewV1Schema),
    messages: z.array(FormalMessageViewSchema),
    questions: z.array(QuestionViewV1Schema),
    issues: z.array(IssueViewSchema),
    outcomes: OutcomeViewV1Schema,
    archive: ArchiveViewSchema.optional(),
    managerPlans: z.array(ManagerPlanViewSchema),
    tasks: z.array(TaskViewV1Schema),
    privateMail: z.array(PrivateMailViewV1Schema),
    controls: z.array(AllowedControlSchema)
});
export const MeetingListResultSchema = z.object({ meetings: z.array(MeetingSummarySchema) });
export const MeetingReadResultSchema = MeetingViewSchema;
export const RefreshNoticeV1Schema = z.object({
    kind: z.literal("refresh"),
    meetingId: id,
    committedVersion: z.number().int().nonnegative()
});

export type ObjectiveViewV1 = z.infer<typeof ObjectiveViewV1Schema>;
export type LifecycleView = z.infer<typeof LifecycleViewSchema>;
export type AgendaView = z.infer<typeof AgendaViewSchema>;
export type AgendaCandidateView = z.infer<typeof AgendaCandidateViewSchema>;
export type EvidenceOpportunityRequestView = z.infer<typeof EvidenceOpportunityRequestViewSchema>;
export type PendingHandRaiseViewV1 = z.infer<typeof PendingHandRaiseViewV1Schema>;
export type ContributionView = z.infer<typeof ContributionViewSchema>;
export type RoundViewV1 = z.infer<typeof RoundViewV1Schema>;
export type PublicationViewV1 = z.infer<typeof PublicationViewV1Schema>;
export type EvidenceVersionView = z.infer<typeof EvidenceVersionViewSchema>;
export type EvidencePackageView = z.infer<typeof EvidencePackageViewSchema>;
export type EvidenceReviewView = z.infer<typeof EvidenceReviewViewSchema>;
export type ReviewDeliveryViewV1 = z.infer<typeof ReviewDeliveryViewV1Schema>;
export type FormalMessageView = z.infer<typeof FormalMessageViewSchema>;
export type ProposalRevisionViewV1 = z.infer<typeof ProposalRevisionViewV1Schema>;
export type PositionViewV1 = z.infer<typeof PositionViewV1Schema>;
export type DecisionCandidateView = z.infer<typeof DecisionCandidateViewSchema>;
export type DecisionView = z.infer<typeof DecisionViewSchema>;
export type QuestionViewV1 = z.infer<typeof QuestionViewV1Schema>;
export type IssueView = z.infer<typeof IssueViewSchema>;
export type CompletionFactView = z.infer<typeof CompletionFactViewSchema>;
export type RiskDispositionViewV1 = z.infer<typeof RiskDispositionViewV1Schema>;
export type TerminationViewV1 = z.infer<typeof TerminationViewV1Schema>;
export type OutcomeViewV1 = z.infer<typeof OutcomeViewV1Schema>;
export type CommittedFactView = z.infer<typeof CommittedFactViewSchema>;
export type UnclosedContributionViewV1 = z.infer<typeof UnclosedContributionViewV1Schema>;
export type ArchiveMaterialView = z.infer<typeof ArchiveMaterialViewSchema>;
export type ContinuationMaterialView = z.infer<typeof ContinuationMaterialViewSchema>;
export type ContinuationProvenanceView = z.infer<typeof ContinuationProvenanceViewSchema>;
export type ManagerPlanView = z.infer<typeof ManagerPlanViewSchema>;
export type TaskViewV1 = z.infer<typeof TaskViewV1Schema>;
export type PrivateMailViewV1 = z.infer<typeof PrivateMailViewV1Schema>;
export type IdentityView = z.infer<typeof IdentityViewSchema>;
export type IdentityRecommendationView = z.infer<typeof IdentityRecommendationViewSchema>;
export type ManagerCatalogView = z.infer<typeof ManagerCatalogViewSchema>;
export type AllowedControl = z.infer<typeof AllowedControlSchema>;
export type ArchiveView = z.infer<typeof ArchiveViewSchema>;
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;
export type MeetingView = z.infer<typeof MeetingViewSchema>;
export type MeetingListResult = z.infer<typeof MeetingListResultSchema>;
export type MeetingReadResult = z.infer<typeof MeetingReadResultSchema>;
export type RefreshNoticeV1 = z.infer<typeof RefreshNoticeV1Schema>;
