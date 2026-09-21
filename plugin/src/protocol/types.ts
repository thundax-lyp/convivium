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
export interface MeetingRefreshNoticeV1 {
    readonly kind: "refresh";
}

export interface ProtocolMeta {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    meetingVersion: number;
}

export interface MeetingMailboxRecipientV1 {
    kind: "meeting_participant";
    meetingId: string;
    participantId: string;
}

export interface MeetingMailContextV1 {
    meetingId: string;
    agendaItemId?: string;
    contextFromSeq: number;
    contextThroughSeq: number;
    relevantMessageIds: readonly string[];
    snapshotSummary?: string;
}

export interface MeetingMailExtensionV1 {
    recipient: MeetingMailboxRecipientV1;
    meetingContext: MeetingMailContextV1;
    replyToMailId?: string;
}

export type MailHandlingStatusV1 =
    "pending" | "processing" | "processed" | "obsolete" | "failed" | "timed_out" | "cancelled";

export interface MailHandlingAttemptV1 {
    handlingAttemptId: string;
    mailId: string;
    meetingId: string;
    participantId: string;
    deliveryId?: string;
    snapshotThroughSeq: number;
    processingThroughSeq?: number;
    status: MailHandlingStatusV1;
}

export interface SendMeetingMessageInputV1 {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
    recipient: MeetingMailboxRecipientV1;
    content: string;
    meetingContext: MeetingMailContextV1;
    replyToMailId?: string;
}

export interface FinishMeetingMailInputV1 {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    mailId: string;
    handlingAttemptId: string;
    deliveryId: string;
    requestId: string;
    status: "processed" | "obsolete" | "failed";
}

export interface MeetingMailResultV1 {
    mailId: string;
    handlingAttemptId: string;
    status: MailHandlingStatusV1;
}

export interface ParticipantSpecV1 {
    agentDefinitionId?: string;
    participantKey: string;
    sourceMemberName?: string;
    displayName: string;
    role?: string;
}

