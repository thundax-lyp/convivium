export type MeetingStatus =
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

export type ExecutionTerminalMeetingStatus =
    "completed" | "partial" | "no_consensus" | "cancelled" | "failed";

export type TurnStatus = "planned" | "running" | "completed" | "truncated" | "cancelled" | "failed";
export type RiskLevel = "low" | "medium" | "high";

export type StepStatus =
    "pending" | "assigned" | "running" | "submitted" | "skipped" | "revoked" | "failed";

export type AttemptStatus = "assigned" | "running" | "submitted" | "revoked" | "failed";

export const DomainEventTypes = [
    "meeting.created",
    "meeting.paused",
    "meeting.waiting",
    "meeting.resumed",
    "meeting.replanned",
    "meeting.ended",
    "meeting.archiving",
    "meeting.archived",
    "meeting.started",
    "turn.planned",
    "turn.started",
    "turn.completed",
    "turn.truncated",
    "turn.cancelled",
    "turn.failed",
    "speaker.assigned",
    "speaker.started",
    "speaker.submitted",
    "speaker.skipped",
    "speaker.revoked",
    "speaker.failed",
    "speaker_attempt.started",
    "speaker_attempt.submitted",
    "speaker_attempt.revoked",
    "speaker_attempt.failed",
    "manager_plan.started",
    "manager_plan.submitted",
    "manager_plan.revoked",
    "manager_plan.failed",
    "message.added",
    "agenda_candidate.added",
    "proposal.added",
    "proposal.revised",
    "position.added",
    "issue.added",
    "question.added",
    "question.answered",
    "completion_fact.added",
    "hand_raise.created",
    "meeting_task.created",
    "meeting_task.queued",
    "meeting_task.started",
    "meeting_task.completed",
    "meeting_task.failed",
    "meeting_task.cancelled",
    "decision.accepted",
    "decision.superseded",
    "decision.revoked",
    "archive.sessions_closed"
] as const;

export type DomainEventType = (typeof DomainEventTypes)[number];

export interface MeetingParticipant {
    id: string;
    sourceMemberName?: string;
    displayName: string;
    role?: string;
    status: "available" | "busy" | "speaking" | "unavailable" | "failed" | "removed";
    consecutiveSpeeches: number;
    consecutiveAttemptFailures: number;
    totalSpeeches: number;
    lastDeliveredSeq: number;
    lastAcknowledgedSeq: number;
}

export interface MeetingManagerRuntime {
    promptVersion: string;
    status: "creating" | "idle" | "planning" | "failed" | "closed";
    currentPlanningAttempt?: ManagerPlanningAttempt;
    lastDecisionMeetingVersion?: number;
}

export interface ManagerPlanningAttempt {
    id: string;
    meetingId: string;
    observedMeetingVersion: number;
    reason:
        | "initial_plan"
        | "next_turn"
        | "semantic_arbitration"
        | "refocus"
        | "stall"
        | "replan"
        | "termination_review";
    deliveryId: string;
    status: "pending" | "running" | "submitted" | "revoked" | "failed";
    createdAt: number;
    deadlineAt?: number;
}

export interface MeetingTurn {
    id: string;
    seq: number;
    agendaItemId: string;
    intent: TurnIntent;
    reason?: TurnConvergenceReason;
    objective: string;
    expectedOutputs: string[];
    prohibitedTopics: string[];
    plan: readonly string[];
    status: TurnStatus;
    currentStepIndex: number;
    steps: SpeakerStep[];
    createdAt: number;
    completedAt?: number;
}

export type TurnConvergenceReason = "manager_fallback" | "refocus" | "replan";

export type TurnIntent =
    | "explore"
    | "clarify"
    | "challenge"
    | "review"
    | "resolve_objection"
    | "synthesize"
    | "decide"
    | "report_task_result"
    | "refocus";

export interface SpeakerStep {
    id: string;
    speaker: string;
    instruction: string;
    reason: SpeakerSelectionReason;
    status: StepStatus;
    attempt?: SpeakerAttempt;
}

export type SpeakerSelectionReason =
    | "explicit_mention"
    | "direct_question"
    | "required_reviewer"
    | "agenda_owner"
    | "task_result_owner"
    | "blocking_objection_owner"
    | "hand_raise"
    | "rule_score"
    | "manager_selected"
    | "round_robin_fallback"
    | "captain_summary";

export interface SpeakerAttempt {
    attemptId: string;
    participantId: string;
    meetingId: string;
    turnId: string;
    stepId: string;
    deliveryId: string;
    contextFromSeq: number;
    contextThroughSeq: number;
    taskSnapshots: MeetingTaskSnapshot[];
    assignedAt: number;
    startedAt?: number;
    completedAt?: number;
    deadlineAt?: number;
    status: AttemptStatus;
    deliveryStatus: "pending" | "accepted" | "acknowledged" | "failed";
}

