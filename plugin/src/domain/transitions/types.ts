import type { ApplyCompletionClaimsContext } from "../completion.js";
import type { ManagerPlanningAttempt, SpeakerSubmissionContext } from "../model.js";

export interface StartManagerPlanningContext {
    meetingId: string;
    planningAttemptId: string;
    deliveryId: string;
    reason: ManagerPlanningAttempt["reason"];
    now: number;
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
    questions: readonly SubmittedQuestionInput[];
    completion?: Omit<ApplyCompletionClaimsContext, "participantId" | "now">;
}

export interface SubmittedQuestionInput {
    id: string;
    text: string;
    directedTo?: string;
    blocking: boolean;
    createdAt: number;
}
