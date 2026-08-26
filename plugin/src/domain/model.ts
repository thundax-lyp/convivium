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
    "turn.status_changed",
    "step.status_changed",
    "attempt.status_changed",
    "manager_attempt.status_changed",
    "speaker_attempt.revoked",
    "manager_attempt.revoked"
] as const;

export type DomainEventType = (typeof DomainEventTypes)[number];

export interface MeetingParticipant {
    id: string;
    displayName: string;
    status: "available" | "busy" | "speaking" | "unavailable" | "failed" | "removed";
    consecutiveSpeeches: number;
    consecutiveAttemptFailures: number;
    totalSpeeches: number;
}

export interface MeetingManagerRuntime {
    status: "creating" | "idle" | "planning" | "failed" | "closed";
    currentPlanningAttempt?: ManagerPlanningAttempt;
}

export interface ManagerPlanningAttempt {
    id: string;
    status: "pending" | "running" | "submitted" | "revoked" | "failed";
}

export interface MeetingTurn {
    id: string;
    status: TurnStatus;
    currentStepIndex: number;
    steps: SpeakerStep[];
}

export interface SpeakerStep {
    id: string;
    status: StepStatus;
    attempt?: SpeakerAttempt;
}

export interface SpeakerAttempt {
    attemptId: string;
    meetingId: string;
    turnId: string;
    stepId: string;
    deliveryId: string;
    status: AttemptStatus;
    deliveryStatus: "pending" | "accepted" | "acknowledged" | "failed";
}

export interface MeetingAgendaItem {
    id: string;
    status: "pending" | "discussing" | "waiting" | "resolved" | "deferred" | "blocked";
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
    turnId: string;
    stepId: string;
    attemptId: string;
    speaker: string;
    agendaItemId: string;
    content: string;
}

export interface MeetingIssue {
    id: string;
    title: string;
    description: string;
    blocking: boolean;
    status: "open" | "resolved" | "deferred" | "accepted_risk" | "out_of_scope";
}

export interface MeetingProposal {
    id: string;
    title: string;
    revision: number;
    status: "draft" | "under_review" | "accepted" | "rejected" | "superseded";
}

export interface MeetingDecision {
    id: string;
    proposalId: string;
    proposalRevision: number;
    status: "accepted" | "superseded" | "revoked";
}

export interface MeetingQuestion {
    id: string;
    text: string;
    status: "open" | "answered" | "withdrawn" | "deferred";
}

export interface MeetingHandRaise {
    id: string;
    participant: string;
    status: "pending" | "accepted" | "deferred" | "withdrawn" | "consumed" | "rejected";
}

export interface CompletionFact {
    id: string;
    subjectId: string;
    result:
        | "supported"
        | "approved"
        | "changes_required"
        | "accepted"
        | "rejected"
        | "resolved"
        | "deferred"
        | "waived";
    status: "active" | "superseded" | "revoked";
}

export interface ContinuationMaterial {
    sourceMeetingId: string;
    sourceKind: "final_summary" | "decision" | "issue" | "risk" | "evidence" | "artifact";
    summary: string;
}

export interface MeetingLimits {
    maxTurns: number;
    maxSpeakersPerTurn: number;
    maxMessages: number;
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
    kind: "user" | "captain";
    actorId: string;
    displayName?: string;
}

export interface MeetingWaitState {
    reason: string;
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
    agendaItemId: string;
    proposalId: string;
    proposalRevision: number;
    statement: string;
    rationale: string;
    status: "accepted" | "superseded" | "revoked";
    acceptedBy: readonly string[];
    dissentingPositionIds: readonly string[];
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
    status: "open" | "waiting" | "resolved" | "accepted" | "deferred";
    rationale: string;
    ownerId?: string;
    relatedTaskIds: readonly string[];
}

export interface ArchiveQuestion {
    id: string;
    text: string;
    askedBy: string;
    directedTo?: string;
    agendaItemId: string;
    blocking: boolean;
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
    status: MeetingStatus;
    participants: MeetingParticipant[];
    manager: MeetingManagerRuntime;
    agenda: MeetingAgendaItem[];
    topic: string;
    objective: string;
    objectiveContract: MeetingObjectiveContract;
    issues: MeetingIssue[];
    agendaCandidates: string[];
    transcript: MeetingMessage[];
    proposals: MeetingProposal[];
    decisions: MeetingDecision[];
    openQuestions: MeetingQuestion[];
    handRaises: MeetingHandRaise[];
    completionFacts: CompletionFact[];
    continuationMaterials: ContinuationMaterial[];
    turnSeq: number;
    messageSeq: number;
    eventSeq: number;
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
    waiting?: MeetingWaitState;
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
    meetingId: string;
    turnId: string;
    stepId: string;
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
