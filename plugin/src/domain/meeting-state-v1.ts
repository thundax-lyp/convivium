/**
 * Target Meeting aggregate.  It is intentionally independent from the legacy
 * Turn/SpeakerAttempt model: no target object may contain a legacy object.
 */

export type EpochMs = number;
export type OpaqueId = string;

export type RiskLevel = "low" | "medium" | "high";
export type MeetingRole = "captain" | "manager" | "contributor" | "evidence_reviewer";
export type MeetingLifecycleStatus =
    | "preparing"
    | "running"
    | "paused"
    | "converging"
    | "ending"
    | "terminal"
    | "archiving"
    | "archived";

export interface MeetingLifecycleV1 {
    status: MeetingLifecycleStatus;
    changedAt: EpochMs;
    changedBy: OpaqueId;
    reason?: string;
}

export interface ObjectiveTargetV1 {
    id: OpaqueId;
    text: string;
    status: "pending" | "satisfied" | "unsatisfied";
}

export interface HardConstraintV1 {
    id: OpaqueId;
    text: string;
    status: "pending" | "satisfied" | "violated";
}

export interface ObjectiveContractV1 {
    statement: string;
    requiredOutputs: readonly ObjectiveTargetV1[];
    acceptanceCriteria: readonly ObjectiveTargetV1[];
    hardConstraints: readonly HardConstraintV1[];
    acceptableRiskLevel: RiskLevel;
}

export interface MeetingIdentityV1 {
    id: OpaqueId;
    displayName: string;
    roles: readonly MeetingRole[];
    agendaResponsibilityIds: readonly OpaqueId[];
    /** @deprecated legacy compatibility; rejected by canonical validator */
    reviewResponsibilityIds: readonly OpaqueId[];
    riskAuthority: boolean;
    required: boolean;
    definitionId?: OpaqueId;
    definitionVersion?: string;
    definitionHash?: string;
    sessionOwnershipId?: string;
}

export interface IdentityRecommendationCoreV1 {
    id: string;
    candidateId: string;
    definitionId: string;
    definitionVersion: string;
    catalogId: string;
    catalogVersion: string;
    agendaId: string;
    managerId: string;
    rationale: string;
    expectedContribution: string;
    evidenceGap: string;
    createdAt: number;
}
export type IdentityRecommendationV1 = IdentityRecommendationCoreV1 &
    (
        | {
              decision: "reject";
              status: "rejected";
              resolvedAt: number;
              identityId?: never;
              childSessionId?: never;
              definitionHash?: never;
              failureCode?: never;
          }
        | {
              decision: "admit";
              status: "provisioning" | "active" | "failed";
              identityId: string;
              childSessionId: string;
              definitionHash: string;
              resolvedAt?: number;
              failureCode?: string;
          }
    );

export interface AgendaItemV1 {
    id: OpaqueId;
    title: string;
    question: string;
    status: "pending" | "active" | "blocked" | "completed" | "deferred" | "closed";
    requiredOutputIds: readonly OpaqueId[];
    /** @deprecated legacy compatibility; rejected by canonical validator */
    requiredReviewerIds: readonly OpaqueId[];
    ownerId?: OpaqueId;
}

export interface AgendaCandidateV1 {
    id: OpaqueId;
    title: string;
    reason: string;
    sourceMessageId?: OpaqueId;
    status: "pending" | "promoted" | "parked" | "rejected";
}

export interface QuestionV1 {
    id: OpaqueId;
    actorId: OpaqueId;
    agendaId: OpaqueId;
    text: string;
    affectedOutputIds: readonly OpaqueId[];
    affectedCriterionIds: readonly OpaqueId[];
    affectedConstraintIds: readonly OpaqueId[];
    blocking: boolean;
    status: "open" | "answered" | "withdrawn" | "deferred";
}

