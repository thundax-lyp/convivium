import type {
    AgentRoleDefinitionIdV1,
    MeetingTaskProjectionV1,
    PublicAgendaItemV1,
    PublicBlockingFactV1,
    PublicContinuationMaterialV1,
    PublicDecisionCandidateV1,
    PublicDecisionV1,
    PublicHandRaiseV1,
    PublicMeetingLimitsV1,
    PublicMeetingMessageV1,
    PublicObjectiveContractV1,
    PublicQuestionV1,
    PublicRiskV1,
    PublicTurnV1
} from "./types.js";
import type { ContributionSummaryV1 } from "./contribution-types.js";

export interface PublicTerminationV1 {
    code: string;
    reason: string;
    decisionIds: readonly string[];
    unresolvedQuestionIds: readonly string[];
}

export interface PublicExecutionTerminationV1 extends PublicTerminationV1 {
    dissentingPositionIds: readonly string[];
    blockingAgendaItemIds: readonly string[];
    finalMessage: string;
    endedAt: number;
}

export interface MeetingStatusBaseV1 {
    contributions?: { reviewerId: string; tasks: readonly ContributionSummaryV1[] };
    meetingId: string;
    meetingVersion: number;
    topic: string;
    objective: string;
    continuationMaterials: readonly PublicContinuationMaterialV1[];
    limits: PublicMeetingLimitsV1;
    meetingTasks: readonly MeetingTaskProjectionV1[];
}

export interface DiscussionMeetingStatusBaseV1 extends MeetingStatusBaseV1 {
    activeAgendaItem?: PublicAgendaItemV1;
    messages: readonly PublicMeetingMessageV1[];
    questions?: readonly PublicQuestionV1[];
    proposals: readonly PublicProposalV1[];
    pendingDecisionCandidates: readonly PublicDecisionCandidateV1[];
    acceptedDecisions: readonly PublicDecisionV1[];
    decisionHistory: readonly PublicDecisionV1[];
    risks: readonly PublicRiskV1[];
    blockingFacts: readonly PublicBlockingFactV1[];
    parkingLot: readonly PublicArchiveAgendaCandidateV1[];
}

export interface PublicMeetingWaitStateV1 {
    reason: "blocking_task" | "required_participant_unavailable" | "captain_action";
    waitingSince: number;
    taskIds: readonly string[];
    participantIds: readonly string[];
    deadlineAt?: number;
    resumeAgendaItemId?: string;
}

export interface ActiveMeetingStatusResultV1 extends DiscussionMeetingStatusBaseV1 {
    status: "created" | "running" | "waiting" | "paused" | "converging";
    stallCount: number;
    maxStalls: number;
    replanCount: number;
    maxReplans: number;
    currentTurn?: PublicTurnV1;
    currentSpeakerId?: string;
    currentAttemptId?: string;
    pendingHandRaises: readonly PublicHandRaiseV1[];
    waitState?: PublicMeetingWaitStateV1;
    pauseControl: {
        action: "pause" | "resume" | "none";
        pausedAt?: number;
        pausedBy?: {
            kind: "user" | "captain" | "local_host";
            actorId: string;
            displayName?: string;
        };
        reason?: string;
    };
    termination?: never;
    archive?: never;
}

export interface ExecutionTerminalMeetingStatusResultV1 extends DiscussionMeetingStatusBaseV1 {
    status: "completed" | "partial" | "no_consensus" | "cancelled" | "failed";
    currentTurn?: never;
    currentSpeakerId?: never;
    currentAttemptId?: never;
    pendingHandRaises: readonly [];
    pauseControl: { action: "none" };
    termination: PublicExecutionTerminationV1;
    completionFactIds: readonly string[];
    archive?: never;
}

export interface PublicArtifactRefV1 {
    artifactId: string;
    title: string;
    version?: string;
    checksum?: string;
    sourceTaskId?: string;
    uri?: string;
}

export interface PublicProposalV1 {
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

export type PublicArchiveProposalV1 = PublicProposalV1;

export interface PublicArchiveCompletionFactV1 {
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

export interface PublicArchiveIssueV1 {
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

export interface PublicArchiveAgendaCandidateV1 {
    id: string;
    title: string;
    reason: string;
    status: "pending" | "promoted" | "parked" | "rejected";
}

export interface PublicArchiveAttendanceRejectionV1 {
    recommendationId: string;
    candidateId: string;
    roleDefinitionId: AgentRoleDefinitionIdV1;
    displayName: string;
    agendaItemId: string;
    reason: string;
    rejectedAt: number;
}

export interface PublicArchivePackageV1 {
    attendanceRejections?: readonly PublicArchiveAttendanceRejectionV1[];
    schemaVersion: 1;
    meetingId: string;
    teamId: string;
    sourceMeetingId?: string;
    objectiveContract: PublicObjectiveContractV1;
    finalSummary: string;
    artifactRefs: readonly PublicArtifactRefV1[];
    acceptedDecisions: readonly PublicDecisionV1[];
    decisionHistory: readonly PublicDecisionV1[];
    proposals: readonly PublicArchiveProposalV1[];
    completionFacts: readonly PublicArchiveCompletionFactV1[];
    agenda: readonly PublicAgendaItemV1[];
    issues: readonly PublicArchiveIssueV1[];
    unresolvedQuestions: readonly PublicQuestionV1[];
    parkingLot: readonly PublicArchiveAgendaCandidateV1[];
    formalTranscript: readonly PublicMeetingMessageV1[];
    participantProvenance: readonly {
        participantId: string;
        displayName: string;
        role?: string;
        templateVersion?: string;
    }[];
    termination: PublicTerminationV1;
    endedAt: number;
    materializedAt: number;
}

export interface PublicMaterializedArchiveRecordV1 {
    package: PublicArchivePackageV1;
    archivedAt?: never;
}

export interface PublicCompletedArchiveRecordV1 {
    package: PublicArchivePackageV1;
    archivedAt: number;
}

export interface ArchivingMeetingStatusResultV1 extends MeetingStatusBaseV1 {
    status: "archiving";
    currentTurn?: never;
    currentSpeakerId?: never;
    currentAttemptId?: never;
    pendingHandRaises: readonly [];
    pauseControl: { action: "none" };
    termination: PublicTerminationV1;
    archive: PublicMaterializedArchiveRecordV1;
}

export interface ArchivedMeetingStatusResultV1 extends MeetingStatusBaseV1 {
    status: "archived";
    currentTurn?: never;
    currentSpeakerId?: never;
    currentAttemptId?: never;
    pendingHandRaises: readonly [];
    pauseControl: { action: "none" };
    termination: PublicTerminationV1;
    archive: PublicCompletedArchiveRecordV1;
}

export type MeetingStatusResultV1 =
    | ActiveMeetingStatusResultV1
    | ExecutionTerminalMeetingStatusResultV1
    | ArchivingMeetingStatusResultV1
    | ArchivedMeetingStatusResultV1;