export interface ObjectiveContractSpecV1 {
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
    objectiveContract: ObjectiveContractSpecV1;
    agenda: readonly AgendaItemSpec[];
    participants: readonly ParticipantSpecV1[];
    continuation?: ContinuationSelection;
    selectionMode?: "round_robin" | "rule_based" | "manager" | "hybrid";
    limits?: Partial<PublicMeetingLimitsV1>;
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

export interface MeetingStatusInputV1 {
    protocolVersion: ProtocolVersion;
    meetingId: string;
}

export interface LocalMeetingListItemV1 {
    meetingId: string;
    teamId: string;
    topic: string;
    status: LegacyMeetingStatus;
    meetingVersion: number;
    updatedAt: number;
}

export interface LocalMeetingListResultV1 {
    meetings: readonly LocalMeetingListItemV1[];
}

export interface LocalMeetingListResponseV1 {
    protocolVersion: 1;
    ok: true;
    result: LocalMeetingListResultV1;
}

export interface PauseMeetingInputV1 {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
    reason: string;
}

export interface ResumeMeetingInputV1 {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    expectedMeetingVersion: number;
    requestId: string;
}

export interface MeetingControlResultV1 {
    status: "paused" | "running" | "waiting";
    changed: boolean;
}

export type RiskLevelV1 = "low" | "medium" | "high";

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

export interface ReassignTurnInputV1 {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    expectedMeetingVersion: number;
    currentAttemptId: string;
    action: "reassign" | "skip";
    replacementParticipantId?: string;
    reason: string;
    requestId: string;
}

export interface EndMeetingInputV1 {
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

export type MeetingTaskStatusV1 =
    "requested" | "queued" | "running" | "completed" | "failed" | "cancelled";

export interface MeetingTaskRequestV1 {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    attemptId: string;
    requestId: string;
    title: string;
    description: string;
    blocking: boolean;
}

export interface MeetingTaskResultV1 {
    requestId: string;
    meetingTaskId: string;
    participantId: string;
    originatingSpeakerAttemptId: string;
    status: MeetingTaskStatusV1;
}

export interface MeetingTaskProjectionV1 {
    meetingTaskId: string;
    participantId: string;
    title: string;
    blocking: boolean;
    status: MeetingTaskStatusV1;
    resultSummary?: string;
    failureReason?: string;
    createdAt: number;
    queuedAt?: number;
    startedAt?: number;
    finishedAt?: number;
}

export interface MeetingTaskStatusInputV1 {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    meetingTaskId: string;
}

export interface MeetingTaskStatusResultV1 {
    task: MeetingTaskProjectionV1;
    observedMeetingVersion: number;
    meetingTerminal: boolean;
    mayExecute: boolean;
}

export interface MeetingTaskStartInputV1 extends MeetingTaskStatusInputV1 {
    requestId: string;
}

export interface MeetingTaskStartResultV1 {
    requestId: string;
    meetingTaskId: string;
    status: "running";
}

export interface MeetingTaskFinishInputV1 extends MeetingTaskStatusInputV1 {
    requestId: string;
    executionId: string;
    status: "completed" | "failed";
    resultSummary?: string;
    failureReason?: string;
}

export interface MeetingTaskFinishResultV1 {
    requestId: string;
    meetingTaskId: string;
    status: "completed" | "failed";
    handRaiseId?: string;
}

export interface SpeakerMeetingContextV1 {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    meetingVersion: number;
    objective: string;
    objectiveContract: PublicObjectiveContractV1;
    activeAgendaItem: PublicAgendaItemV1;
    acceptedDecisions: readonly PublicDecisionV1[];
    blockingQuestions: readonly PublicQuestionV1[];
    recentMessages: readonly PublicMeetingMessageV1[];
    relevantHistorySummary?: string;
    taskResults: readonly AuthorizedTaskResult[];
    continuationMaterials: readonly PublicContinuationMaterialV1[];
    turn: PublicTurnV1;
    step: PublicSpeakerStepV1;
    attempt: {
        attemptId: string;
        deliveryId: string;
        contextFromSeq: number;
        contextThroughSeq: number;
        deadlineAt?: number;
    };
}

export interface PublicObjectiveContractV1 {
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

export interface PublicAgendaItemV1 {
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

export interface PublicQuestionV1 {
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

export interface PublicDecisionCandidateV1 {
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

export interface PublicDecisionV1 {
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

export interface PublicRiskV1 {
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
    riskLevel?: RiskLevelV1;
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
    status: MeetingTaskStatusV1;
    resultSummary?: string;
    observedAt: number;
}

export interface PublicTurnV1 {
    id: string;
    seq: number;
    agendaItemId: string;
    intent: string;
    reason: string;
    objective: string;
    expectedOutputs: readonly string[];
    prohibitedTopics: readonly string[];
    steps: readonly PublicSpeakerStepV1[];
}

export interface PublicSpeakerStepV1 {
    id: string;
    participantId: string;
    instruction: string;
    reason: string;
    status: "pending" | "assigned" | "running" | "submitted" | "skipped" | "revoked" | "failed";
}

export interface ManagerMeetingContextV1 {
    protocolVersion: ProtocolVersion;
    meetingId: string;
    meetingVersion: number;
    planningAttemptId: string;
    objective: string;
    activeAgendaItem: PublicAgendaItemV1;
    requiredSpeakerIds: readonly string[];
    dispatchableParticipantIds: readonly string[];
    recentPublicMessages: readonly PublicMeetingMessageV1[];
    blockingFacts: readonly PublicBlockingFactV1[];
    meetingTasks: readonly MeetingTaskProjectionV1[];
    pendingHandRaises: readonly PublicHandRaiseV1[];
    continuationMaterials: readonly PublicContinuationMaterialV1[];
    limits: PublicMeetingLimitsV1;
    planningReason: string;
    agentCatalog: MeetingAgentCatalogProjectionV1 | null;
}

export interface PublicBlockingFactV1 {
    id: string;
    kind: "question" | "objection" | "issue" | "risk" | "required_review";
    subjectId: string;
    summary: string;
}

export interface PublicHandRaiseV1 {
    id: string;
    participantId: string;
    reason: string;
    summary: string;
    taskIds: readonly string[];
    replyToMessageId?: string;
    agendaItemId?: string;
    priority: "normal" | "high" | "blocking";
}

export interface PublicContinuationMaterialV1 {
    sourceMeetingId: string;
    sourceKind: "final_summary" | "decision" | "issue" | "risk" | "evidence" | "artifact";
    sourceObjectId?: string;
    summary: string;
    checksum?: string;
}

export interface PublicMeetingLimitsV1 {
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

export interface MinutesDraftInputV1 {
    readonly coverage: {
        readonly fromSeq: number;
        readonly throughSeq: number;
    };
    readonly referencedMessageIds: readonly string[];
}

export interface PublicMinutesDraftV1 extends MinutesDraftInputV1 {
    readonly status: "draft";
}

export interface PublicMeetingMessageV1 {
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
    minutesDraft?: PublicMinutesDraftV1;
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

export interface MeetingAgentCatalogSnapshotV1 {
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

export interface MeetingAgentCandidateV1 {
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

export interface ManagerResearchNeedV1 {
    evidenceGapId: string;
    agendaItemId: string;
    question: string;
    requiredScopes: readonly AgentEvidenceScope[];
    existingEvidenceIds: readonly string[];
    status: "open" | "stale" | "satisfied";
}

export interface MeetingAgentCatalogProjectionV1 {
    protocolVersion: 1;
    catalogId: string;
    catalogVersion: string;
    candidates: readonly MeetingAgentCandidateV1[];
    researchNeeds: readonly ManagerResearchNeedV1[];
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

export interface PublicAttendanceRecommendationV1 extends AttendanceRecommendationClaim {
    rejection?: { reason: string; rejectedAt: number };
    recommendationId: string;
    roleDefinitionId: AgentRoleDefinitionId;
    displayName: string;
    status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
    admissionStatus?: "approved" | "provisioning" | "active" | "failed" | "cancelled";
    failureCode?: string;
}

export interface ManagerPlanSubmissionV1 {
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

export interface TurnSubmissionV1 {
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
    changes: PublicMeetingChangesV1;
    completionClaims?: CompletionClaims;
    minutesDraft?: MinutesDraftInputV1;
}

export interface PublicMeetingChangesV1 {
    questions?: readonly QuestionClaimV1[];
    proposals?: readonly ProposalClaimV1[];
    positions?: readonly PositionClaimV1[];
    issues?: readonly IssueClaimV1[];
    decisionProposals?: readonly DecisionProposalClaim[];
    agendaCandidates?: readonly AgendaCandidateClaim[];
}

export interface QuestionClaimV1 {
    text: string;
    directedTo?: string;
    blocking: boolean;
    affectedOutputIds?: readonly string[];
    affectedCriterionIds?: readonly string[];
    violatedConstraintIds?: readonly string[];
}

export interface ProposalClaimV1 {
    proposalId?: string;
    expectedRevision?: number;
    title: string;
    description: string;
}

export interface PositionClaimV1 {
    proposalId: string;
    proposalRevision: number;
    position: "support" | "accept" | "object" | "needs_revision" | "abstain";
    reason?: string;
    blocking: boolean;
}

export interface IssueClaimV1 {
    title: string;
    description: string;
    affectedOutputIds: readonly string[];
    affectedCriterionIds: readonly string[];
    violatedConstraintIds: readonly string[];
    impact: "none" | "low" | "medium" | "high" | "critical";
    urgency: "now" | "before_release" | "later";
    safeDefaultAvailable: boolean;
    riskLevel: RiskLevelV1;
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
    outputClaims?: readonly EvidenceClaimV1[];
    criterionClaims?: readonly EvidenceClaimV1[];
    agendaResolution?: AgendaResolutionClaim;
    review?: ReviewClaimV1;
    questionResolutions?: readonly QuestionResolutionClaimV1[];
    riskAcceptance?: RiskAcceptanceClaimV1;
}

export interface EvidenceClaimV1 {
    subjectId: string;
    evidenceMessageIds: readonly string[];
    taskIds: readonly string[];
}

export interface AgendaResolutionClaim {
    agendaItemId: string;
    resolution: string;
    evidenceMessageIds: readonly string[];
}

export interface ReviewClaimV1 {
    outputId: string;
    result: "approved" | "changes_required";
    reason: string;
    evidenceMessageIds: readonly string[];
}

export interface QuestionResolutionClaimV1 {
    questionId: string;
    answerMessageId: string;
}

export interface RiskAcceptanceClaimV1 {
    issueId: string;
    decision: "accept" | "reject";
    reason: string;
    evidenceMessageIds: readonly string[];
}

export interface HandRaiseSubmissionV1 {
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

export interface ProtocolSuccessV1<T> extends ProtocolMeta {
    ok: true;
    result: T;
}

export interface ManagerPlanResultV1 {
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

export interface TurnSubmissionResultV1 {
    messageId: string;
    messageSeq: number;
    turnStatus: "running" | "completed" | "truncated";
    nextStepId?: string;
    meetingStatus: LegacyMeetingStatus;
}

export interface HandRaiseResultV1 {
    handRaiseId: string;
    status: "pending" | "accepted" | "deferred" | "consumed" | "rejected";
}

export interface ReassignTurnResultV1 {
    revokedAttemptId: string;
    replacementAttemptId?: string;
    action: "reassign" | "skip";
}

export interface EndMeetingResultV1 {
    status: "completed" | "partial" | "no_consensus" | "cancelled";
    terminationCode: string;
}

export type KnownMeetingProtocolErrorCodeV1 =
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

export type MeetingProtocolErrorCodeV1 = KnownMeetingProtocolErrorCodeV1 | (string & {});

export interface ProtocolErrorV1 {
    protocolVersion: ProtocolVersion;
    ok: false;
    code: MeetingProtocolErrorCodeV1;
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