export interface IssueV1 {
    id: OpaqueId;
    actorId: OpaqueId;
    agendaId: OpaqueId;
    description: string;
    riskLevel: RiskLevel;
    classification:
        "blocking" | "follow_up" | "pending_discussion" | "accepted_risk" | "out_of_scope";
    affectedOutputIds: readonly OpaqueId[];
    affectedCriterionIds: readonly OpaqueId[];
    affectedConstraintIds: readonly OpaqueId[];
    requiresEvidenceReview?: boolean;
    /** @deprecated legacy compatibility; rejected by canonical validator */
    requiredReviewerIds: readonly OpaqueId[];
    blocking: boolean;
    status: "open" | "resolved" | "deferred" | "out_of_scope";
    rationale: string;
}

export interface RoundV1 {
    id: OpaqueId;
    agendaId: OpaqueId;
    publicBaselinePublicationIds: readonly OpaqueId[];
    openedAt: EpochMs;
    status: "open" | "published" | "aborted";
    contributionIds: readonly OpaqueId[];
    deadlineAt?: EpochMs;
    publicationId?: OpaqueId;
    abortReason?: string;
    abortedAt?: EpochMs;
}

export interface HandRaiseV1 {
    raisedAt: EpochMs;
    purpose: string;
}

export interface SupplementHandV1 extends HandRaiseV1 {
    status: "pending" | "accepted";
    acceptedAt?: EpochMs;
}

export interface EvidenceOpportunityRequestV1 {
    id: OpaqueId;
    agendaId: OpaqueId;
    contributorId: OpaqueId;
    purpose: string;
    requestedAt: EpochMs;
}

export interface PendingHandRaiseV1 {
    roundId: OpaqueId;
    contributorId: OpaqueId;
    purpose: string;
    raisedAt: EpochMs;
}

export interface ContributionV1 {
    id: OpaqueId;
    roundId: OpaqueId;
    contributorId: OpaqueId;
    handRaise: HandRaiseV1;
    acceptedAt: EpochMs;
    status:
        | "preparing"
        | "aborted"
        | "format_correction"
        | "registered"
        | "under_review"
        | "awaiting_response"
        | "withdrawn"
        | "submission_missing"
        | "timed_out"
        | "supplement_rejected"
        | "closed";
    packageId?: OpaqueId;
    substantiveSupplementCount: number;
    supplementHand?: SupplementHandV1;
    exitReason?: string;
    response?: string;
}

export interface FormatApprovalV1 {
    id: OpaqueId;
    contributionId: OpaqueId;
    managerId: OpaqueId;
    evidenceHash: string;
    approvedAt: EpochMs;
}

export interface TextWithReasonV1 {
    value: string;
    reason?: string;
}

export interface EvidenceClaimV1 {
    id: OpaqueId;
    statement: string;
    materialIds: readonly OpaqueId[];
    qualification: string;
}

export interface EvidenceMaterialV1 {
    id: OpaqueId;
    kind:
        | "document"
        | "dataset"
        | "experiment"
        | "observation"
        | "tool_output"
        | "unknown"
        | "not_applicable";
    originator: string;
    originalSource: string;
    sourcePublishedAt: string;
    acquiredAt: string;
    version: string;
    locator: string;
    location: string;
    verificationConditions: string;
    limitations: string;
    sharedDependencies: readonly string[];
    reason?: string;
}

export interface EvidenceVersionV1 {
    id: OpaqueId;
    ordinal: number;
    observation: string;
    interpretation: string;
    method: string;
    falsifiers: readonly TextWithReasonV1[];
    uncertainties: readonly TextWithReasonV1[];
    limitations: readonly TextWithReasonV1[];
    claims: readonly EvidenceClaimV1[];
    materials: readonly EvidenceMaterialV1[];
    submittedAt: EpochMs;
}

export interface EvidencePackageV1 {
    id: OpaqueId;
    roundId: OpaqueId;
    contributionId: OpaqueId;
    authorId: OpaqueId;
    agendaId: OpaqueId;
    currentVersionId: OpaqueId;
    versions: readonly EvidenceVersionV1[];
}

export interface RegistrationV1 {
    id: OpaqueId;
    versionId: OpaqueId;
    managerId: OpaqueId;
    status: "complete";
    missingFields: readonly string[];
    createdAt: EpochMs;
}

