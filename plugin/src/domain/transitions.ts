import { DomainError, invalidStateTransition } from "./errors.js";
import type {
    AttemptStatus,
    AttemptTransitionContext,
    ArchiveInput,
    ArchiveRecord,
    DomainEffect,
    DomainEventType,
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

function event(type: DomainEventType, payload: Record<string, unknown>): DomainEffect {
    return { events: [{ type, payload }] };
}

function meetingEventType(from: MeetingStatus, to: MeetingStatus): DomainEventType {
    if (to === "paused") return "meeting.paused";
    if (to === "waiting") return "meeting.waiting";
    if (to === "running") {
        if (from === "created") return "meeting.created";
        return from === "paused" ? "meeting.resumed" : "meeting.replanned";
    }
    if (to === "converging") return "meeting.replanned";
    if (["completed", "partial", "no_consensus", "cancelled", "failed"].includes(to))
        return "meeting.ended";
    if (to === "archiving") return "meeting.archiving";
    if (to === "archived") return "meeting.archived";
    return "meeting.created";
}

function isArchiveInput(archive: TransitionContext["archive"]): archive is ArchiveInput {
    return Boolean(archive && "package" in archive);
}

function revokeActiveAttempts(state: MeetingState): {
    currentTurn: MeetingTurn | undefined;
    manager: MeetingState["manager"];
    events: DomainEffect["events"];
} {
    const events: DomainEffect["events"] = [];
    const currentTurn = state.currentTurn
        ? {
              ...state.currentTurn,
              status:
                  state.currentTurn.status === "planned" || state.currentTurn.status === "running"
                      ? ("truncated" as const)
                      : state.currentTurn.status,
              steps: state.currentTurn.steps.map((step) => {
                  const attempt = step.attempt;
                  if (!attempt || !["assigned", "running"].includes(attempt.status)) return step;
                  events.push({
                      type: "speaker_attempt.revoked",
                      payload: { attemptId: attempt.attemptId, meetingId: state.id }
                  });
                  return {
                      ...step,
                      status: ["assigned", "running"].includes(step.status)
                          ? ("revoked" as const)
                          : step.status,
                      attempt: { ...attempt, status: "revoked" as const }
                  };
              })
          }
        : undefined;
    const planningAttempt = state.manager.currentPlanningAttempt;
    const activePlanning =
        planningAttempt && ["pending", "running"].includes(planningAttempt.status);
    const manager = activePlanning
        ? {
              ...state.manager,
              status: "idle" as const,
              currentPlanningAttempt: { ...planningAttempt, status: "revoked" as const }
          }
        : state.manager;
    if (activePlanning) {
        events.push({
            type: "manager_attempt.revoked",
            payload: { planningAttemptId: planningAttempt.id, meetingId: state.id }
        });
    }
    return { currentTurn, manager, events };
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
        left.decisionIds.length === right.decisionIds.length &&
        left.decisionIds.every((id) => right.decisionIds.includes(id)) &&
        left.unresolvedQuestionIds.length === right.unresolvedQuestionIds.length &&
        left.unresolvedQuestionIds.every((id) => right.unresolvedQuestionIds.includes(id)) &&
        left.dissentingPositionIds.length === right.dissentingPositionIds.length &&
        left.dissentingPositionIds.every((id) => right.dissentingPositionIds.includes(id)) &&
        left.blockingAgendaItemIds.length === right.blockingAgendaItemIds.length &&
        left.blockingAgendaItemIds.every((id) => right.blockingAgendaItemIds.includes(id)) &&
        left.finalMessage === right.finalMessage &&
        left.endedAt === right.endedAt
    );
}

const terminationCodesByStatus: Readonly<Record<MeetingStatus, readonly string[]>> = {
    created: [],
    running: [],
    waiting: [],
    paused: [],
    converging: [],
    completed: ["objective_satisfied"],
    partial: ["captain_accepted", "max_turns", "message_limit", "time_limit"],
    no_consensus: ["no_consensus"],
    cancelled: ["user_cancelled"],
    failed: ["all_participants_unavailable", "internal_error"],
    archiving: [],
    archived: []
};

