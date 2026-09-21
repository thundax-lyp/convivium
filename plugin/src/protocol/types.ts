type LegacyMeetingStatus =
    | "created"
    | "running"
    | "waiting"
    | "paused"
    | "converging"
    | "completed"
    | "partial"
    | "no_consensus"
    | "cancelled"
    | "failed"
    | "archiving"
    | "archived";

export type ProtocolVersion = 1;

/** Ephemeral invalidation signal; the consumer must refetch complete facts. */
export interface MeetingRefreshNotice {
    readonly kind: "refresh";
}

export interface ProtocolMeta {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    meetingVersion: number;
}

export interface MeetingMailboxRecipient {
    kind: "meeting_participant";
    meetingId: string;
    participantId: string;
}

export interface MeetingMailContext {
    meetingId: string;
    agendaItemId?: string;
    contextFromSeq: number;
    contextThroughSeq: number;
    relevantMessageIds: readonly string[];
    snapshotSummary?: string;
}

export interface MeetingMailExtension {
    recipient: MeetingMailboxRecipient;
    meetingContext: MeetingMailContext;
    replyToMailId?: string;
}

export type MailHandlingStatus =
    "pending" | "processing" | "processed" | "obsolete" | "failed" | "timed_out" | "cancelled";

export interface MailHandlingAttempt {
    handlingAttemptId: string;
    mailId: string;
    meetingId: string;
    participantId: string;
    deliveryId?: string;
    snapshotThroughSeq: number;
    processingThroughSeq?: number;
    status: MailHandlingStatus;
}

export interface SendMeetingMessageInput {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
    recipient: MeetingMailboxRecipient;
    content: string;
    meetingContext: MeetingMailContext;
    replyToMailId?: string;
}

export interface FinishMeetingMailInput {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    mailId: string;
    handlingAttemptId: string;
    deliveryId: string;
    requestId: string;
    status: "processed" | "obsolete" | "failed";
}

export interface MeetingMailResult {
    mailId: string;
    handlingAttemptId: string;
    status: MailHandlingStatus;
}

export interface ParticipantSpec {
    agentDefinitionId?: string;
    participantKey: string;
    sourceMemberName?: string;
    displayName: string;
    role?: string;
}

export interface ObjectiveContractSpec {
    requiredOutputs: readonly { key: string; description: string }[];
    acceptanceCriteria: readonly { key: string; description: string }[];
    hardConstraints: readonly { key: string; description: string }[];
    requiredReviewerKeys: readonly string[];
    riskAcceptanceAuthorityKeys: readonly string[];
    acceptableRiskLevel: "low" | "medium" | "high";
}

export interface AgendaItemSpec {
    key: string;
    title: string;
    objective: string;
    inScope: readonly string[];
    outOfScope: readonly string[];
    completionCriteria: readonly string[];
    ownerKey?: string;
    requiredParticipantKeys: readonly string[];
    relatedTaskIds?: readonly string[];
}

export interface ContinuationSelection {
    sourceMeetingId: string;
    includeFinalSummary: boolean;
    decisionIds: readonly string[];
    unresolvedIssueIds: readonly string[];
    riskIds: readonly string[];
    evidenceIds: readonly string[];
    artifactIds: readonly string[];
}

export interface CreateMeetingInput {
    evidenceReviewerKey: string;
    managerAgentDefinitionId?: string;
    protocolVersion: ProtocolVersion;
    requestId: string;
    teamId: string;
    topic: string;
    objective: string;
    objectiveContract: ObjectiveContractSpec;
    agenda: readonly AgendaItemSpec[];
    participants: readonly ParticipantSpec[];
    continuation?: ContinuationSelection;
    selectionMode?: "round_robin" | "rule_based" | "manager" | "hybrid";
    limits?: Partial<PublicMeetingLimits>;
}

export interface CreateMeetingResult {
    meetingId: string;
    meetingVersion: number;
    status: "created" | "running" | "waiting";
    participants: readonly {
        participantKey: string;
        participantId: string;
    }[];
}

export interface MeetingStatusInput {
    protocolVersion: ProtocolVersion;
    meetingId: string;
}

export interface LocalMeetingListItem {
    meetingId: string;
    teamId: string;
    topic: string;
    status: LegacyMeetingStatus;
    meetingVersion: number;
    updatedAt: number;
}

