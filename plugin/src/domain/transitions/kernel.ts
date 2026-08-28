import { DomainError, invalidStateTransition } from "../errors.js";
import type {
    AttemptStatus,
    AttemptTransitionContext,
    DomainEffect,
    DomainEventType,
    MeetingStatus,
    MeetingTurn,
    ManagerPlanningAttempt,
    ManagerAttemptTransitionContext,
    SpeakerAttempt,
    SpeakerStep,
    StepStatus,
    TransitionResult,
    TurnStatus
} from "../model.js";

export const meetingTransitions: Readonly<Record<MeetingStatus, readonly MeetingStatus[]>> = {
    created: ["running", "paused", "cancelled", "failed"],
    running: [
        "waiting",
        "paused",
        "converging",
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed"
    ],
    waiting: ["running", "paused", "completed", "partial", "no_consensus", "cancelled", "failed"],
    paused: ["running", "waiting", "completed", "partial", "no_consensus", "cancelled", "failed"],
    converging: ["running", "completed", "partial", "no_consensus", "cancelled", "failed"],
    completed: ["archiving"],
    partial: ["archiving"],
    no_consensus: ["archiving"],
    cancelled: ["archiving"],
    failed: ["archiving"],
    archiving: ["archived"],
    archived: []
};

const turnTransitions: Readonly<Record<TurnStatus, readonly TurnStatus[]>> = {
    planned: ["running", "cancelled", "failed"],
    running: ["completed", "truncated", "cancelled", "failed"],
    completed: [],
    truncated: [],
    cancelled: [],
    failed: []
};

const stepTransitions: Readonly<Record<StepStatus, readonly StepStatus[]>> = {
    pending: ["assigned", "skipped"],
    assigned: ["running", "revoked", "failed"],
    running: ["submitted", "revoked", "failed"],
    submitted: [],
    skipped: [],
    revoked: [],
    failed: []
};

const attemptTransitions: Readonly<Record<AttemptStatus, readonly AttemptStatus[]>> = {
    assigned: ["running", "revoked", "failed"],
    running: ["submitted", "revoked", "failed"],
    submitted: [],
    revoked: [],
    failed: []
};

const managerAttemptTransitions: Readonly<
    Record<ManagerPlanningAttempt["status"], readonly ManagerPlanningAttempt["status"][]>
> = {
    pending: ["running", "revoked", "failed"],
    running: ["submitted", "revoked", "failed"],
    submitted: [],
    revoked: [],
    failed: []
};

export function event(type: DomainEventType, payload: Record<string, unknown>): DomainEffect {
    return { events: [{ type, payload }] };
}

export function meetingEventType(from: MeetingStatus, to: MeetingStatus): DomainEventType {
    if (to === "paused") return "meeting.paused";
    if (to === "waiting") return "meeting.waiting";
    if (to === "running") {
        if (from === "created") return "meeting.started";
        return from === "paused" ? "meeting.resumed" : "meeting.replanned";
    }
    if (to === "converging") return "meeting.replanned";
    if (["completed", "partial", "no_consensus", "cancelled", "failed"].includes(to))
        return "meeting.ended";
    if (to === "archiving") return "meeting.archiving";
    if (to === "archived") return "meeting.archived";
    return "meeting.created";
}

function turnEventType(to: TurnStatus): DomainEventType {
    return to === "running" ? "turn.started" : (`turn.${to}` as DomainEventType);
}

function stepEventType(to: StepStatus): DomainEventType {
    if (to === "assigned") return "speaker.assigned";
    if (to === "running") return "speaker.started";
    return `speaker.${to}` as DomainEventType;
}

function attemptEventType(to: AttemptStatus): DomainEventType {
    return to === "running"
        ? "speaker_attempt.started"
        : (`speaker_attempt.${to}` as DomainEventType);
}

function managerPlanEventType(status: ManagerPlanningAttempt["status"]): DomainEventType {
    return status === "running"
        ? "manager_plan.started"
        : (`manager_plan.${status}` as DomainEventType);
}

