import { createHash } from "node:crypto";
import {
    createHandRaise,
    createMeetingTask as createMeetingTaskTransition,
    finishMeetingTask as finishMeetingTaskTransition,
    isParticipantDispatchableNow,
    needsSemanticArbitration,
    nextManagerPlanningIds,
    planRoundRobinTurn,
    planRuleBasedTurn,
    rankRulePlanningCandidates,
    requiredPlanningBlockers,
    isMeetingStateV2,
    startManagerPlanning,
    startMeetingTask as startMeetingTaskTransition,
    type MeetingState
} from "../../domain/index.js";
import type {
    MeetingTaskFinishInputV1,
    MeetingTaskFinishResultV1,
    MeetingTaskRequestV1,
    MeetingTaskResultV1,
    MeetingTaskStartInputV1,
    MeetingTaskStartResultV1,
    MeetingTaskStatusInputV1,
    MeetingTaskStatusResultV1
} from "../../protocol/index.js";
import type { DomainEventInput, JsonObject } from "../meeting-runtime.js";
import { assignTurnAttempt } from "./meeting-turn.js";
import {
    commandFailure as failure,
    commandSuccess as success,
    mapCommandError as commandError
} from "../services/command-result-service.js";
import type { MeetingRehydrationService } from "../services/meeting-recovery-service.js";
import { readAuthorizedMeetingTask } from "../services/meeting-session-service.js";
import type { CreateStatusRuntimeOptions, MeetingToolRuntime } from "./index.js";
import type { StoredMeeting } from "./types.js";
import { captureManagerCatalogBinding } from "../services/agent-catalog.js";

function meetingTaskId(participantId: string, requestId: string): string {
    return `meeting-task-${createHash("sha256")
        .update(`${participantId}\0${requestId}`)
        .digest("hex")
        .slice(0, 32)}`;
}

export interface MeetingTaskApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
}