export interface LocalMeetingListResult {
    meetings: readonly LocalMeetingListItem[];
}

export interface LocalMeetingListResponse {
    protocolVersion: 1;
    ok: true;
    result: LocalMeetingListResult;
}

export interface PauseMeetingInput {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
    reason: string;
}

export interface ResumeMeetingInput {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
}

export interface MeetingControlResult {
    status: "paused" | "running" | "waiting";
    changed: boolean;
}

export type RiskLevel = "low" | "medium" | "high";

export interface CaptainDecisionDispositionInput {
    protocolVersion: 1;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
    decisionId: string;
    action: "supersede" | "revoke";
    reason: string;
    evidenceMessageIds: readonly string[];
    replacementCandidateId?: string;
}

export interface CaptainDecisionDispositionResult {
    requestId: string;
    decisionId: string;
    action: "supersede" | "revoke";
    completionFactId: string;
    replacementDecisionId?: string;
}

export type CaptainAgendaCandidateDispositionInput =
    | {
          protocolVersion: 1;
          meetingId: string;
          expectedMeetingVersion: number;
          requestId: string;
          candidateId: string;
          action: "promote";
          agendaItem: {
              objective: string;
              inScope: readonly string[];
              outOfScope: readonly string[];
              completionCriteria: readonly string[];
              owner?: string;
              requiredParticipants: readonly string[];
          };
      }
    | {
          protocolVersion: 1;
          meetingId: string;
          expectedMeetingVersion: number;
          requestId: string;
          candidateId: string;
          action: "park" | "reject";
      };

export interface CaptainAgendaCandidateDispositionResult {
    requestId: string;
    candidateId: string;
    action: "promote" | "park" | "reject";
    agendaItemId?: string;
}

export interface CaptainRiskDispositionInput {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
    issueId: string;
    decision: "accept" | "reject";
    reason: string;
    evidenceMessageIds: readonly string[];
}

export interface CaptainRiskDispositionResult {
    requestId: string;
    issueId: string;
    disposition: "accepted" | "rejected";
    completionFactId: string;
    meetingStatus: LegacyMeetingStatus;
}

export interface ReassignTurnInput {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    expectedMeetingVersion: number;
    currentAttemptId: string;
    action: "reassign" | "skip";
    replacementParticipantId?: string;
    reason: string;
    requestId: string;
}

export interface EndMeetingInput {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    expectedMeetingVersion: number;
    outcome: "completed" | "partial" | "no_consensus" | "cancelled";
    reason: string;
    acceptedDecisionIds: readonly string[];
    deferredAgendaItemIds: readonly string[];
    waivers: readonly {
        subjectId: string;
        kind: "required_review" | "agenda_item";
        reason: string;
    }[];
    requestId: string;
}

export type MeetingTaskStatus =
    "requested" | "queued" | "running" | "completed" | "failed" | "cancelled";

export interface MeetingTaskRequest {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    attemptId: string;
    requestId: string;
    title: string;
    description: string;
    blocking: boolean;
}

export interface MeetingTaskResult {
    requestId: string;
    meetingTaskId: string;
    participantId: string;
    originatingSpeakerAttemptId: string;
    status: MeetingTaskStatus;
}

export interface MeetingTaskProjection {
    meetingTaskId: string;
    participantId: string;
    title: string;
    blocking: boolean;
    status: MeetingTaskStatus;
    resultSummary?: string;
    failureReason?: string;
    createdAt: number;
    queuedAt?: number;
    startedAt?: number;
    finishedAt?: number;
}

export interface MeetingTaskStatusInput {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    meetingTaskId: string;
}

export interface MeetingTaskStatusResult {
    task: MeetingTaskProjection;
    observedMeetingVersion: number;
    meetingTerminal: boolean;
    mayExecute: boolean;
}

export interface MeetingTaskStartInput extends MeetingTaskStatusInput {
    requestId: string;
}

export interface MeetingTaskStartResult {
    requestId: string;
    meetingTaskId: string;
    status: "running";
}

export interface MeetingTaskFinishInput extends MeetingTaskStatusInput {
    requestId: string;
    executionId: string;
    status: "completed" | "failed";
    resultSummary?: string;
    failureReason?: string;
}

export interface MeetingTaskFinishResult {
    requestId: string;
    meetingTaskId: string;
    status: "completed" | "failed";
    handRaiseId?: string;
}