export function assertTransition<T extends string>(
    entityType: "meeting" | "turn" | "step" | "attempt" | "manager_attempt",
    entityId: string,
    from: T,
    to: T,
    transitions: Readonly<Record<T, readonly T[]>>,
    meetingVersion: number
): void {
    if (!transitions[from].includes(to))
        throw invalidStateTransition(entityType, entityId, from, to, meetingVersion);
}

export function transitionTurn(
    turn: MeetingTurn,
    to: TurnStatus,
    meetingVersion: number
): TransitionResult<MeetingTurn> {
    assertTransition("turn", turn.id, turn.status, to, turnTransitions, meetingVersion);
    return {
        state: { ...turn, status: to },
        effect: event(turnEventType(to), {
            turnId: turn.id,
            from: turn.status,
            to,
            meetingVersion
        })
    };
}

export function transitionStep(
    step: SpeakerStep,
    to: StepStatus,
    meetingVersion: number
): TransitionResult<SpeakerStep> {
    assertTransition("step", step.id, step.status, to, stepTransitions, meetingVersion);
    return {
        state: { ...step, status: to },
        effect: event(stepEventType(to), {
            stepId: step.id,
            from: step.status,
            to,
            meetingVersion
        })
    };
}

export function transitionAttempt(
    attempt: SpeakerAttempt,
    to: AttemptStatus,
    meetingVersion: number,
    context: AttemptTransitionContext
): TransitionResult<SpeakerAttempt> {
    assertTransition(
        "attempt",
        attempt.attemptId,
        attempt.status,
        to,
        attemptTransitions,
        meetingVersion
    );
    if (
        attempt.attemptId !== context.attemptId ||
        attempt.participantId !== context.participantId ||
        attempt.meetingId !== context.meetingId ||
        attempt.turnId !== context.turnId ||
        attempt.stepId !== context.stepId ||
        attempt.deliveryId !== context.deliveryId
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `attempt ${attempt.attemptId} context does not match its submission`,
            { entityType: "attempt", entityId: attempt.attemptId, meetingVersion }
        );
    }
    if (to === "submitted" && attempt.deliveryStatus === "failed") {
        throw new DomainError("INVALID_ENTITY_STATE", `failed delivery cannot be acknowledged`, {
            entityType: "attempt",
            entityId: attempt.attemptId,
            meetingVersion
        });
    }
    const acknowledged =
        to === "submitted" &&
        (attempt.deliveryStatus === "pending" || attempt.deliveryStatus === "accepted");
    return {
        state: {
            ...attempt,
            status: to,
            ...(acknowledged ? { deliveryStatus: "acknowledged" as const } : {})
        },
        effect: event(attemptEventType(to), {
            attemptId: attempt.attemptId,
            from: attempt.status,
            to,
            deliveryStatus: acknowledged ? "acknowledged" : attempt.deliveryStatus,
            meetingVersion
        })
    };
}

export function transitionManagerAttempt(
    attempt: ManagerPlanningAttempt,
    to: ManagerPlanningAttempt["status"],
    meetingVersion: number,
    context: ManagerAttemptTransitionContext
): TransitionResult<ManagerPlanningAttempt> {
    assertTransition(
        "manager_attempt",
        attempt.id,
        attempt.status,
        to,
        managerAttemptTransitions,
        meetingVersion
    );
    if (
        attempt.id !== context.attemptId ||
        attempt.meetingId !== context.meetingId ||
        attempt.deliveryId !== context.deliveryId ||
        (to === "submitted" && attempt.observedMeetingVersion !== meetingVersion)
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `manager attempt ${attempt.id} is stale or bound to another context`,
            { entityType: "manager_attempt", entityId: attempt.id, meetingVersion }
        );
    }
    return {
        state: { ...attempt, status: to },
        effect: event(managerPlanEventType(to), {
            planningAttemptId: attempt.id,
            from: attempt.status,
            to,
            meetingVersion
        })
    };
}