export function createMeetingTaskApplication(dependencies: MeetingTaskApplicationOptions) {
    const { options, meetings, recovery } = dependencies;
    const application: Pick<
        MeetingToolRuntime,
        "createMeetingTask" | "meetingTaskStatus" | "startMeetingTask" | "finishMeetingTask"
    > = {
        async createMeetingTask(input: MeetingTaskRequestV1, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            if (caller.kind !== "participant" || caller.participantId === undefined) {
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "Only the owning Participant can create a MeetingTask."
                );
            }
            if (caller.meetingId !== input.meetingId) {
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "Only the matching Participant can create a MeetingTask."
                );
            }
            const taskId = meetingTaskId(caller.participantId, input.requestId);
            try {
                const current = await stored.repository.read();
                const currentState = current.state as unknown as MeetingState;
                const currentAttempt =
                    currentState.currentTurn?.steps[currentState.currentTurn.currentStepIndex]
                        ?.attempt;
                if (
                    currentAttempt?.attemptId !== input.attemptId ||
                    currentAttempt.participantId !== caller.participantId ||
                    currentAttempt.status !== "running"
                ) {
                    return failure(
                        "STALE_ATTEMPT",
                        "The MeetingTask must be created by the current Participant attempt."
                    );
                }
                const committed = await stored.repository.execute({
                    requestId: input.requestId,
                    commandKind: "create_meeting_task",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `participant:${caller.sessionId}`,
                        attemptId: input.attemptId
                    },
                    requestHash: JSON.stringify(input),
                    expectedMeetingVersion: current.version,
                    transition: (snapshot) => {
                        const snapshotState = snapshot.state as unknown as MeetingState;
                        const attempt =
                            snapshotState.currentTurn?.steps[
                                snapshotState.currentTurn.currentStepIndex
                            ]?.attempt;
                        if (
                            attempt?.attemptId !== input.attemptId ||
                            attempt.participantId !== caller.participantId ||
                            attempt.status !== "running"
                        ) {
                            throw new Error(
                                "MeetingTask creation requires the current Participant attempt."
                            );
                        }
                        const transition = createMeetingTaskTransition(
                            snapshot.state as unknown as MeetingState,
                            {
                                meetingTaskId: taskId,
                                executionId: `${taskId}-execution`,
                                deliveryId: `${taskId}-delivery`,
                                participantId: caller.participantId!,
                                originatingSpeakerAttemptId: input.attemptId,
                                sourceTurnId: attempt.turnId,
                                sourceStepId: attempt.stepId,
                                sourceContextFromSeq: attempt.contextFromSeq,
                                sourceContextThroughSeq: attempt.contextThroughSeq,
                                title: input.title,
                                description: input.description,
                                blocking: input.blocking,
                                now: options.now?.() ?? Date.now()
                            }
                        );
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: {
                                requestId: input.requestId,
                                meetingTaskId: taskId,
                                participantId: caller.participantId!,
                                originatingSpeakerAttemptId: input.attemptId,
                                status: "requested"
                            } satisfies MeetingTaskResultV1,
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox: []
                        };
                    }
                });
                return success(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as MeetingTaskResultV1
                );
            } catch (error) {
                return commandError(
                    error,
                    "INVALID_ENTITY_STATE",
                    "The MeetingTask could not be created.",
                    { meetingId: input.meetingId }
                );
            }
        },

        async meetingTaskStatus(input: MeetingTaskStatusInputV1, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            const authorized = await readAuthorizedMeetingTask(
                stored.repository,
                caller,
                input.meetingTaskId
            );
            if (authorized === undefined)
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "The caller is not authorized for this MeetingTask."
                );
            const { state, recovered } = authorized;
            const task = authorized.task;
            const meetingTerminal = [
                "completed",
                "partial",
                "no_consensus",
                "cancelled",
                "failed",
                "archiving",
                "archived"
            ].includes(state.status);
            const projection = {
                meetingTaskId: task.meetingTaskId,
                participantId: task.participantId,
                title: task.title,
                blocking: task.blocking,
                status: task.status,
                ...(task.resultSummary === undefined ? {} : { resultSummary: task.resultSummary }),
                ...(task.failureReason === undefined ? {} : { failureReason: task.failureReason }),
                createdAt: task.createdAt,
                ...(task.queuedAt === undefined ? {} : { queuedAt: task.queuedAt }),
                ...(task.startedAt === undefined ? {} : { startedAt: task.startedAt }),
                ...(task.finishedAt === undefined ? {} : { finishedAt: task.finishedAt })
            };
            return success<MeetingTaskStatusResultV1>(
                input.meetingId,
                recovered.snapshot?.version ?? 0,
                {
                    task: projection,
                    observedMeetingVersion: recovered.snapshot?.version ?? 0,
                    meetingTerminal,
                    mayExecute: !meetingTerminal && task.status === "running"
                }
            );
        },

        async startMeetingTask(input: MeetingTaskStartInputV1, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            const authorized = await readAuthorizedMeetingTask(
                stored.repository,
                caller,
                input.meetingTaskId
            );
            if (authorized === undefined)
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "The caller is not authorized for this MeetingTask."
                );
            try {
                const taskNow = options.now?.() ?? Date.now();
                const currentForPlanning = await stored.repository.read();
                const previewTask = startMeetingTaskTransition(
                    currentForPlanning.state as unknown as MeetingState,
                    input.meetingTaskId,
                    taskNow
                );
                const previewState = previewTask.state as unknown as MeetingState;
                const previewWillPlan =
                    previewState.manager.currentPlanningAttempt !== undefined &&
                    previewState.manager.currentPlanningAttempt.observedMeetingVersion !==
                        previewState.version + 1;
                const catalogBinding =
                    previewWillPlan && isMeetingStateV2(currentForPlanning.state)
                        ? await captureManagerCatalogBinding(options.agentCatalog, {
                              teamId: stored.teamId,
                              meetingId: stored.repository.meetingId,
                              captainSessionId: stored.captainSessionId
                          })
                        : { kind: "none" as const };
                const committed = await stored.repository.execute({
                    requestId: input.requestId,
                    commandKind: "start_meeting_task",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `participant:${caller.sessionId}`
                    },
                    requestHash: JSON.stringify(input),
                    expectedMeetingVersion: authorized.recovered.snapshot!.version,
                    transition: (snapshot) => {
                        const transition = startMeetingTaskTransition(
                            snapshot.state as unknown as MeetingState,
                            input.meetingTaskId,
                            taskNow
                        );
                        let nextState = transition.state as unknown as MeetingState;
                        let planningEvents: DomainEventInput[] = [];
                        let planningOutbox: Array<{
                            deliveryId: string;
                            kind: "dispatch";
                            payload: JsonObject;
                        }> = [];
                        if (
                            nextState.manager.currentPlanningAttempt !== undefined &&
                            nextState.manager.currentPlanningAttempt.observedMeetingVersion !==
                                nextState.version + 1
                        ) {
                            const planningIds = nextManagerPlanningIds(nextState);
                            const planningAttemptId = planningIds.planningAttemptId;
                            const planningDeliveryId = planningIds.deliveryId;
                            const planning = startManagerPlanning(
                                {
                                    ...nextState,
                                    manager: {
                                        ...nextState.manager,
                                        status: "idle",
                                        currentPlanningAttempt: undefined
                                    }
                                },
                                {
                                    meetingId: nextState.id,
                                    planningAttemptId,
                                    deliveryId: planningDeliveryId,
                                    reason: "next_turn",
                                    now: taskNow,
                                    catalogBinding,
                                    allowRunningRestart: true
                                }
                            );
                            nextState = planning.state;
                            planningEvents = planning.effect
                                .events as unknown as DomainEventInput[];
                            planningOutbox = [
                                {
                                    deliveryId: planningDeliveryId,
                                    kind: "dispatch",
                                    payload: { role: "manager", planningAttemptId }
                                }
                            ];
                        }
                        return {
                            state: nextState as unknown as JsonObject,
                            result: {
                                requestId: input.requestId,
                                meetingTaskId: input.meetingTaskId,
                                status: "running"
                            } satisfies MeetingTaskStartResultV1,
                            events: [
                                ...(transition.effect.events as unknown as DomainEventInput[]),
                                ...planningEvents
                            ],
                            outbox: planningOutbox
                        };
                    }
                });
                return success(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as MeetingTaskStartResultV1
                );
            } catch (error) {
                return commandError(
                    error,
                    "INVALID_STATE_TRANSITION",
                    "The MeetingTask could not be started.",
                    { meetingId: input.meetingId }
                );
            }
        },

        async finishMeetingTask(input: MeetingTaskFinishInputV1, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            const authorized = await readAuthorizedMeetingTask(
                stored.repository,
                caller,
                input.meetingTaskId,
                input.executionId
            );
            if (authorized === undefined)
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "The caller is not authorized for this MeetingTask."
                );
            try {
                const currentState = authorized.recovered.snapshot!
                    .state as unknown as MeetingState;
                const currentAttempt = currentState.manager.currentPlanningAttempt;
                const managerRequested =
                    currentState.selectionMode === "manager" ||
                    (currentState.selectionMode === "hybrid" &&
                        needsSemanticArbitration(
                            currentState,
                            rankRulePlanningCandidates(currentState),
                            "normal"
                        ));
                const mayCreatePlanningAttempt =
                    input.status === "completed" &&
                    (currentState.status === "running" || currentState.status === "waiting") &&
                    currentState.currentTurn === undefined &&
                    (currentAttempt === undefined ||
                        currentAttempt.observedMeetingVersion !== currentState.version + 1) &&
                    currentState.manager.status !== "failed" &&
                    currentState.manager.status !== "closed" &&
                    managerRequested &&
                    requiredPlanningBlockers(currentState).length === 0;
                const catalogBinding =
                    mayCreatePlanningAttempt && isMeetingStateV2(currentState)
                        ? await captureManagerCatalogBinding(options.agentCatalog, {
                              teamId: stored.teamId,
                              meetingId: stored.repository.meetingId,
                              captainSessionId: stored.captainSessionId
                          })
                        : { kind: "none" as const };
                const committed = await stored.repository.execute({
                    requestId: input.requestId,
                    commandKind: "finish_meeting_task",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `participant:${caller.sessionId}`
                    },
                    requestHash: JSON.stringify(input),
                    expectedMeetingVersion: authorized.recovered.snapshot!.version,
                    transition: (snapshot) => {
                        const currentState = snapshot.state as unknown as MeetingState;
                        const task = currentState.meetingTasks.find(
                            (candidate) => candidate.meetingTaskId === input.meetingTaskId
                        );
                        if (task?.executionId !== input.executionId) {
                            throw new Error("MeetingTask execution binding is invalid.");
                        }
                        const transition = finishMeetingTaskTransition(
                            snapshot.state as unknown as MeetingState,
                            input.meetingTaskId,
                            {
                                status: input.status,
                                resultSummary: input.resultSummary,
                                failureReason: input.failureReason,
                                now: options.now?.() ?? Date.now()
                            }
                        );
                        const handRaise =
                            input.status === "completed"
                                ? createHandRaise(transition.state, {
                                      id: `${input.meetingTaskId}-hand-raise`,
                                      participantId: caller.participantId!,
                                      reason: "task_completed",
                                      summary: input.resultSummary ?? "MeetingTask finished",
                                      taskIds: [input.meetingTaskId],
                                      priority: "normal",
                                      now: options.now?.() ?? Date.now()
                                  })
                                : { state: transition.state, effect: { events: [] } };
                        const waitingForThisTask =
                            handRaise.state.status === "waiting" &&
                            handRaise.state.waitState?.taskIds.includes(input.meetingTaskId) &&
                            handRaise.state.waitState.taskIds.every((taskId) =>
                                handRaise.state.meetingTasks.every(
                                    (task) =>
                                        task.meetingTaskId !== taskId ||
                                        ["completed", "failed", "cancelled"].includes(task.status)
                                )
                            );
                        const waitingResolvedByThisTask =
                            input.status === "completed" &&
                            handRaise.state.status === "waiting" &&
                            handRaise.state.waitState?.participantIds.includes(
                                task.participantId
                            ) &&
                            handRaise.state.waitState.participantIds.every((participantId) => {
                                const participant = handRaise.state.participants.find(
                                    (candidate) => candidate.id === participantId
                                );
                                return (
                                    participant !== undefined &&
                                    isParticipantDispatchableNow(handRaise.state, participant)
                                );
                            });
                        let nextState =
                            waitingForThisTask || waitingResolvedByThisTask
                                ? {
                                      ...handRaise.state,
                                      status: "running" as const,
                                      currentTurn: undefined,
                                      waitState: undefined
                                  }
                                : handRaise.state;
                        if (
                            input.status === "completed" &&
                            nextState.manager.currentPlanningAttempt !== undefined &&
                            nextState.manager.currentPlanningAttempt.observedMeetingVersion !==
                                nextState.version + 1
                        ) {
                            nextState = {
                                ...nextState,
                                manager: {
                                    ...nextState.manager,
                                    status: "idle",
                                    currentPlanningAttempt: undefined
                                }
                            };
                        }
                        let planningEvents: DomainEventInput[] = [];
                        let planningOutbox: Array<{
                            deliveryId: string;
                            kind: "dispatch";
                            payload: JsonObject;
                        }> = [];
                        if (
                            input.status === "completed" &&
                            (nextState.status === "running" || nextState.status === "waiting") &&
                            nextState.currentTurn === undefined &&
                            nextState.manager.currentPlanningAttempt === undefined &&
                            nextState.handRaises.some((raise) => raise.status === "pending")
                        ) {
                            const planningNow = options.now?.() ?? Date.now();
                            const blockers = requiredPlanningBlockers(nextState);
                            if (blockers.length > 0) {
                                nextState = {
                                    ...nextState,
                                    status: "waiting",
                                    currentTurn: undefined,
                                    waitState: {
                                        reason: "required_participant_unavailable",
                                        waitingSince: planningNow,
                                        taskIds: [],
                                        participantIds: blockers,
                                        ...(nextState.activeAgendaItemId === undefined
                                            ? {}
                                            : {
                                                  resumeAgendaItemId: nextState.activeAgendaItemId
                                              })
                                    }
                                };
                                planningEvents = [
                                    {
                                        type: "meeting.waiting",
                                        payload: {
                                            meetingId: nextState.id,
                                            from: handRaise.state.status,
                                            to: "waiting",
                                            reason: "required_participant_unavailable",
                                            participantIds: blockers,
                                            meetingVersion: nextState.version
                                        }
                                    }
                                ];
                            } else {
                                const managerRequested =
                                    nextState.selectionMode === "manager" ||
                                    (nextState.selectionMode === "hybrid" &&
                                        needsSemanticArbitration(
                                            nextState,
                                            rankRulePlanningCandidates(nextState),
                                            "normal"
                                        ));
                                const managerAvailable =
                                    nextState.manager.status !== "failed" &&
                                    nextState.manager.status !== "closed";
                                if (managerRequested && managerAvailable) {
                                    const planningIds = nextManagerPlanningIds(nextState);
                                    const planning = startManagerPlanning(nextState, {
                                        meetingId: nextState.id,
                                        planningAttemptId: planningIds.planningAttemptId,
                                        deliveryId: planningIds.deliveryId,
                                        reason:
                                            nextState.selectionMode === "hybrid"
                                                ? "semantic_arbitration"
                                                : "next_turn",
                                        now: planningNow,
                                        catalogBinding
                                    });
                                    nextState = planning.state;
                                    planningEvents = planning.effect
                                        .events as unknown as DomainEventInput[];
                                    planningOutbox = [
                                        {
                                            deliveryId: planningIds.deliveryId,
                                            kind: "dispatch",
                                            payload: {
                                                role: "manager",
                                                planningAttemptId: planningIds.planningAttemptId
                                            }
                                        }
                                    ];
                                } else {
                                    const planned =
                                        nextState.selectionMode === "round_robin"
                                            ? planRoundRobinTurn(
                                                  nextState,
                                                  {
                                                      turnId: `turn-${nextState.turnSeq + 1}`,
                                                      stepId: (participantId, index) =>
                                                          `step-${participantId}-${index}`
                                                  },
                                                  planningNow
                                              )
                                            : planRuleBasedTurn(
                                                  nextState,
                                                  {
                                                      turnId: `turn-${nextState.turnSeq + 1}`,
                                                      stepId: (participantId, index) =>
                                                          `step-${participantId}-${index}`
                                                  },
                                                  planningNow,
                                                  "normal"
                                              );
                                    const directedPlan =
                                        managerRequested && !managerAvailable
                                            ? {
                                                  ...planned,
                                                  reason: "manager_fallback" as const
                                              }
                                            : planned;
                                    const running = assignTurnAttempt(
                                        nextState,
                                        directedPlan,
                                        0,
                                        planningNow
                                    );
                                    const speaker = running.steps[0];
                                    nextState = {
                                        ...nextState,
                                        currentTurn: running,
                                        turnSeq: running.seq,
                                        participants: nextState.participants.map((participant) =>
                                            participant.id === speaker?.speaker
                                                ? {
                                                      ...participant,
                                                      status: "speaking" as const
                                                  }
                                                : participant
                                        )
                                    };
                                    planningEvents = [
                                        { type: "turn.started", payload: { turnId: running.id } },
                                        ...(speaker?.attempt === undefined
                                            ? []
                                            : [
                                                  {
                                                      type: "speaker_attempt.started" as const,
                                                      payload: {
                                                          attemptId: speaker.attempt.attemptId
                                                      }
                                                  }
                                              ])
                                    ];
                                    planningOutbox =
                                        speaker?.attempt === undefined
                                            ? []
                                            : [
                                                  {
                                                      deliveryId: speaker.attempt.deliveryId,
                                                      kind: "dispatch",
                                                      payload: {
                                                          participantId:
                                                              speaker.attempt.participantId,
                                                          attemptId: speaker.attempt.attemptId,
                                                          turnId: running.id,
                                                          stepId: speaker.id
                                                      }
                                                  }
                                              ];
                                }
                            }
                        }
                        return {
                            state: nextState as unknown as JsonObject,
                            result: {
                                requestId: input.requestId,
                                meetingTaskId: input.meetingTaskId,
                                status: input.status,
                                ...(input.status === "completed"
                                    ? { handRaiseId: `${input.meetingTaskId}-hand-raise` }
                                    : {})
                            } satisfies MeetingTaskFinishResultV1,
                            events: [
                                ...(transition.effect.events as unknown as DomainEventInput[]),
                                ...(handRaise.effect.events as unknown as DomainEventInput[]),
                                ...planningEvents
                            ],
                            outbox: planningOutbox
                        };
                    }
                });
                return success(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as MeetingTaskFinishResultV1
                );
            } catch (error) {
                return commandError(
                    error,
                    "INVALID_STATE_TRANSITION",
                    "The MeetingTask could not be finished.",
                    { meetingId: input.meetingId }
                );
            }
        }
    };
    return application;
}