export interface SpeakerMeetingContext {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    meetingVersion: number;
    objective: string;
    objectiveContract: PublicObjectiveContract;
    activeAgendaItem: PublicAgendaItem;
    acceptedDecisions: readonly PublicDecision[];
    blockingQuestions: readonly PublicQuestion[];
    recentMessages: readonly PublicMeetingMessage[];
    relevantHistorySummary?: string;
    taskResults: readonly AuthorizedTaskResult[];
    continuationMaterials: readonly PublicContinuationMaterial[];
    turn: PublicTurn;
    step: PublicSpeakerStep;
    attempt: {
        attemptId: string;
        deliveryId: string;
        contextFromSeq: number;
        contextThroughSeq: number;
        deadlineAt?: number;
    };
}

export interface PublicObjectiveContract {
    requiredOutputs: readonly {
        id: string;
        description: string;
        status: "pending" | "ready" | "accepted";
    }[];
    acceptanceCriteria: readonly {
        id: string;
        description: string;
        satisfied: boolean;
    }[];
    hardConstraints: readonly { id: string; description: string }[];
    requiredReviewers: readonly string[];
    riskAcceptanceAuthority: readonly string[];
    acceptableRiskLevel: "low" | "medium" | "high";
}

export interface PublicAgendaItem {
    id: string;
    title: string;
    objective: string;
    inScope: readonly string[];
    outOfScope: readonly string[];
    completionCriteria: readonly string[];
    owner?: string;
    requiredParticipants: readonly string[];
    relatedTaskIds: readonly string[];
    status: "pending" | "discussing" | "waiting" | "resolved" | "deferred" | "blocked";
    resolution?: string;
}

export interface PublicQuestion {
    id: string;
    text: string;
    askedBy?: string;
    directedTo?: string;
    agendaItemId?: string;
    blocking?: boolean;
    affectedOutputIds?: readonly string[];
    affectedCriterionIds?: readonly string[];
    violatedConstraintIds?: readonly string[];
    status: "open" | "answered" | "withdrawn" | "deferred";
    answerMessageId?: string;
}

export interface PublicDecisionCandidate {
    id: string;
    proposalId: string;
    proposalRevision: number;
    statement: string;
    rationale: string;
    proposedBy: string;
    sourceMessageId: string;
    agendaItemId: string;
    createdAt: number;
}

export interface PublicDecision {
    id: string;
    agendaItemId?: string;
    proposalId: string;
    proposalRevision: number;
    statement?: string;
    rationale?: string;
    status: "accepted" | "superseded" | "revoked";
    acceptedBy?: readonly string[];
    dissentingPositionIds?: readonly string[];
    supersededByDecisionId?: string;
}

export interface PublicRisk {
    id: string;
    title: string;
    description: string;
    sourceMessageId: string;
    agendaItemId?: string;
    affectedOutputIds: readonly string[];
    affectedCriterionIds: readonly string[];
    violatedConstraintIds: readonly string[];
    blockingObjectionIds: readonly string[];
    blocking: boolean;
    riskLevel?: RiskLevel;
    impact: string;
    urgency: string;
    reversibility: string;
    safeDefaultAvailable: boolean;
    disposition: "blocking" | "follow_up" | "parking_lot" | "accepted_risk" | "out_of_scope";
    status: "open" | "accepted_risk" | "resolved" | "deferred" | "out_of_scope";
    rationale?: string;
    ownerId?: string;
    relatedTaskIds: readonly string[];
}

export interface AuthorizedTaskResult {
    meetingTaskId: string;
    executionId?: string;
    status: MeetingTaskStatus;
    resultSummary?: string;
    observedAt: number;
}

export interface PublicTurn {
    id: string;
    seq: number;
    agendaItemId: string;
    intent: string;
    reason: string;
    objective: string;
    expectedOutputs: readonly string[];
    prohibitedTopics: readonly string[];
    steps: readonly PublicSpeakerStep[];
}

export interface PublicSpeakerStep {
    id: string;
    participantId: string;
    instruction: string;
    reason: string;
    status: "pending" | "assigned" | "running" | "submitted" | "skipped" | "revoked" | "failed";
}

