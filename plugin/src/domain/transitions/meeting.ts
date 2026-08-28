import { DomainError } from "../errors.js";
import type {
    ArchiveInput,
    DomainEffect,
    MeetingState,
    MeetingStatus,
    MeetingTurn,
    TransitionContext,
    TransitionResult
} from "../model.js";
import { assertArchivePackageMatchesMeeting, sameTermination, snapshotArchive } from "./archive.js";
import { cancelRequestedMeetingTasksForAttempts } from "../meeting-task.js";
import {
    assertCompletionReady,
    terminationCodesByStatus,
    terminationReferencesBelongToMeeting
} from "./meeting-guards.js";
import { assertTransition, meetingEventType, meetingTransitions } from "./kernel.js";

function isArchiveInput(archive: TransitionContext["archive"]): archive is ArchiveInput {
    return Boolean(archive && "package" in archive);
}

function revokeActiveAttempts(
    state: MeetingState,
    emitTurnLifecycleEvent = false
): {
    currentTurn: MeetingTurn | undefined;
    manager: MeetingState["manager"];
    events: DomainEffect["events"];
    revokedSpeakerAttemptIds: string[];
} {
    const events: DomainEffect["events"] = [];
    const revokedSpeakerAttemptIds: string[] = [];
    const currentTurn = state.currentTurn
        ? {
              ...state.currentTurn,
              status:
                  state.currentTurn.status === "planned"
                      ? ("cancelled" as const)
                      : state.currentTurn.status === "running"
                        ? ("truncated" as const)
                        : state.currentTurn.status,
              steps: state.currentTurn.steps.map((step) => {
                  const attempt = step.attempt;
                  if (!attempt || !["assigned", "running"].includes(attempt.status)) return step;
                  events.push({
                      type: "speaker_attempt.revoked",
                      payload: { attemptId: attempt.attemptId, meetingId: state.id }
                  });
                  revokedSpeakerAttemptIds.push(attempt.attemptId);
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
    if (
        emitTurnLifecycleEvent &&
        state.currentTurn !== undefined &&
        (state.currentTurn.status === "planned" || state.currentTurn.status === "running")
    ) {
        events.push({
            type: state.currentTurn.status === "planned" ? "turn.cancelled" : "turn.truncated",
            payload: {
                meetingId: state.id,
                turnId: state.currentTurn.id,
                meetingVersion: state.version + 1
            }
        });
    }
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
            type: "manager_plan.revoked",
            payload: { planningAttemptId: planningAttempt.id, meetingId: state.id }
        });
    }
    return { currentTurn, manager, events, revokedSpeakerAttemptIds };
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
        if (!terminationReferencesBelongToMeeting(state, context.termination)) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                `termination references facts outside meeting ${state.id}`,
                { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
            );
        }
        assertCompletionReady(state, to);
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

    if (to === "waiting" && (!context.wait || !context.wait.reason.trim())) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} requires wait metadata`,
            { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
        );
    }
    const resumingFromPause = state.status === "paused" && (to === "running" || to === "waiting");
    const lifecycleCleanup =
        to === "paused" || to === "archiving" || isExecutionTerminal
            ? revokeActiveAttempts(state, isExecutionTerminal || to === "archiving")
            : undefined;
    const requestedTaskCleanup =
        to === "paused" && lifecycleCleanup
            ? cancelRequestedMeetingTasksForAttempts(
                  state,
                  lifecycleCleanup.revokedSpeakerAttemptIds,
                  context.now
              )
            : undefined;
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
        ...(lifecycleCleanup
            ? { currentTurn: lifecycleCleanup.currentTurn, manager: lifecycleCleanup.manager }
            : {}),
        ...(requestedTaskCleanup ? { meetingTasks: requestedTaskCleanup.state.meetingTasks } : {}),
        ...(resumingFromPause
            ? {
                  currentTurn: undefined,
                  manager: {
                      ...state.manager,
                      status: "idle" as const,
                      currentPlanningAttempt: undefined
                  }
              }
            : {}),
        ...(isExecutionTerminal ? { currentTurn: undefined } : {}),
        ...(to === "waiting" && context.wait
            ? { waitState: structuredClone(context.wait) }
            : { waitState: undefined }),
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
                ...(lifecycleCleanup?.events ?? []),
                ...(requestedTaskCleanup?.effect.events ?? [])
            ]
        }
    };
}
