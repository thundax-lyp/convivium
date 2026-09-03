import type { ApplyCompletionClaimsContext } from "../completion.js";
import type { ManagerPlanningAttempt, SpeakerSubmissionContext } from "../model.js";

export interface StartManagerPlanningContext {
    meetingId: string;
    planningAttemptId: string;
    deliveryId: string;
    reason: ManagerPlanningAttempt["reason"];
    now: number;
    allowRunningRestart?: boolean;
}

export interface SubmitManagerPlanContext {
    meetingId: string;
    planningAttemptId: string;
    deliveryId: string;
    observedMeetingVersion: number;
    dispatchableParticipantIds: readonly string[];
    now: number;
}

export interface SubmitSpeakerAdvanceContext extends SpeakerSubmissionContext {
    now: number;
    nextPlanningAttemptId: string;
    nextPlanningDeliveryId: string;
    issues?: readonly SubmittedIssueInput[];
    proposals?: readonly SubmittedProposalInput[];
    positions?: readonly SubmittedPositionInput[];
    agendaCandidates?: readonly SubmittedAgendaCandidateInput[];
    decisionCandidates?: readonly SubmittedDecisionCandidateInput[];
    questions: readonly SubmittedQuestionInput[];
    completion?: Omit<ApplyCompletionClaimsContext, "participantId" | "now">;
}

export interface SubmittedDecisionCandidateInput {
    id: string;
    proposalId: string;
    proposalRevision: number;
    statement: string;
    rationale: string;
    sourceMessageId: string;
    agendaItemId: string;
    createdAt: number;
}

export interface SubmittedAgendaCandidateInput {
    id: string;
    title: string;
    reason: string;
    relationToActiveAgenda: "related" | "adjacent" | "unrelated";
    urgency: "now" | "before_release" | "later";
    suggestedParticipants: readonly string[];
    now: number;
}

export interface SubmittedProposalInput {
    id: string;
    proposalId?: string;
    expectedRevision?: number;
    title: string;
    description: string;
    now: number;
}

export interface SubmittedPositionInput {
    id: string;
    proposalId: string;
    proposalRevision: number;
    position: "support" | "accept" | "object" | "needs_revision" | "abstain";
    reason?: string;
    blocking: boolean;
    now: number;
}

export interface SubmittedIssueInput {
    id: string;
    title: string;
    description: string;
    affectedOutputIds: readonly string[];
    affectedCriterionIds: readonly string[];
    violatedConstraintIds: readonly string[];
    impact: string;
    urgency: "now" | "before_release" | "later";
    safeDefaultAvailable: boolean;
    riskLevel: "low" | "medium" | "high";
}

export interface SubmittedQuestionInput {
    id: string;
    text: string;
    directedTo?: string;
    blocking: boolean;
    affectedOutputIds?: readonly string[];
    affectedCriterionIds?: readonly string[];
    violatedConstraintIds?: readonly string[];
    createdAt: number;
}
