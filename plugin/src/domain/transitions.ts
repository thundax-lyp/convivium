import { DomainError, invalidStateTransition } from "./errors.js";
import type {
    AttemptStatus,
    ArchiveInput,
    ArchiveRecord,
    DomainEffect,
    MeetingState,
    MeetingStatus,
    MeetingTurn,
    ManagerPlanningAttempt,
    SpeakerAttempt,
    SpeakerStep,
    StepStatus,
    TransitionContext,
    TransitionResult,
    TurnStatus
} from "./model.js";

const meetingTransitions: Readonly<Record<MeetingStatus, readonly MeetingStatus[]>> = {
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
    waiting: ["running", "paused", "partial", "cancelled", "failed"],
    paused: ["running", "waiting", "cancelled", "failed"],
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

function event(type: string, payload: Record<string, unknown>): DomainEffect {
    return { events: [{ type, payload }] };
}

function assertTransition<T extends string>(
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

function requireReason(context: TransitionContext, state: MeetingState, to: MeetingStatus): string {
    if (!context.reason?.trim()) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} requires a reason for ${to}`,
            {
                entityType: "meeting",
                entityId: state.id,
                to,
                meetingVersion: state.version
            }
        );
    }
    return context.reason;
}

function sameTermination(
    left: MeetingState["termination"],
    right: MeetingState["termination"]
): boolean {
    return (
        left !== undefined &&
        right !== undefined &&
        left.code === right.code &&
        left.reason === right.reason &&
        left.endedAt === right.endedAt
    );
}

function snapshotArchive(input: ArchiveInput): ArchiveRecord {
    return {
        package: structuredClone(input.package),
        archivedAt: input.archivedAt
    };
}

export function transitionMeeting(
    state: MeetingState,
    to: MeetingStatus,
    context: TransitionContext
): TransitionResult<MeetingState> {
    assertTransition("meeting", state.id, state.status, to, meetingTransitions, state.version);

    const isExecutionTerminal = [
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed"
    ].includes(to);

    if (context.termination && !isExecutionTerminal) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `termination is only valid for execution terminal states`,
            {
                entityType: "meeting",
                entityId: state.id,
                to,
                meetingVersion: state.version
            }
        );
    }

    if (context.archive && to !== "archived") {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `archive is only valid when entering archived`,
            {
                entityType: "meeting",
                entityId: state.id,
                to,
                meetingVersion: state.version
            }
        );
    }

    if (isExecutionTerminal) {
        if (!context.termination) {
            throw new DomainError(
                "MISSING_TERMINATION",
                `meeting ${state.id} requires termination details`,
                {
                    entityType: "meeting",
                    entityId: state.id,
                    to,
                    meetingVersion: state.version
                }
            );
        }
    }

    if (to === "paused") requireReason(context, state, to);

    if (
        to === "archived" &&
        (!context.archive?.package || context.archive.archivedAt === undefined)
    ) {
        throw new DomainError(
            "MISSING_ARCHIVE",
            `meeting ${state.id} requires a materialized archive`,
            {
                entityType: "meeting",
                entityId: state.id,
                to,
                meetingVersion: state.version
            }
        );
    }

    if (to === "archived") {
        const archivePackage = context.archive?.package;
        if (
            archivePackage?.meetingId !== state.id ||
            archivePackage.teamId !== state.teamId ||
            !sameTermination(state.termination, archivePackage.termination)
        ) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                `archive facts do not belong to meeting ${state.id}`,
                {
                    entityType: "meeting",
                    entityId: state.id,
                    to,
                    meetingVersion: state.version
                }
            );
        }
    }

    const next: MeetingState = {
        ...state,
        status: to,
        version: state.version + 1,
        updatedAt: context.now,
        ...(to === "paused"
            ? {
                  pausedFromStatus: state.status as "created" | "running" | "waiting",
                  pauseReason: context.reason
              }
            : {}),
        ...(context.termination ? { termination: context.termination } : {}),
        ...(context.archive ? { archive: snapshotArchive(context.archive) } : {})
    };

    return {
        state: next,
        effect: event("meeting.status_changed", {
            meetingId: state.id,
            from: state.status,
            to,
            meetingVersion: next.version,
            reason: context.reason
        })
    };
}

export function transitionTurn(
    turn: MeetingTurn,
    to: TurnStatus,
    meetingVersion: number
): TransitionResult<MeetingTurn> {
    assertTransition("turn", turn.id, turn.status, to, turnTransitions, meetingVersion);
    return {
        state: { ...turn, status: to },
        effect: event("turn.status_changed", {
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
        effect: event("step.status_changed", {
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
    meetingVersion: number
): TransitionResult<SpeakerAttempt> {
    assertTransition(
        "attempt",
        attempt.attemptId,
        attempt.status,
        to,
        attemptTransitions,
        meetingVersion
    );
    return {
        state: { ...attempt, status: to },
        effect: event("attempt.status_changed", {
            attemptId: attempt.attemptId,
            from: attempt.status,
            to,
            meetingVersion
        })
    };
}

export function transitionManagerAttempt(
    attempt: ManagerPlanningAttempt,
    to: ManagerPlanningAttempt["status"],
    meetingVersion: number
): TransitionResult<ManagerPlanningAttempt> {
    assertTransition(
        "manager_attempt",
        attempt.id,
        attempt.status,
        to,
        managerAttemptTransitions,
        meetingVersion
    );
    return {
        state: { ...attempt, status: to },
        effect: event("manager_attempt.status_changed", {
            planningAttemptId: attempt.id,
            from: attempt.status,
            to,
            meetingVersion
        })
    };
}