export interface ReviewDimensionV1 {
    score: 0 | 1 | 2 | 3 | "unable_to_assess";
    reason: string;
    scope: string;
    baselineEvidenceIds: readonly OpaqueId[];
}

export interface EvidenceReviewV1 {
    id: OpaqueId;
    versionId: OpaqueId;
    reviewerId: OpaqueId;
    baselinePublicationIds: readonly OpaqueId[];
    scope: string;
    dimensions: Readonly<{
        source: ReviewDimensionV1;
        credibility: ReviewDimensionV1;
        completeness: ReviewDimensionV1;
        support: ReviewDimensionV1;
    }>;
    createdAt: EpochMs;
}

export interface ReviewDeliveryV1 {
    id: OpaqueId;
    reviewId: OpaqueId;
    authorId: OpaqueId;
    status: "sent" | "failed";
    sentAt?: EpochMs;
    failedAt?: EpochMs;
    failureReason?: string;
}

export interface PublicationV1 {
    id: OpaqueId;
    roundId: OpaqueId;
    seq: number;
    finalVersionIds: readonly OpaqueId[];
    finalReviewIds: readonly OpaqueId[];
    publishedAt: EpochMs;
    exitReasons: readonly string[];
}

export interface FormalMessageV1 {
    id: OpaqueId;
    seq: number;
    actorId: OpaqueId;
    agendaId: OpaqueId;
    kind: string;
    body: string;
    publicationId: OpaqueId;
    relatedIds: readonly OpaqueId[];
    createdAt: EpochMs;
}

export interface ProposalRevisionV1 {
    id: OpaqueId;
    proposalId: OpaqueId;
    ordinal: number;
    actorId: OpaqueId;
    agendaId: OpaqueId;
    summary: string;
    body: string;
    evidenceIds: readonly OpaqueId[];
    supersedesRevisionId?: OpaqueId;
    createdAt: EpochMs;
}

export interface PositionV1 {
    id: OpaqueId;
    proposalRevisionId: OpaqueId;
    actorId: OpaqueId;
    stance: "support" | "oppose" | "abstain" | "conditional";
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    createdAt: EpochMs;
}

export interface DecisionCandidateV1 {
    id: OpaqueId;
    proposalRevisionId: OpaqueId;
    actorId: OpaqueId;
    outcome: "adopt" | "reject" | "defer";
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    positionIds: readonly OpaqueId[];
    createdAt: EpochMs;
}

export interface DecisionV1 extends DecisionCandidateV1 {
    candidateId: OpaqueId;
    status: "accepted" | "superseded" | "revoked";
    replacesDecisionId?: OpaqueId;
}

export interface RiskDispositionV1 {
    id: OpaqueId;
    issueId: OpaqueId;
    actorId: OpaqueId;
    action: "accept" | "reject";
    scope: string;
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    createdAt: EpochMs;
}

export interface CompletionDeclarationV1 {
    id: OpaqueId;
    actorId: OpaqueId;
    outputId: OpaqueId;
    criterionId?: OpaqueId;
    statement: string;
    evidenceIds: readonly OpaqueId[];
    taskId?: OpaqueId;
    createdAt: EpochMs;
}

export interface CompletionFactV1 {
    id: OpaqueId;
    outputId: OpaqueId;
    criterionId?: OpaqueId;
    actorId: OpaqueId;
    status: "active" | "superseded" | "revoked";
    statement: string;
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    decisionIds: readonly OpaqueId[];
    supersedesFactId?: OpaqueId;
    createdAt: EpochMs;
}

export interface MeetingTaskV1 {
    id: OpaqueId;
    createdBy: OpaqueId;
    assigneeId: OpaqueId;
    agendaId?: OpaqueId;
    title: string;
    instructions: string;
    contextPublicationUpperBound: readonly OpaqueId[];
    status: "open" | "claimed" | "completed" | "cancelled" | "expired";
    deadlineAt?: EpochMs;
    result?: string;
    exitReason?: string;
    createdAt: EpochMs;
    updatedAt: EpochMs;
    authorizationId: OpaqueId;
    authorizationStatus: "active" | "revoked" | "expired";
    attempt: number;
    reassignedFromTaskId?: OpaqueId;
    startedAt?: EpochMs;
    completedAt?: EpochMs;
}