export interface ManagerMeetingContext {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    meetingVersion: number;
    planningAttemptId: string;
    objective: string;
    activeAgendaItem: PublicAgendaItem;
    requiredSpeakerIds: readonly string[];
    dispatchableParticipantIds: readonly string[];
    recentPublicMessages: readonly PublicMeetingMessage[];
    blockingFacts: readonly PublicBlockingFact[];
    meetingTasks: readonly MeetingTaskProjection[];
    pendingHandRaises: readonly PublicHandRaise[];
    continuationMaterials: readonly PublicContinuationMaterial[];
    limits: PublicMeetingLimits;
    planningReason: string;
    agentCatalog: MeetingAgentCatalogProjection | null;
}

export interface PublicBlockingFact {
    id: string;
    kind: "question" | "objection" | "issue" | "risk" | "required_review";
    subjectId: string;
    summary: string;
}

export interface PublicHandRaise {
    id: string;
    participantId: string;
    reason: string;
    summary: string;
    taskIds: readonly string[];
    replyToMessageId?: string;
    agendaItemId?: string;
    priority: "normal" | "high" | "blocking";
}

export interface PublicContinuationMaterial {
    sourceMeetingId: string;
    sourceKind: "final_summary" | "decision" | "issue" | "risk" | "evidence" | "artifact";
    sourceObjectId?: string;
    summary: string;
    checksum?: string;
}

export interface PublicMeetingLimits {
    maxTurns: number;
    maxSpeakersPerTurn: number;
    maxTotalMessages: number;
    maxDurationMs?: number;
    speakerAttemptTimeoutMs?: number;
    mailHandlingTimeoutMs?: number;
}

export type PublicMessageKind =
    | "statement"
    | "question"
    | "answer"
    | "proposal"
    | "objection"
    | "evidence"
    | "review"
    | "summary"
    | "decision";

export interface MinutesDraftInput {
    readonly coverage: {
        readonly fromSeq: number;
        readonly throughSeq: number;
    };
    readonly referencedMessageIds: readonly string[];
}

export interface PublicMinutesDraft extends MinutesDraftInput {
    readonly status: "draft";
}

export interface PublicMeetingMessage {
    id: string;
    seq: number;
    turnId?: string;
    stepId?: string;
    contributionId?: string;
    contributionRevision?: number;
    speaker: string;
    agendaItemId: string;
    kind: PublicMessageKind;
    content: string;
    mentions: readonly string[];
    replyTo?: string;
    taskIds: readonly string[];
    createdAt: number;
    minutesDraft?: PublicMinutesDraft;
}

export type AgentRoleDefinitionId =
    | "domain_architect"
    | "runtime_engineer"
    | "protocol_ui_engineer"
    | "verification_reviewer"
    | "github_research_analyst"
    | "arxiv_research_analyst"
    | "meeting_scribe";

export type AgentEvidenceScope = "repository" | "github" | "arxiv" | "web";

export interface AgentRoleDefinition {
    roleDefinitionId: AgentRoleDefinitionId;
    version: string;
    displayName: string;
    summary: string;
    expertiseTags: readonly string[];
    evidenceScopes: readonly AgentEvidenceScope[];
    responsibilities: readonly string[];
    nonResponsibilities: readonly string[];
}

export interface MeetingAgentCatalogSnapshot {
    protocolVersion: 1;
    catalogId: string;
    catalogVersion: string;
    teamId: string;
    capturedAt: number;
    roles: readonly AgentRoleDefinition[];
    candidates: readonly {
        candidateId: string;
        roleDefinitionId: AgentRoleDefinitionId;
        roleDefinitionVersion: string;
        sourceMemberName: string;
        agentDefinitionId: string;
        availability: "available" | "unavailable";
    }[];
}

export interface MeetingAgentCandidate {
    candidateId: string;
    roleDefinitionId: AgentRoleDefinitionId;
    roleDefinitionVersion: string;
    displayName: string;
    summary: string;
    expertiseTags: readonly string[];
    evidenceScopes: readonly AgentEvidenceScope[];
    responsibilities: readonly string[];
    nonResponsibilities: readonly string[];
    availability: "available" | "unavailable";
}

export interface ManagerResearchNeed {
    evidenceGapId: string;
    agendaItemId: string;
    question: string;
    requiredScopes: readonly AgentEvidenceScope[];
    existingEvidenceIds: readonly string[];
    status: "open" | "stale" | "satisfied";
}

export interface MeetingAgentCatalogProjection {
    protocolVersion: 1;
    catalogId: string;
    catalogVersion: string;
    candidates: readonly MeetingAgentCandidate[];
    researchNeeds: readonly ManagerResearchNeed[];
}

