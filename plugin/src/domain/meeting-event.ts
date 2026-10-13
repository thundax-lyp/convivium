export const MEETING_EVENT_LOG_VERSION = 1 as const;
export const MEETING_EVENT_KINDS = [
    "meeting.created",
    "meeting.lifecycle_changed",
    "agenda.activated",
    "agenda_candidate.disposed",
    "manager_plan.recorded",
    "round.opened",
    "round.participation_recorded",
    "hand_raise.recorded",
    "hand_raise.disposed",
    "evidence.submitted",
    "contribution.closed",
    "contribution.failed",
    "evidence_review.claimed",
    "evidence_validation.failed",
    "evidence_review.submitted",
    "review_delivery.recorded",
    "round.published",
    "formal_message.published",
    "round.aborted",
    "identity.recommended",
    "identity.admission_recorded",
    "question.disposed",
    "issue.disposed",
    "risk.disposed",
    "decision.recorded",
    "decision.changed",
    "completion_fact.recorded",
    "completion_fact.changed",
    "meeting.ended",
    "archive.started",
    "archive.completed"
] as const;
export type MeetingEventKind = (typeof MEETING_EVENT_KINDS)[number];
export type MeetingEventActor =
    | { kind: "captain"; actorId: string }
    | { kind: "identity"; actorId: string }
    | { kind: "system" };
export type MeetingEventObjectKind =
    | "meeting"
    | "agenda"
    | "agenda_candidate"
    | "manager_plan"
    | "round"
    | "contribution"
    | "evidence_version"
    | "evidence_review"
    | "review_delivery"
    | "publication"
    | "formal_message"
    | "identity_recommendation"
    | "identity"
    | "question"
    | "issue"
    | "decision"
    | "completion_fact"
    | "risk_disposition"
    | "termination"
    | "archive";
export interface MeetingEventObjectRef {
    kind: MeetingEventObjectKind;
    id: string;
}
export interface MeetingEventDataByKind {
    "meeting.created": Record<string, never>;
    "meeting.lifecycle_changed": {
        from:
            | "preparing"
            | "running"
            | "paused"
            | "converging"
            | "ending"
            | "terminal"
            | "archiving"
            | "archived";
        to:
            | "preparing"
            | "running"
            | "paused"
            | "converging"
            | "ending"
            | "terminal"
            | "archiving"
            | "archived";
        reason?: string;
    };
    "agenda.activated": {
        previousDisposition: "completed" | "deferred" | "closed";
        reason: string;
    };
    "agenda_candidate.disposed": {
        disposition: "promoted" | "parked" | "rejected";
        reason: string;
    };
    "manager_plan.recorded": {
        planKind:
            | "open_round"
            | "continue_agenda"
            | "stop_agenda"
            | "raise_agenda_candidate"
            | "wait_for_required_identity";
        rationale: string;
        blockingReason?: string;
    };
    "round.opened": { deadlineAt?: number };
    "round.participation_recorded":
        | { contributorId: string; status: "declined"; reason: string }
        | { contributorId: string; status: "no_response" };
    "hand_raise.recorded": { contributorId: string; purpose: string };
    "hand_raise.disposed":
        | {
              contributorId: string;
              disposition: "accepted";
              reason: string;
              contributionId: string;
          }
        | {
              contributorId: string;
              disposition: "rejected" | "deferred";
              reason: string;
          };
    "evidence.submitted": { summary: string };
    "contribution.closed": {
        exit: "withdrawn" | "timed_out" | "submission_missing";
        reason: string;
    };
    "contribution.failed": {
        sourceEffectId: string;
        stage: string;
        failureCode: string;
        failureSummary: string;
        attemptCount: number;
        retryable: boolean;
    };
    "evidence_review.claimed": { claimId: string; sourceEffectId: string };
    "evidence_validation.failed": {
        claimId: string;
        reason: "review_timeout" | "review_interrupted" | "dispatch_failed";
    };
    "evidence_review.submitted": { claimId: string; scope: string };
    "review_delivery.recorded": { status: "sent" } | { status: "failed"; failureReason: string };
    "round.published": Record<string, never>;
    "formal_message.published": { messageKind: string };
    "round.aborted": { reason: string };
    "identity.recommended":
        | { decision: "reject"; status: "rejected"; rationale: string }
        | {
              decision: "admit";
              status: "provisioning" | "active";
              rationale: string;
          };
    "identity.admission_recorded": { status: "active" } | { status: "failed"; failureCode: string };
    "question.disposed": {
        status: "answered" | "withdrawn" | "deferred";
        rationale: string;
    };
    "issue.disposed": {
        status: "resolved" | "deferred" | "out_of_scope";
        rationale: string;
    };
    "risk.disposed": {
        action: "accept" | "reject";
        scope: string;
        rationale: string;
    };
    "decision.recorded": { status: "accepted" };
    "decision.changed":
        | { status: "superseded"; rationale: string; replacementDecisionId: string }
        | { status: "revoked"; rationale: string };
    "completion_fact.recorded": {
        outputId: string;
        statement: string;
        rationale: string;
    };
    "completion_fact.changed":
        | { status: "superseded"; rationale: string; replacementFactId: string }
        | { status: "revoked"; rationale: string };
    "meeting.ended": {
        outcome: "completed" | "partial" | "no_consensus" | "cancelled" | "failed";
        reason: string;
    };
    "archive.started": { status: "complete" };
    "archive.completed": { status: "complete" };
}
export interface MeetingEventPayload<K extends MeetingEventKind = MeetingEventKind> {
    logVersion: typeof MEETING_EVENT_LOG_VERSION;
    actor: MeetingEventActor;
    subject: MeetingEventObjectRef;
    relatedObjects: MeetingEventObjectRef[];
    data: MeetingEventDataByKind[K];
}
export type MeetingEventInput = {
    [K in MeetingEventKind]: {
        type: K;
        occurredAt: number;
        payload: MeetingEventPayload<K>;
    };
}[MeetingEventKind];