export interface ManagerPlanV1 {
    id: OpaqueId;
    agendaId: OpaqueId;
    managerId: OpaqueId;
    basedOnPublicationId?: OpaqueId;
    kind:
        | "open_round"
        | "continue_agenda"
        | "stop_agenda"
        | "raise_agenda_candidate"
        | "wait_for_required_identity";
    rationale: string;
    blockingReason?: string;
    createdAt: EpochMs;
    status: "active" | "superseded" | "completed";
}

export interface PrivateMailV1 {
    id: OpaqueId;
    senderId: OpaqueId;
    recipientId: OpaqueId;
    agendaId?: OpaqueId;
    body: string;
    relatedIds: readonly OpaqueId[];
    sendContextPublicationUpperBound: readonly OpaqueId[];
    processingContextPublicationUpperBound?: readonly OpaqueId[];
    status: "queued" | "processing" | "completed" | "timed_out" | "cancelled";
    deadlineAt: EpochMs;
    createdAt: EpochMs;
    processingStartedAt?: EpochMs;
    completedAt?: EpochMs;
    failureReason?: string;
}

export interface TerminationV1 {
    id: OpaqueId;
    outcome: "completed" | "partial" | "no_consensus" | "cancelled" | "failed";
    reason: string;
    endedAt: EpochMs;
    decisionIds: readonly OpaqueId[];
    completionFactIds: readonly OpaqueId[];
    unresolvedQuestionIds: readonly OpaqueId[];
    unresolvedIssueIds: readonly OpaqueId[];
    unclosedContributionIds: readonly OpaqueId[];
}

export type TargetDomainFactPayloadV1 =
    | { kind: "references"; relatedIds: readonly OpaqueId[] }
    | {
          kind: "question_disposition";
          questionId: OpaqueId;
          oldStatus: "open" | "deferred";
          newStatus: "answered" | "withdrawn" | "deferred";
          oldBlocking: boolean;
          newBlocking: boolean;
          rationale: string;
          evidenceIds: readonly OpaqueId[];
      }
    | {
          kind: "issue_disposition";
          issueId: OpaqueId;
          oldStatus: "open" | "deferred";
          newStatus: "resolved" | "deferred" | "out_of_scope";
          oldBlocking: boolean;
          newBlocking: boolean;
          rationale: string;
          evidenceIds: readonly OpaqueId[];
      };

export interface ArchiveEvidenceBundleV1 {
    packageId: OpaqueId;
    authorIdentityId: OpaqueId;
    agendaId: OpaqueId;
    version: EvidenceVersionV1;
    review: EvidenceReviewV1;
}

export interface ArchiveUnclosedContributionV1 {
    contributionId: OpaqueId;
    contributorIdentityId: OpaqueId;
    agendaId: OpaqueId;
    status: ContributionV1["status"];
    exitReason?: string;
}

export interface ArchiveIdentityProvenanceV1 {
    identityId: OpaqueId;
    displayName: string;
    roles: readonly MeetingRole[];
    definitionId?: OpaqueId;
    definitionVersion?: string;
    definitionHash?: string;
}

export interface ArchiveMaterialV1 {
    id: OpaqueId;
    kind: "published_evidence" | "formal_message" | "accepted_decision" | "active_completion_fact";
    title: string;
    sourceObjectIds: readonly OpaqueId[];
}

export type ArchiveQuestionIssueDispositionFactV1 =
    | {
          factId: OpaqueId;
          kind: "resolve_question";
          actorId: OpaqueId;
          occurredAt: EpochMs;
          relatedIds: readonly OpaqueId[];
          payload: Extract<TargetDomainFactPayloadV1, { kind: "question_disposition" }>;
      }
    | {
          factId: OpaqueId;
          kind: "dispose_issue";
          actorId: OpaqueId;
          occurredAt: EpochMs;
          relatedIds: readonly OpaqueId[];
          payload: Extract<TargetDomainFactPayloadV1, { kind: "issue_disposition" }>;
      };

