import type {
    EpochMs,
    ManagerPlanV1,
    MeetingState,
    OpaqueId,
    RiskLevel
} from "./meeting-state-v1.js";
import { validateMeetingStateV1 } from "./meeting-state-v1-validation.js";

export type TargetDomainActorV1 =
    { kind: "local_controller"; id: OpaqueId } | { kind: "identity"; id: OpaqueId };

export type TargetAgendaInputV1 = {
    id: OpaqueId;
    title: string;
    question: string;
    requiredOutputIds: readonly OpaqueId[];
    requiredReviewerIds: readonly OpaqueId[];
    ownerId?: OpaqueId;
};

export type TargetMeetingActionV1 =
    | { kind: "pause_meeting" | "resume_meeting"; reason: string }
    | {
          kind: "activate_agenda";
          agendaId: OpaqueId;
          previousDisposition: "completed" | "deferred" | "closed";
          reason: string;
      }
    | {
          kind: "raise_agenda_candidate";
          title: string;
          reason: string;
          sourceMessageId?: OpaqueId;
      }
    | {
          kind: "dispose_agenda_candidate";
          candidateId: OpaqueId;
          disposition: "promoted" | "parked" | "rejected";
          reason: string;
          promotedAgenda?: TargetAgendaInputV1;
      }
    | {
          kind: "record_question";
          agendaId: OpaqueId;
          text: string;
          affectedOutputIds: readonly OpaqueId[];
          affectedCriterionIds: readonly OpaqueId[];
          affectedConstraintIds: readonly OpaqueId[];
          blocking: boolean;
      }
    | {
          kind: "resolve_question";
          questionId: OpaqueId;
          status: "answered" | "withdrawn" | "deferred";
          rationale: string;
          evidenceIds: readonly OpaqueId[];
      }
    | {
          kind: "record_issue";
          agendaId: OpaqueId;
          description: string;
          riskLevel: RiskLevel;
          classification: "blocking" | "follow_up" | "pending_discussion" | "out_of_scope";
          affectedOutputIds: readonly OpaqueId[];
          affectedCriterionIds: readonly OpaqueId[];
          affectedConstraintIds: readonly OpaqueId[];
          requiredReviewerIds: readonly OpaqueId[];
          blocking: boolean;
          rationale: string;
      }
    | {
          kind: "dispose_issue";
          issueId: OpaqueId;
          status: "resolved" | "deferred" | "out_of_scope";
          rationale: string;
          evidenceIds: readonly OpaqueId[];
      }
    | {
          kind: "plan_next_step";
          agendaId: OpaqueId;
          planKind: ManagerPlanV1["kind"];
          rationale: string;
          blockingReason?: string;
      };

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

export type TargetDomainFactV1 = {
    id: OpaqueId;
    kind: TargetMeetingActionV1["kind"];
    actorId: OpaqueId;
    occurredAt: EpochMs;
    relatedIds: readonly OpaqueId[];
    payload: TargetDomainFactPayloadV1;
};

export type TargetTransitionResultV1 =
    | { kind: "accepted"; state: MeetingState; facts: readonly [TargetDomainFactV1] }
    | {
          kind: "rejected";
          state: MeetingState;
          code:
              | "INVALID_ARGUMENT"
              | "UNAUTHORIZED"
              | "MEETING_TERMINAL"
              | "NOT_FOUND"
              | "INVALID_STATE"
              | "PRECONDITION_FAILED";
          facts: readonly [];
      };

type RejectionCode =
    | "INVALID_ARGUMENT"
    | "UNAUTHORIZED"
    | "MEETING_TERMINAL"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "PRECONDITION_FAILED";

const invalid = (state: MeetingState, code: RejectionCode): TargetTransitionResultV1 => ({
    kind: "rejected",
    state,
    code,
    facts: []
});

const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;
const validId = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;
const validTime = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function transitionMeetingStateV1(
    state: MeetingState,
    action: TargetMeetingActionV1,
    actor: TargetDomainActorV1,
    now: EpochMs,
    factId: OpaqueId,
    _generatedId?: OpaqueId
): TargetTransitionResultV1 {
    if (
        validateMeetingStateV1(state).kind !== "valid" ||
        !record(action) ||
        !validId(factId) ||
        !validTime(now) ||
        !record(actor) ||
        !["local_controller", "identity"].includes(actor.kind as string) ||
        !validId(actor.id)
    )
        return invalid(state, "INVALID_ARGUMENT");

    if (action.kind !== "pause_meeting" && action.kind !== "resume_meeting")
        return invalid(state, "INVALID_ARGUMENT");
    if (typeof action.reason !== "string" || action.reason.trim().length === 0)
        return invalid(state, "INVALID_ARGUMENT");
    if (actor.kind !== "local_controller") return invalid(state, "UNAUTHORIZED");
    if (["terminal", "archiving", "archived"].includes(state.lifecycle.status))
        return invalid(state, "MEETING_TERMINAL");

    const expected = action.kind === "pause_meeting" ? "running" : "paused";
    const nextStatus = action.kind === "pause_meeting" ? "paused" : "running";
    if (state.lifecycle.status !== expected) return invalid(state, "INVALID_STATE");

    const nextState: MeetingState = {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        lifecycle: {
            ...state.lifecycle,
            status: nextStatus,
            changedAt: now,
            changedBy: actor.id,
            reason: action.reason
        }
    };
    if (validateMeetingStateV1(nextState).kind !== "valid")
        return invalid(state, "PRECONDITION_FAILED");
    const relatedIds = [state.id] as const;
    return {
        kind: "accepted",
        state: nextState,
        facts: [
            {
                id: factId,
                kind: action.kind,
                actorId: actor.id,
                occurredAt: now,
                relatedIds,
                payload: { kind: "references", relatedIds }
            }
        ]
    };
}