/** Captain-only rejection; approval and Participant admission are not implemented. */
export interface CaptainAttendanceDispositionInput {
    protocolVersion: 1;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
    recommendationId: string;
    decision: "reject";
    reason: string;
}
export interface CaptainAttendanceDispositionResult {
    requestId: string;
    recommendationId: string;
    disposition: "rejected";
}
export interface AttendanceRecommendationClaim {
    candidateId: string;
    agendaItemId: string;
    rationale: string;
    expectedContribution: string;
    evidenceGapIds: readonly string[];
    urgency: "current_agenda" | "later_agenda" | "follow_up";
}

export interface PublicAttendanceRecommendation extends AttendanceRecommendationClaim {
    rejection?: { reason: string; rejectedAt: number };
    recommendationId: string;
    roleDefinitionId: AgentRoleDefinitionId;
    displayName: string;
    status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
    admissionStatus?: "approved" | "provisioning" | "active" | "failed" | "cancelled";
    failureCode?: string;
}

export interface ManagerPlanSubmission {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    planningAttemptId: string;
    observedMeetingVersion: number;
    requestId: string;
    agendaItemId: string;
    intent: string;
    objective: string;
    expectedOutputs: readonly string[];
    prohibitedTopics: readonly string[];
    attendanceRecommendations?: readonly AttendanceRecommendationClaim[];
    steps: readonly {
        participantId: string;
        instruction: string;
        reason: string;
    }[];
}

export interface TurnSubmission {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    turnId: string;
    stepId: string;
    attemptId: string;
    deliveryId: string;
    agendaItemId: string;
    kind: PublicMessageKind;
    content: string;
    mentions: readonly string[];
    replyTo?: string;
    taskIds: readonly string[];
    agendaRelation:
        "on_topic" | "supporting_context" | "new_topic_candidate" | "blocking_interrupt";
    changes: PublicMeetingChanges;
    completionClaims?: CompletionClaims;
    minutesDraft?: MinutesDraftInput;
}

export interface PublicMeetingChanges {
    questions?: readonly QuestionClaim[];
    proposals?: readonly ProposalClaim[];
    positions?: readonly PositionClaim[];
    issues?: readonly IssueClaim[];
    decisionProposals?: readonly DecisionProposalClaim[];
    agendaCandidates?: readonly AgendaCandidateClaim[];
}

export interface QuestionClaim {
    text: string;
    directedTo?: string;
    blocking: boolean;
    affectedOutputIds?: readonly string[];
    affectedCriterionIds?: readonly string[];
    violatedConstraintIds?: readonly string[];
}

export interface ProposalClaim {
    proposalId?: string;
    expectedRevision?: number;
    title: string;
    description: string;
}

export interface PositionClaim {
    proposalId: string;
    proposalRevision: number;
    position: "support" | "accept" | "object" | "needs_revision" | "abstain";
    reason?: string;
    blocking: boolean;
}

export interface IssueClaim {
    title: string;
    description: string;
    affectedOutputIds: readonly string[];
    affectedCriterionIds: readonly string[];
    violatedConstraintIds: readonly string[];
    impact: "none" | "low" | "medium" | "high" | "critical";
    urgency: "now" | "before_release" | "later";
    safeDefaultAvailable: boolean;
    riskLevel: RiskLevel;
}

export interface DecisionProposalClaim {
    proposalId: string;
    proposalRevision: number;
    statement: string;
    rationale: string;
}

export interface CaptainDecisionAcceptanceInput {
    protocolVersion: 1;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
    decisionCandidateId: string;
    reason: string;
    evidenceMessageIds: readonly string[];
}

export interface CaptainDecisionAcceptanceResult {
    requestId: string;
    decisionCandidateId: string;
    decisionId: string;
    proposalId: string;
    proposalRevision: number;
    completionFactId: string;
}

export interface AgendaCandidateClaim {
    title: string;
    reason: string;
    relationToActiveAgenda: "related" | "adjacent" | "unrelated";
    urgency: "now" | "before_release" | "later";
    suggestedParticipants: readonly string[];
}

export interface CompletionClaims {
    outputClaims?: readonly EvidenceClaim[];
    criterionClaims?: readonly EvidenceClaim[];
    agendaResolution?: AgendaResolutionClaim;
    review?: ReviewClaim;
    questionResolutions?: readonly QuestionResolutionClaim[];
    riskAcceptance?: RiskAcceptanceClaim;
}