export interface ArchivePackageV1 {
    id: OpaqueId;
    status: "pending" | "complete" | "failed";
    createdAt: EpochMs;
    publicSnapshotVersion: number;
    terminationId: OpaqueId;
    objective: ObjectiveContractV1;
    agenda: readonly AgendaItemV1[];
    agendaCandidates: readonly AgendaCandidateV1[];
    publications: readonly PublicationV1[];
    messages: readonly FormalMessageV1[];
    evidenceBundles: readonly ArchiveEvidenceBundleV1[];
    proposalRevisions: readonly ProposalRevisionV1[];
    positions: readonly PositionV1[];
    decisionCandidates: readonly DecisionCandidateV1[];
    decisions: readonly DecisionV1[];
    completionFacts: readonly CompletionFactV1[];
    questions: readonly QuestionV1[];
    issues: readonly IssueV1[];
    riskDispositions: readonly RiskDispositionV1[];
    questionIssueDispositionFacts: readonly ArchiveQuestionIssueDispositionFactV1[];
    termination: TerminationV1;
    unresolvedQuestionIds: readonly OpaqueId[];
    unresolvedIssueIds: readonly OpaqueId[];
    unresolvedItemIds: readonly OpaqueId[];
    unclosedContributions: readonly ArchiveUnclosedContributionV1[];
    identityProvenance: readonly ArchiveIdentityProvenanceV1[];
    exportMaterials: readonly ArchiveMaterialV1[];
}

export interface ContinuationProvenanceV1 {
    sourceArchiveId: OpaqueId;
    selectedMaterialIds: readonly OpaqueId[];
    importedAt: EpochMs;
    importedBy: OpaqueId;
}

export interface MeetingLimitsV1 {
    maxFormalMessages: number;
    maxDurationMs: number;
    taskDeadlineMs: number;
    reviewDeadlineMs: number;
    responseDeadlineMs: 60000;
}

export interface MeetingState {
    id: OpaqueId;
    version: number;
    createdAt: EpochMs;
    updatedAt: EpochMs;
    continuation?: ContinuationProvenanceV1;
    objective: ObjectiveContractV1;
    lifecycle: MeetingLifecycleV1;
    identities: readonly MeetingIdentityV1[];
    identityRecommendations: readonly IdentityRecommendationV1[];
    agenda: readonly AgendaItemV1[];
    agendaCandidates: readonly AgendaCandidateV1[];
    rounds: readonly RoundV1[];
    opportunityRequests: readonly EvidenceOpportunityRequestV1[];
    pendingHandRaises: readonly PendingHandRaiseV1[];
    contributions: readonly ContributionV1[];
    evidenceReviewerId: OpaqueId;
    /** @deprecated legacy compatibility; rejected by canonical validator */
    formatApprovals: readonly FormatApprovalV1[];
    completionDeclarations: readonly CompletionDeclarationV1[];
    evidencePackages: readonly EvidencePackageV1[];
    registrations: readonly RegistrationV1[];
    reviews: readonly EvidenceReviewV1[];
    reviewDeliveries: readonly ReviewDeliveryV1[];
    publications: readonly PublicationV1[];
    messages: readonly FormalMessageV1[];
    proposals: readonly ProposalRevisionV1[];
    positions: readonly PositionV1[];
    decisionCandidates: readonly DecisionCandidateV1[];
    decisions: readonly DecisionV1[];
    questions: readonly QuestionV1[];
    issues: readonly IssueV1[];
    riskDispositions: readonly RiskDispositionV1[];
    tasks: readonly MeetingTaskV1[];
    managerPlans: readonly ManagerPlanV1[];
    privateMails: readonly PrivateMailV1[];
    completionFacts: readonly CompletionFactV1[];
    limits: MeetingLimitsV1;
    termination?: TerminationV1;
    archive?: ArchivePackageV1;
}
