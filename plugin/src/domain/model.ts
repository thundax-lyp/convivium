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
    status: AttemptStatus;
    deliveryStatus: "pending" | "accepted" | "acknowledged" | "failed";
}

export interface MeetingAgendaItem {
    id: string;
    status: "pending" | "discussing" | "waiting" | "resolved" | "deferred" | "blocked";
}

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
    endedAt: number;
}

export interface ArchiveRecord {
    archivedAt?: number;
    packageMaterialized: boolean;
}

export interface MeetingState {
    id: string;
    teamId: string;
    status: MeetingStatus;
    participants: MeetingParticipant[];
    manager: MeetingManagerRuntime;
    agenda: MeetingAgendaItem[];
    version: number;
    createdAt: number;
    updatedAt: number;
    currentTurn?: MeetingTurn;
    termination?: MeetingTermination;
    archive?: ArchiveRecord;
    pausedFromStatus?: "created" | "running" | "waiting";
    pauseReason?: string;
}

export interface TransitionContext {
    now: number;
    reason?: string;
    termination?: MeetingTermination;
    archive?: ArchiveRecord;
}

export interface DomainEvent {
    type: string;
    payload: Record<string, unknown>;
}

export interface DomainEffect {
    events: DomainEvent[];
}

export interface TransitionResult<T> {
    state: T;
    effect: DomainEffect;
}