export interface MeetingTaskSnapshot {
    meetingTaskId: string;
    status: MeetingTaskStatus;
    resultSummary?: string;
    observedAt: number;
}

export type MeetingTaskStatus =
    "requested" | "queued" | "running" | "completed" | "failed" | "cancelled";

export interface MeetingTask {
    meetingTaskId: string;
    participantId: string;
    originatingSpeakerAttemptId: string;
    executionId: string;
    deliveryId: string;
    sourceTurnId: string;
    sourceStepId: string;
    sourceContextFromSeq: number;
    sourceContextThroughSeq: number;
    sourceMessageId?: string;
    sourceMessageSeq?: number;
    title: string;
    description: string;
    blocking: boolean;
    status: MeetingTaskStatus;
    createdAt: number;
    resultSummary?: string;
    failureReason?: string;
    queuedAt?: number;
    startedAt?: number;
    finishedAt?: number;
}

export interface AgendaCandidate {
    id: string;
    proposedBy: string;
    sourceMessageId: string;
    title: string;
    reason: string;
    relationToActiveAgenda: "related" | "adjacent" | "unrelated";
    urgency: "now" | "before_release" | "later";
    suggestedParticipants: string[];
    status: "pending" | "promoted" | "parked" | "rejected";
    createdAt: number;
}