export interface EvidenceClaim {
    subjectId: string;
    evidenceMessageIds: readonly string[];
    taskIds: readonly string[];
}

export interface AgendaResolutionClaim {
    agendaItemId: string;
    resolution: string;
    evidenceMessageIds: readonly string[];
}

export interface ReviewClaim {
    outputId: string;
    result: "approved" | "changes_required";
    reason: string;
    evidenceMessageIds: readonly string[];
}

export interface QuestionResolutionClaim {
    questionId: string;
    answerMessageId: string;
}

export interface RiskAcceptanceClaim {
    issueId: string;
    decision: "accept" | "reject";
    reason: string;
    evidenceMessageIds: readonly string[];
}

export interface HandRaiseSubmission {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    requestId: string;
    reason:
        | "task_completed"
        | "new_evidence"
        | "answer_ready"
        | "blocking_objection"
        | "correction"
        | "user_requested";
    summary: string;
    taskIds: readonly string[];
    replyToMessageId?: string;
    agendaItemId?: string;
    priority: "normal" | "high" | "blocking";
}

export interface ProtocolSuccess<T> extends ProtocolMeta {
    ok: true;
    result: T;
}

export interface ManagerPlanResult {
    status: "planned" | "waiting";
    turnId?: string;
    firstStepId?: string;
    firstAttemptId?: string;
    waitReason?: "required_participant_unavailable";
    participantIds?: readonly string[];
    fallbackApplied: boolean;
    fallbackReason?:
        "manager_plan_invalid" | "manager_timeout" | "manager_delivery_retry_exhausted";
}

export interface TurnSubmissionResult {
    messageId: string;
    messageSeq: number;
    turnStatus: "running" | "completed" | "truncated";
    nextStepId?: string;
    meetingStatus: LegacyMeetingStatus;
}

export interface HandRaiseResult {
    handRaiseId: string;
    status: "pending" | "accepted" | "deferred" | "consumed" | "rejected";
}

export interface ReassignTurnResult {
    revokedAttemptId: string;
    replacementAttemptId?: string;
    action: "reassign" | "skip";
}

export interface EndMeetingResult {
    status: "completed" | "partial" | "no_consensus" | "cancelled";
    terminationCode: string;
}

export type KnownMeetingProtocolErrorCode =
    | "INVALID_ARGUMENT"
    | "MEETING_NOT_FOUND"
    | "UNAUTHORIZED_CALLER"
    | "INVALID_STATE_TRANSITION"
    | "STALE_ATTEMPT"
    | "STALE_MANAGER_ATTEMPT"
    | "VERSION_CONFLICT"
    | "IDEMPOTENCY_CONFLICT"
    | "IMMUTABLE_MEETING"
    | "ARCHIVED_MEETING"
    | "SOURCE_MEETING_NOT_ARCHIVED"
    | "ARCHIVE_MATERIAL_NOT_FOUND"
    | "PARTICIPANT_NOT_DISPATCHABLE"
    | "REQUIRED_SPEAKER_UNAVAILABLE"
    | "MANAGER_PLAN_INVALID"
    | "DELIVERY_RETRY_EXHAUSTED"
    | "UNSUPPORTED_CAPABILITY"
    | "AGENT_CATALOG_UNAVAILABLE"
    | "AGENT_CATALOG_VERSION_UNSUPPORTED"
    | "AGENT_CANDIDATE_NOT_FOUND"
    | "AGENT_CANDIDATE_UNAVAILABLE"
    | "ATTENDANCE_RECOMMENDATION_INVALID"
    | "ATTENDANCE_RECOMMENDATION_STALE"
    | "ATTENDANCE_RECOMMENDATION_NOT_PENDING"
    | "PARTICIPANT_PROVISIONING_FAILED"
    | "INTERNAL_ERROR";

export type MeetingProtocolErrorCode = KnownMeetingProtocolErrorCode | (string & {});

export interface ProtocolError {
    protocolVersion: ProtocolVersion;
    ok: false;
    code: MeetingProtocolErrorCode;
    message: string;
    meetingId?: string;
    meetingVersion?: number;
    turnId?: string;
    stepId?: string;
    attemptId?: string;
    deliveryId?: string;
    participantId?: string;
    retryable: boolean;
}