function snapshotArchive(input: ArchiveInput): ArchiveRecord {
    return {
        package: structuredClone(input.package),
        archivedAt: input.archivedAt
    };
}

function assertArchivePackageMatchesMeeting(state: MeetingState, input: ArchiveInput): void {
    const archivePackage = input.package;
    if (
        archivePackage.meetingId !== state.id ||
        archivePackage.teamId !== state.teamId ||
        !sameTermination(state.termination, archivePackage.termination)
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `archive facts do not belong to meeting ${state.id}`,
            {
                entityType: "meeting",
                entityId: state.id,
                to: "archiving",
                meetingVersion: state.version
            }
        );
    }
    if (
        archivePackage.termination.decisionIds.some(
            (id) => !state.decisions.some((decision) => decision.id === id)
        ) ||
        archivePackage.termination.unresolvedQuestionIds.some(
            (id) => !state.openQuestions.some((question) => question.id === id)
        )
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `archive references facts outside meeting ${state.id}`,
            {
                entityType: "meeting",
                entityId: state.id,
                to: "archiving",
                meetingVersion: state.version
            }
        );
    }
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

    if (context.archive && to !== "archiving" && to !== "archived") {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `archive is only valid when materializing or finalizing archived`,
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
        if (!terminationCodesByStatus[to].includes(context.termination.code)) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                `termination code ${context.termination.code} does not match ${to}`,
                { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
            );
        }
        if (
            context.termination.decisionIds.some(
                (id) => !state.decisions.some((decision) => decision.id === id)
            ) ||
            context.termination.unresolvedQuestionIds.some(
                (id) => !state.openQuestions.some((question) => question.id === id)
            )
        ) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                `termination references facts outside meeting ${state.id}`,
                { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
            );
        }
    }

    if (to === "paused") {
        requireReason(context, state, to);
        if (!context.pause) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                `meeting ${state.id} requires pause actor metadata`,
                { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
            );
        }
    }
    const pause = context.pause;

    if (
        to === "archiving" &&
        (!isArchiveInput(context.archive) || context.archive.archivedAt !== undefined)
    ) {
        throw new DomainError(
            "MISSING_ARCHIVE",
            `meeting ${state.id} requires a materialized archive`,
            { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
        );
    }
    if (to === "archiving" && isArchiveInput(context.archive)) {
        assertArchivePackageMatchesMeeting(state, context.archive);
    }

    if (
        to === "archived" &&
        (!state.archive?.package || context.archive?.archivedAt === undefined)
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
        const archivePackage = isArchiveInput(context.archive)
            ? context.archive.package
            : state.archive?.package;
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

    const pausedWork = to === "paused" ? revokeActiveAttempts(state) : undefined;
    const next: MeetingState = {
        ...state,
        status: to,
        version: state.version + 1,
        updatedAt: context.now,
        ...(to === "paused"
            ? {
                  pausedFromStatus: state.status as "created" | "running" | "waiting",
                  pauseReason: context.reason,
                  pausedAt: pause?.at,
                  pausedBy: pause ? { ...pause.by } : undefined
              }
            : {}),
        ...(context.termination ? { termination: structuredClone(context.termination) } : {}),
        ...(pausedWork ? { currentTurn: pausedWork.currentTurn, manager: pausedWork.manager } : {}),
        ...(to === "archiving" && isArchiveInput(context.archive)
            ? { archive: snapshotArchive(context.archive) }
            : {}),
        ...(to === "archived" && state.archive?.package
            ? {
                  archive: {
                      package: state.archive.package,
                      archivedAt: context.archive?.archivedAt
                  }
              }
            : {})
    };

    return {
        state: next,
        effect: {
            events: [
                {
                    type: meetingEventType(state.status, to),
                    payload: {
                        meetingId: state.id,
                        from: state.status,
                        to,
                        meetingVersion: next.version,
                        reason: context.reason
                    }
                },
                ...(pausedWork?.events ?? [])
            ]
        }
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
        effect: event("attempt.status_changed", {
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
