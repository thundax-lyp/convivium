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

export interface MeetingLifecycle {
    status: MeetingLifecycleStatus;
    changedAt: EpochMs;
    changedBy: OpaqueId;
    reason?: string;
}

export interface ObjectiveTarget {
    id: OpaqueId;
    text: string;
    status: "pending" | "satisfied" | "unsatisfied";
}

export interface HardConstraint {
    id: OpaqueId;
    text: string;
    status: "pending" | "satisfied" | "violated";
}

export interface ObjectiveContract {
    statement: string;
    requiredOutputs: readonly ObjectiveTarget[];
    acceptanceCriteria: readonly ObjectiveTarget[];
    hardConstraints: readonly HardConstraint[];
    acceptableRiskLevel: RiskLevel;
}

export interface MeetingIdentity {
    id: OpaqueId;
    displayName: string;
    roles: readonly MeetingRole[];
    agendaResponsibilityIds: readonly OpaqueId[];
    riskAuthority: boolean;
    required: boolean;
    definitionId?: OpaqueId;
    definitionVersion?: string;
    definitionHash?: string;
    sessionOwnershipId?: string;
}

export interface IdentityRecommendationCore {
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
export type IdentityRecommendation = IdentityRecommendationCore &
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

export interface AgendaItem {
    id: OpaqueId;
    title: string;
    question: string;
    status: "pending" | "active" | "blocked" | "completed" | "deferred" | "closed";
    requiredOutputIds: readonly OpaqueId[];
    ownerId?: OpaqueId;
}

export interface AgendaCandidate {
    id: OpaqueId;
    title: string;
    reason: string;
    sourceMessageId?: OpaqueId;
    status: "pending" | "promoted" | "parked" | "rejected";
}

export interface Question {
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

export interface Issue {
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
    requiresEvidenceReview: boolean;
    blocking: boolean;
    status: "open" | "resolved" | "deferred" | "out_of_scope";
    rationale: string;
}

export interface Round {
    id: OpaqueId;
    agendaId: OpaqueId;
    planId: OpaqueId;
    roundGoal: RoundGoal;
    publicBaselinePublicationIds: readonly OpaqueId[];
    openedAt: EpochMs;
    status: "open" | "published" | "aborted";
    contributionIds: readonly OpaqueId[];
    deadlineAt?: EpochMs;
    publicationId?: OpaqueId;
    abortReason?: string;
    abortedAt?: EpochMs;
}

export interface RoundGoal {
    question: string;
    evidenceGap: string;
    expectedOutput: string;
}

export interface HandRaise {
    raisedAt: EpochMs;
    purpose: string;
}

export interface SupplementHand extends HandRaise {
    status: "pending" | "accepted";
    acceptedAt?: EpochMs;
}

export interface EvidenceOpportunityRequest {
    id: OpaqueId;
    agendaId: OpaqueId;
    contributorId: OpaqueId;
    purpose: string;
    requestedAt: EpochMs;
}

export interface PendingHandRaise {
    roundId: OpaqueId;
    contributorId: OpaqueId;
    purpose: string;
    raisedAt: EpochMs;
}

export interface Contribution {
    id: OpaqueId;
    roundId: OpaqueId;
    contributorId: OpaqueId;
    handRaise: HandRaise;
    acceptedAt: EpochMs;
    status:
        | "preparing"
        | "aborted"
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
    supplementHand?: SupplementHand;
    exitReason?: string;
    response?: string;
}

export interface TextWithReason {
    value: string;
    reason?: string;
}

export interface EvidenceClaim {
    id: OpaqueId;
    statement: string;
    materialIds: readonly OpaqueId[];
    qualification: string;
}

export interface EvidenceMaterial {
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

export interface EvidenceVersion {
    id: OpaqueId;
    ordinal: number;
    observation: string;
    interpretation: string;
    method: string;
    falsifiers: readonly TextWithReason[];
    uncertainties: readonly TextWithReason[];
    limitations: readonly TextWithReason[];
    claims: readonly EvidenceClaim[];
    materials: readonly EvidenceMaterial[];
    submittedAt: EpochMs;
}

export interface EvidencePackage {
    id: OpaqueId;
    roundId: OpaqueId;
    contributionId: OpaqueId;
    authorId: OpaqueId;
    agendaId: OpaqueId;
    currentVersionId: OpaqueId;
    versions: readonly EvidenceVersion[];
}

export interface Registration {
    id: OpaqueId;
    versionId: OpaqueId;
    status: "complete";
    createdAt: EpochMs;
}

export interface ReviewDimension {
    score: 0 | 1 | 2 | 3 | "unable_to_assess";
    reason: string;
    scope: string;
    baselineEvidenceIds: readonly OpaqueId[];
}

export interface EvidenceReview {
    id: OpaqueId;
    versionId: OpaqueId;
    reviewerId: OpaqueId;
    baselinePublicationIds: readonly OpaqueId[];
    scope: string;
    dimensions: Readonly<{
        source: ReviewDimension;
        credibility: ReviewDimension;
        completeness: ReviewDimension;
        support: ReviewDimension;
    }>;
    createdAt: EpochMs;
}

export interface ReviewBatchClaim {
    id: OpaqueId;
    sourceEffectId: OpaqueId;
    roundId: OpaqueId;
    reviewerId: OpaqueId;
    versionIds: readonly OpaqueId[];
    claimedAt: EpochMs;
    expiresAt: EpochMs;
}

export interface ReviewDelivery {
    id: OpaqueId;
    reviewId: OpaqueId;
    authorId: OpaqueId;
    status: "sent" | "failed";
    sentAt?: EpochMs;
    failedAt?: EpochMs;
    failureReason?: string;
}

export interface Publication {
    id: OpaqueId;
    roundId: OpaqueId;
    seq: number;
    finalVersionIds: readonly OpaqueId[];
    finalReviewIds: readonly OpaqueId[];
    publishedAt: EpochMs;
    exitReasons: readonly string[];
}

export interface FormalMessage {
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

export interface ProposalRevision {
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

export interface Position {
    id: OpaqueId;
    proposalRevisionId: OpaqueId;
    actorId: OpaqueId;
    stance: "support" | "oppose" | "abstain" | "conditional";
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    createdAt: EpochMs;
}

export interface DecisionCandidate {
    id: OpaqueId;
    proposalRevisionId: OpaqueId;
    actorId: OpaqueId;
    outcome: "adopt" | "reject" | "defer";
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    positionIds: readonly OpaqueId[];
    createdAt: EpochMs;
}

export interface Decision extends DecisionCandidate {
    candidateId: OpaqueId;
    status: "accepted" | "superseded" | "revoked";
    replacesDecisionId?: OpaqueId;
}

export interface RiskDisposition {
    id: OpaqueId;
    issueId: OpaqueId;
    actorId: OpaqueId;
    action: "accept" | "reject";
    scope: string;
    rationale: string;
    evidenceIds: readonly OpaqueId[];
    createdAt: EpochMs;
}

export interface CompletionDeclaration {
    id: OpaqueId;
    actorId: OpaqueId;
    outputId: OpaqueId;
    criterionId?: OpaqueId;
    statement: string;
    evidenceIds: readonly OpaqueId[];
    taskId?: OpaqueId;
    createdAt: EpochMs;
}

export interface CompletionFact {
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

export interface MeetingTask {
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

export interface ManagerPlan {
    id: OpaqueId;
    agendaId: OpaqueId;
    managerId: OpaqueId;
    basedOnPublicationId?: OpaqueId;
    roundGoal?: RoundGoal;
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

export interface PrivateMail {
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

export interface Termination {
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

export type TargetDomainFactPayload =
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

export interface ArchiveEvidenceBundle {
    packageId: OpaqueId;
    authorIdentityId: OpaqueId;
    agendaId: OpaqueId;
    version: EvidenceVersion;
    review: EvidenceReview;
}

export interface ArchiveUnclosedContribution {
    contributionId: OpaqueId;
    contributorIdentityId: OpaqueId;
    agendaId: OpaqueId;
    status: Contribution["status"];
    exitReason?: string;
}

export interface ArchiveIdentityProvenance {
    identityId: OpaqueId;
    displayName: string;
    roles: readonly MeetingRole[];
    definitionId?: OpaqueId;
    definitionVersion?: string;
    definitionHash?: string;
}

export interface ArchiveMaterial {
    id: OpaqueId;
    kind: "published_evidence" | "formal_message" | "accepted_decision" | "active_completion_fact";
    title: string;
    sourceObjectIds: readonly OpaqueId[];
}

export type ArchiveQuestionIssueDispositionFact =
    | {
          factId: OpaqueId;
          kind: "resolve_question";
          actorId: OpaqueId;
          occurredAt: EpochMs;
          relatedIds: readonly OpaqueId[];
          payload: Extract<TargetDomainFactPayload, { kind: "question_disposition" }>;
      }
    | {
          factId: OpaqueId;
          kind: "dispose_issue";
          actorId: OpaqueId;
          occurredAt: EpochMs;
          relatedIds: readonly OpaqueId[];
          payload: Extract<TargetDomainFactPayload, { kind: "issue_disposition" }>;
      };

export interface ArchivePackage {
    id: OpaqueId;
    status: "pending" | "complete" | "failed";
    createdAt: EpochMs;
    publicSnapshotVersion: number;
    terminationId: OpaqueId;
    objective: ObjectiveContract;
    agenda: readonly AgendaItem[];
    agendaCandidates: readonly AgendaCandidate[];
    publications: readonly Publication[];
    messages: readonly FormalMessage[];
    evidenceBundles: readonly ArchiveEvidenceBundle[];
    proposalRevisions: readonly ProposalRevision[];
    positions: readonly Position[];
    decisionCandidates: readonly DecisionCandidate[];
    decisions: readonly Decision[];
    completionFacts: readonly CompletionFact[];
    questions: readonly Question[];
    issues: readonly Issue[];
    riskDispositions: readonly RiskDisposition[];
    questionIssueDispositionFacts: readonly ArchiveQuestionIssueDispositionFact[];
    termination: Termination;
    unresolvedQuestionIds: readonly OpaqueId[];
    unresolvedIssueIds: readonly OpaqueId[];
    unresolvedItemIds: readonly OpaqueId[];
    unclosedContributions: readonly ArchiveUnclosedContribution[];
    identityProvenance: readonly ArchiveIdentityProvenance[];
    exportMaterials: readonly ArchiveMaterial[];
}

export interface ContinuationProvenance {
    sourceArchiveId: OpaqueId;
    selectedMaterialIds: readonly OpaqueId[];
    importedAt: EpochMs;
    importedBy: OpaqueId;
}

export interface MeetingLimits {
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
    continuation?: ContinuationProvenance;
    objective: ObjectiveContract;
    lifecycle: MeetingLifecycle;
    identities: readonly MeetingIdentity[];
    identityRecommendations: readonly IdentityRecommendation[];
    agenda: readonly AgendaItem[];
    agendaCandidates: readonly AgendaCandidate[];
    rounds: readonly Round[];
    opportunityRequests: readonly EvidenceOpportunityRequest[];
    pendingHandRaises: readonly PendingHandRaise[];
    contributions: readonly Contribution[];
    evidenceReviewerId: OpaqueId;
    completionDeclarations: readonly CompletionDeclaration[];
    evidencePackages: readonly EvidencePackage[];
    registrations: readonly Registration[];
    reviews: readonly EvidenceReview[];
    reviewClaims: readonly ReviewBatchClaim[];
    reviewDeliveries: readonly ReviewDelivery[];
    publications: readonly Publication[];
    messages: readonly FormalMessage[];
    proposals: readonly ProposalRevision[];
    positions: readonly Position[];
    decisionCandidates: readonly DecisionCandidate[];
    decisions: readonly Decision[];
    questions: readonly Question[];
    issues: readonly Issue[];
    riskDispositions: readonly RiskDisposition[];
    tasks: readonly MeetingTask[];
    managerPlans: readonly ManagerPlan[];
    privateMails: readonly PrivateMail[];
    completionFacts: readonly CompletionFact[];
    limits: MeetingLimits;
    termination?: Termination;
    archive?: ArchivePackage;
}