export interface MeetingAgendaItem {
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

export interface MeetingObjectiveContract {
    requiredOutputs: Array<{
        id: string;
        description: string;
        status: "pending" | "ready" | "accepted";
    }>;
    acceptanceCriteria: Array<{ id: string; description: string; satisfied: boolean }>;
    hardConstraints: Array<{ id: string; description: string }>;
    requiredReviewers: string[];
    riskAcceptanceAuthority: string[];
    acceptableRiskLevel: "low" | "medium" | "high";
}

export interface MeetingMessage {
    id: string;
    seq: number;
    turnSeq: number;
    turnId: string;
    stepId: string;
    attemptId: string;
    speaker: string;
    agendaItemId: string;
    agendaRelation:
        "on_topic" | "supporting_context" | "new_topic_candidate" | "blocking_interrupt";
    content: string;
    kind: ArchiveMessage["kind"];
    mentions: readonly string[];
    replyTo?: string;
    taskIds: readonly string[];
    createdAt: number;
}

export interface MeetingIssue {
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
    riskLevel: RiskLevel;
    impact: string;
    urgency: "now" | "before_release" | "later";
    reversibility: "reversible" | "partially_reversible" | "irreversible";
    safeDefaultAvailable: boolean;
    disposition: ArchiveIssue["disposition"];
    status: "open" | "resolved" | "deferred" | "accepted_risk" | "out_of_scope";
    rationale?: string;
    ownerId?: string;
    relatedTaskIds: readonly string[];
}

export interface MeetingProposal {
    id: string;
    title: string;
    description: string;
    proposedBy: string;
    revision: number;
    status: "draft" | "under_review" | "accepted" | "rejected" | "superseded";
    agendaItemId: string;
    positions: readonly {
        id: string;
        participantId: string;
        position: "support" | "accept" | "object" | "needs_revision" | "abstain";
        reason?: string;
        blocking: boolean;
        proposalRevision: number;
    }[];
    createdAt: number;
    updatedAt: number;
}

export interface MeetingDecision {
    id: string;
    proposalId: string;
    proposalRevision: number;
    status: "accepted" | "superseded" | "revoked";
    agendaItemId?: string;
    statement?: string;
    rationale?: string;
    acceptedBy?: readonly string[];
    dissentingPositionIds?: readonly string[];
    acceptanceMode: "deterministic_consensus" | "captain_acceptance" | "authorized_risk_acceptance";
    acceptanceFactIds: readonly string[];
    supersededByDecisionId?: string;
    createdAt: number;
}

export interface MeetingDecisionCandidate {
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

export interface MeetingQuestion {
    id: string;
    text: string;
    askedBy: string;
    directedTo?: string;
    agendaItemId: string;
    blocking: boolean;
    affectedOutputIds: readonly string[];
    affectedCriterionIds: readonly string[];
    violatedConstraintIds: readonly string[];
    status: "open" | "answered" | "withdrawn" | "deferred";
    answerMessageId?: string;
    createdAt: number;
}

export interface MeetingHandRaise {
    id: string;
    participant: string;
    reason:
        | "task_completed"
        | "new_evidence"
        | "answer_ready"
        | "blocking_objection"
        | "correction"
        | "user_requested";
    summary: string;
    taskIds: string[];
    replyToMessageId?: string;
    agendaItemId?: string;
    priority: "normal" | "high" | "blocking";
    createdAt: number;
    status: "pending" | "accepted" | "deferred" | "consumed" | "rejected";
}

export interface CompletionFact {
    id: string;
    kind:
        | "output_evidence"
        | "criterion_evidence"
        | "review"
        | "question_resolution"
        | "agenda_resolution"
        | "risk_acceptance"
        | "decision_acceptance"
        | "decision_supersession"
        | "decision_revocation"
        | "waiver";
    subjectId: string;
    assertedBy: string;
    authority?: string;
    result:
        | "supported"
        | "approved"
        | "changes_required"
        | "accepted"
        | "superseded"
        | "revoked"
        | "rejected"
        | "resolved"
        | "deferred"
        | "waived";
    status: "active" | "superseded" | "revoked";
    evidenceMessageIds: readonly string[];
    taskIds: readonly string[];
    reason?: string;
    createdAt: number;
}

export interface ContinuationMaterial {
    sourceMeetingId: string;
    sourceKind: "final_summary" | "decision" | "issue" | "risk" | "evidence" | "artifact";
    sourceObjectId?: string;
    summary: string;
    checksum?: string;
}

export interface MeetingLimits {
    maxTurns: number;
    maxSpeakersPerTurn: number;
    maxTotalMessages: number;
    maxDurationMs?: number;
    maxConsecutiveSpeechesPerSpeaker: number;
    maxConsecutiveAttemptFailuresPerParticipant: number;
    maxDeliveryRetries: number;
    maxStalls: number;
    maxReplans: number;
    speakerAttemptTimeoutMs?: number;
    mailHandlingTimeoutMs?: number;
}

export type MeetingSelectionMode = "round_robin" | "rule_based" | "manager" | "hybrid";

export interface MeetingTermination {
    code:
        | "objective_satisfied"
        | "captain_accepted"
        | "no_consensus"
        | "stalled"
        | "max_turns"
        | "message_limit"
        | "time_limit"
        | "all_participants_unavailable"
        | "user_cancelled"
        | "internal_error";
    reason: string;
    decisionIds: readonly string[];
    unresolvedQuestionIds: readonly string[];
    dissentingPositionIds: readonly string[];
    blockingAgendaItemIds: readonly string[];
    finalMessage: string;
    endedAt: number;
}

export interface PauseActor {
    kind: "user" | "captain" | "local_host";
    actorId: string;
    displayName?: string;
}

export interface MeetingWaitState {
    reason: string;
    waitingSince: number;
    taskIds: readonly string[];
    participantIds: readonly string[];
    deadlineAt?: number;
    resumeAgendaItemId?: string;
}

export interface ArchiveArtifactRef {
    artifactId: string;
    title: string;
    version?: string;
    checksum?: string;
}

export interface ArchiveParticipantProvenance {
    participantId: string;
    displayName: string;
    role?: string;
    templateVersion?: string;
}

export interface ArchiveDecision {
    id: string;
    agendaItemId?: string;
    proposalId: string;
    proposalRevision: number;
    statement?: string;
    rationale?: string;
    status: "accepted" | "superseded" | "revoked";
    acceptedBy?: readonly string[];
    dissentingPositionIds?: readonly string[];
}

export interface ArchiveProposal {
    id: string;
    agendaItemId: string;
    title: string;
    description: string;
    revision: number;
    status: "draft" | "under_review" | "accepted" | "rejected" | "superseded";
    positions: readonly {
        id: string;
        participantId: string;
        position: "support" | "accept" | "object" | "needs_revision" | "abstain";
        reason?: string;
        blocking: boolean;
        proposalRevision: number;
    }[];
}

export interface ArchiveCompletionFact {
    id: string;
    kind: string;
    subjectId: string;
    assertedBy: string;
    authority?: string;
    result: string;
    evidenceMessageIds: readonly string[];
    taskIds: readonly string[];
    reason?: string;
    status: "active" | "superseded" | "revoked";
}

export interface ArchiveAgendaItem {
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

export interface ArchiveIssue {
    id: string;
    title: string;
    description: string;
    disposition: "blocking" | "follow_up" | "parking_lot" | "accepted_risk" | "out_of_scope";
    status:
        | "open"
        | "waiting"
        | "resolved"
        | "accepted"
        | "deferred"
        | "accepted_risk"
        | "out_of_scope";
    rationale?: string;
    ownerId?: string;
    relatedTaskIds: readonly string[];
}

export interface ArchiveQuestion {
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

export interface ArchiveParkingLotItem {
    id: string;
    title: string;
    reason: string;
    status: "pending" | "promoted" | "parked" | "rejected";
}

export interface ArchiveMessage {
    id: string;
    seq: number;
    turnId: string;
    stepId: string;
    speaker: string;
    agendaItemId: string;
    kind:
        | "statement"
        | "question"
        | "answer"
        | "proposal"
        | "objection"
        | "evidence"
        | "review"
        | "summary"
        | "decision";
    content: string;
    mentions: readonly string[];
    replyTo?: string;
    taskIds: readonly string[];
    createdAt: number;
}

export interface ArchivePackage {
    schemaVersion: 1;
    meetingId: string;
    teamId: string;
    sourceMeetingId?: string;
    objectiveContract: MeetingObjectiveContract;
    finalSummary: string;
    artifactRefs: readonly ArchiveArtifactRef[];
    acceptedDecisions: readonly ArchiveDecision[];
    proposals: readonly ArchiveProposal[];
    completionFacts: readonly ArchiveCompletionFact[];
    agenda: readonly ArchiveAgendaItem[];
    issues: readonly ArchiveIssue[];
    unresolvedQuestions: readonly ArchiveQuestion[];
    parkingLot: readonly ArchiveParkingLotItem[];
    formalTranscript: readonly ArchiveMessage[];
    participantProvenance: ArchiveParticipantProvenance[];
    termination: MeetingTermination;
    endedAt: number;
    materializedAt: number;
}

type DeepReadonly<T> = T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer U)[]
      ? readonly DeepReadonly<U>[]
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type ImmutableArchivePackage = DeepReadonly<ArchivePackage>;

export interface ArchiveRecord {
    readonly package: ImmutableArchivePackage;
    readonly archivedAt?: number;
}

export interface ArchiveInput {
    package: ArchivePackage;
    archivedAt?: number;
}

export interface ArchiveFinalizeInput {
    archivedAt: number;
}

export interface MeetingState {
    id: string;
    teamId: string;
    sourceMeetingId?: string;
    status: MeetingStatus;
    participants: MeetingParticipant[];
    manager: MeetingManagerRuntime;
    agenda: MeetingAgendaItem[];
    topic: string;
    objective: string;
    objectiveContract: MeetingObjectiveContract;
    issues: MeetingIssue[];
    agendaCandidates: AgendaCandidate[];
    activeAgendaItemId?: string;
    transcript: MeetingMessage[];
    proposals: MeetingProposal[];
    decisionCandidates: MeetingDecisionCandidate[];
    decisions: MeetingDecision[];
    openQuestions: MeetingQuestion[];
    handRaises: MeetingHandRaise[];
    meetingTasks: MeetingTask[];
    completionFacts: CompletionFact[];
    artifactRefs: ArchiveArtifactRef[];
    continuationMaterials: ContinuationMaterial[];
    turnSeq: number;
    messageSeq: number;
    eventSeq: number;
    managerPlanningSeq: number;
    progressFingerprint?: string;
    stallCount: number;
    replanCount: number;
    selectionMode: MeetingSelectionMode;
    limits: MeetingLimits;
    version: number;
    createdAt: number;
    updatedAt: number;
    currentTurn?: MeetingTurn;
    termination?: MeetingTermination;
    archive?: ArchiveRecord;
    pausedFromStatus?: "created" | "running" | "waiting";
    pauseReason?: string;
    pausedAt?: number;
    pausedBy?: PauseActor;
    waitState?: MeetingWaitState;
}

export interface TransitionContext {
    now: number;
    reason?: string;
    pause?: { at: number; by: PauseActor };
    wait?: MeetingWaitState;
    termination?: MeetingTermination;
    archive?: ArchiveInput | ArchiveFinalizeInput;
}

export interface AttemptTransitionContext {
    attemptId: string;
    participantId: string;
    meetingId: string;
    turnId: string;
    stepId: string;
    deliveryId: string;
    reason?: string;
}

export interface SpeakerSubmissionContext extends AttemptTransitionContext {
    agendaItemId: string;
    message: Pick<
        MeetingMessage,
        | "id"
        | "content"
        | "kind"
        | "mentions"
        | "replyTo"
        | "taskIds"
        | "agendaRelation"
        | "createdAt"
    >;
}

export interface ManagerAttemptTransitionContext {
    attemptId: string;
    meetingId: string;
    deliveryId: string;
}

export interface DomainEvent {
    type: DomainEventType;
    payload: Record<string, unknown>;
}

export interface DomainEffect {
    events: DomainEvent[];
}

export interface TransitionResult<T> {
    state: T;
    effect: DomainEffect;
}
