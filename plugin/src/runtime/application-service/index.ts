import { createHash } from "node:crypto";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    type ArchiveSessionRuntime,
    type ContinuableFollowupRuntime,
    type ContinuableInspectionRuntime,
    type ContinuableLifecycleRuntime,
    type ContinuableStarter
} from "../../dsh/index.js";
import {
    DomainError,
    createMeetingTask as createMeetingTaskTransition,
    createHandRaise,
    participantHasActiveMeetingTask,
    finishMeetingTask as finishMeetingTaskTransition,
    findPendingEquivalentHandRaise,
    planRoundRobinTurn,
    endMeeting as endMeetingTransition,
    startMeetingTask as startMeetingTaskTransition,
    startManagerPlanning,
    submitManagerPlan as submitManagerPlanTransition,
    submitSpeakerAndAdvanceMeeting,
    reassignTurn as reassignTurnTransition,
    transitionMeeting,
    type MeetingState
} from "../../domain/index.js";
import { RepositoryError } from "../../repository/index.js";
import {
    type DomainEventInput,
    type JsonObject,
    type RepositoryAuthorizationValidator
} from "../meeting-runtime.js";
import {
    createMeetingDeliveryDispatcher,
    createMeetingDeliveryWorkerService
} from "../services/meeting-dispatch-service.js";
import {
    commandFailure as failure,
    commandSuccess as success,
    mapCommandError as commandError
} from "../services/command-result-service.js";
import {
    readAuthorizedMeetingTask,
    resolveArchiveCleanupRuntime
} from "../services/meeting-session-service.js";
import { recoverArchive } from "../services/meeting-archive-service.js";
import {
    createMeetingRehydrationService,
    LocalMeetingRecoveryUnavailableError
} from "../services/meeting-recovery-service.js";
import { assignTurnAttempt } from "./meeting-turn.js";
import { createMeetingQueryApplication } from "./meeting-query.js";
import { createMeetingApplication } from "./create-meeting.js";
import type { MeetingControlSource, StoredMeeting } from "./types.js";
import {
    meetingTaskEvidenceResolver,
    type AuthorizedTaskEvidenceResolver
} from "../task-evidence.js";
import type {
    CreateMeetingInputV1,
    CreateMeetingResultV1,
    MeetingStatusInputV1,
    MeetingStatusResultV1,
    EndMeetingInputV1,
    EndMeetingResultV1,
    MeetingTaskRequestV1,
    MeetingTaskStatusInputV1,
    MeetingTaskStartInputV1,
    MeetingTaskFinishInputV1,
    MeetingTaskResultV1,
    MeetingTaskStatusResultV1,
    MeetingTaskStartResultV1,
    MeetingTaskFinishResultV1,
    HandRaiseSubmissionV1,
    HandRaiseResultV1,
    ManagerPlanResultV1,
    ManagerPlanSubmissionV1,
    MeetingControlResultV1,
    TurnSubmissionResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1,
    LocalMeetingListResponseV1,
    PauseMeetingInputV1,
    ResumeMeetingInputV1,
    ReassignTurnInputV1,
    ReassignTurnResultV1,
    TurnSubmissionV1
} from "../../protocol/index.js";
import type { MeetingOwnershipLookup } from "../../dsh/index.js";

export interface MeetingToolCaller {
    readonly sessionId: string;
    readonly agent?: Agent;
    readonly kind: "captain" | "manager" | "participant";
    readonly meetingId?: string;
    readonly participantId?: string;
}

export interface MeetingToolRuntime {
    createMeeting(
        input: CreateMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CreateMeetingResultV1> | ProtocolErrorV1>;
    getStatus(
        input: MeetingStatusInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingStatusResultV1> | ProtocolErrorV1>;
    createMeetingTask(
        input: MeetingTaskRequestV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingTaskResultV1> | ProtocolErrorV1>;
    meetingTaskStatus(
        input: MeetingTaskStatusInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingTaskStatusResultV1> | ProtocolErrorV1>;
    startMeetingTask(
        input: MeetingTaskStartInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingTaskStartResultV1> | ProtocolErrorV1>;
    finishMeetingTask(
        input: MeetingTaskFinishInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingTaskFinishResultV1> | ProtocolErrorV1>;
    raiseHand(
        input: HandRaiseSubmissionV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<HandRaiseResultV1> | ProtocolErrorV1>;
    submitTurn(
        input: TurnSubmissionV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<TurnSubmissionResultV1> | ProtocolErrorV1>;
    submitManagerPlan(
        input: ManagerPlanSubmissionV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<ManagerPlanResultV1> | ProtocolErrorV1>;
    pause(
        input: PauseMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
    resume(
        input: ResumeMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
    reassignTurn(
        input: ReassignTurnInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<ReassignTurnResultV1> | ProtocolErrorV1>;
    endMeeting(
        input: EndMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<EndMeetingResultV1> | ProtocolErrorV1>;
}

export interface CreateStatusRuntimeOptions {
    readonly dataRoot: string;
    readonly provider: string;
    readonly continuable: ContinuableStarter &
        ContinuableFollowupRuntime &
        ContinuableInspectionRuntime &
        Partial<ArchiveSessionRuntime & ContinuableLifecycleRuntime>;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly maxParticipants?: number;
    readonly outboxPollMs?: number;
    readonly speakerAttemptTimeoutMs?: number;
    readonly signal?: AbortSignal;
    readonly now?: () => number;
    readonly taskEvidenceResolver?: AuthorizedTaskEvidenceResolver;
}

export interface LocalMeetingWebRuntime {
    listLocalMeetings(): Promise<LocalMeetingListResponseV1>;
    getLocalMeetingStatus(
        input: MeetingStatusInputV1
    ): Promise<ProtocolSuccessV1<MeetingStatusResultV1> | ProtocolErrorV1>;
    pauseLocalMeeting(
        input: PauseMeetingInputV1
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
    resumeLocalMeeting(
        input: ResumeMeetingInputV1
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
}

export { LocalMeetingRecoveryUnavailableError } from "../services/meeting-recovery-service.js";

export type MeetingRuntimeWithCallerLookup = MeetingToolRuntime &
    MeetingOwnershipLookup &
    LocalMeetingWebRuntime & { dispose(): Promise<void> };

function participantRequestEntityId(
    prefix: "meeting-task" | "hand-raise",
    participantId: string,
    requestId: string
): string {
    return `${prefix}-${createHash("sha256")
        .update(`${participantId}\0${requestId}`)
        .digest("hex")
        .slice(0, 32)}`;
}

export function createCreateStatusRuntime(
    options: CreateStatusRuntimeOptions
): MeetingRuntimeWithCallerLookup {
    const meetings = new Map<string, StoredMeeting>();
    const deliveryWorkers = createMeetingDeliveryWorkerService({
        pollMs: options.outboxPollMs ?? 1_000,
        now: options.now
    });
    const deliveryDispatcher = createMeetingDeliveryDispatcher({
        continuable: options.continuable
    });
    const runtimeController = new AbortController();
    const taskEvidenceResolver = options.taskEvidenceResolver ?? meetingTaskEvidenceResolver;
    const signal =
        options.signal === undefined
            ? runtimeController.signal
            : AbortSignal.any([options.signal, runtimeController.signal]);
    const recovery = createMeetingRehydrationService({
        dataRoot: options.dataRoot,
        authorizationValidator: options.authorizationValidator,
        meetings,
        signal,
        now: options.now
    });

    async function recoverArchiveForCaptain(
        stored: StoredMeeting,
        caller: MeetingToolCaller
    ): Promise<void> {
        if (
            caller.kind !== "captain" ||
            caller.sessionId !== stored.captainSessionId ||
            caller.agent === undefined ||
            String(caller.agent.id) !== stored.captainSessionId
        ) {
            return;
        }
        if (stored.parent === undefined) stored.parent = caller.agent;
        await recoverArchive({
            repository: stored.repository,
            parent: stored.parent,
            runtime: resolveArchiveCleanupRuntime(options.continuable),
            signal,
            now: options.now?.() ?? Date.now()
        });
    }

    const queryApplication = createMeetingQueryApplication({
        meetings,
        recovery,
        recoverArchiveForCaptain
    });

    function ensureWorker(stored: StoredMeeting): void {
        const meetingId = stored.repository.meetingId;
        deliveryWorkers.ensure({
            meetingId,
            repository: stored.repository,
            parent: stored.parent,
            dispatch: (item, workerSignal) =>
                deliveryDispatcher.dispatch({
                    repository: stored.repository,
                    parent: stored.parent!,
                    meetingId,
                    signal: AbortSignal.any([signal, workerSignal]),
                    item
                })
        });
    }

    const createMeeting = createMeetingApplication({
        runtime: options,
        meetings,
        recovery,
        deliveryWorkers,
        ensureWorker,
        signal
    });

    return {
        createMeeting,
        getStatus: queryApplication.getStatus,
        listLocalMeetings: queryApplication.listLocalMeetings,
        getLocalMeetingStatus: queryApplication.getLocalMeetingStatus,

        async pauseLocalMeeting(input) {
            const snapshots = await recovery.rehydrate({
                kind: "local_meeting",
                meetingId: input.meetingId
            });
            if (!snapshots?.has(input.meetingId))
                return failure("MEETING_NOT_FOUND", "Meeting not found.");
            return transitionMeetingStatus(input, "paused", { kind: "local_host" });
        },

        async resumeLocalMeeting(input) {
            const snapshots = await recovery.rehydrate({
                kind: "local_meeting",
                meetingId: input.meetingId
            });
            if (!snapshots?.has(input.meetingId))
                return failure("MEETING_NOT_FOUND", "Meeting not found.");
            return transitionMeetingStatus(input, "running", { kind: "local_host" });
        },

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
            const taskId = participantRequestEntityId(
                "meeting-task",
                caller.participantId,
                input.requestId
            );
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
                            options.now?.() ?? Date.now()
                        );
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: {
                                requestId: input.requestId,
                                meetingTaskId: input.meetingTaskId,
                                status: "running"
                            } satisfies MeetingTaskStartResultV1,
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox: []
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
                        let nextState = waitingForThisTask
                            ? { ...handRaise.state, currentTurn: undefined, waitState: undefined }
                            : handRaise.state;
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
                            nextState.selectionMode === "manager" &&
                            nextState.handRaises.some((raise) => raise.status === "pending")
                        ) {
                            const planningAttemptId = `${nextState.id}-planning-${nextState.replanCount + 1}`;
                            const planningDeliveryId = `${nextState.id}-planning-delivery-${nextState.replanCount + 1}`;
                            const planning = startManagerPlanning(nextState, {
                                meetingId: nextState.id,
                                planningAttemptId,
                                deliveryId: planningDeliveryId,
                                reason: "next_turn",
                                now: options.now?.() ?? Date.now()
                            });
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
        },

        async raiseHand(input: HandRaiseSubmissionV1, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            if (caller.kind !== "participant" || caller.participantId === undefined) {
                return failure("UNAUTHORIZED_CALLER", "Only a Participant can raise a hand.");
            }
            if (caller.meetingId !== input.meetingId) {
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "Only the matching Participant can raise a hand."
                );
            }
            const handRaiseId = participantRequestEntityId(
                "hand-raise",
                caller.participantId,
                input.requestId
            );
            try {
                const current = await stored.repository.read();
                const committed = await stored.repository.execute({
                    requestId: input.requestId,
                    commandKind: "raise_hand",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `participant:${caller.sessionId}`
                    },
                    requestHash: JSON.stringify(input),
                    expectedMeetingVersion: current.version,
                    allowNoop: true,
                    transition: (snapshot) => {
                        const handRaiseInput = {
                            id: handRaiseId,
                            participantId: caller.participantId!,
                            reason: input.reason,
                            summary: input.summary,
                            taskIds: input.taskIds,
                            ...(input.replyToMessageId === undefined
                                ? {}
                                : { replyToMessageId: input.replyToMessageId }),
                            agendaItemId: input.agendaItemId,
                            priority: input.priority,
                            now: options.now?.() ?? Date.now()
                        };
                        const state = snapshot.state as unknown as MeetingState;
                        const duplicate = findPendingEquivalentHandRaise(state, handRaiseInput);
                        const transition = createHandRaise(state, handRaiseInput);
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: {
                                handRaiseId: duplicate?.id ?? handRaiseId,
                                status: "pending"
                            } satisfies HandRaiseResultV1,
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox: []
                        };
                    }
                });
                return success(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as HandRaiseResultV1
                );
            } catch (error) {
                return commandError(
                    error,
                    "INVALID_ENTITY_STATE",
                    "The hand raise could not be created.",
                    { meetingId: input.meetingId }
                );
            }
        },

        async submitTurn(input, caller, _commandSignal) {
            await recovery.rehydrate();
            if (
                caller.kind !== "participant" ||
                caller.meetingId !== input.meetingId ||
                caller.participantId === undefined
            ) {
                return failure("UNAUTHORIZED_CALLER", "Only the matching Participant can submit.");
            }
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            if (stored.parent === undefined) {
                return failure(
                    "INTERNAL_ERROR",
                    "The live Captain parent is unavailable for dispatch.",
                    true
                );
            }
            const messageId = `message-${input.deliveryId}`;
            const commandNow = options.now?.() ?? Date.now();
            const questions = (input.changes.questions ?? []).map((claim, index) => ({
                id: `question-${input.deliveryId}-${index + 1}`,
                text: claim.text.trim(),
                ...(claim.directedTo === undefined ? {} : { directedTo: claim.directedTo }),
                blocking: claim.blocking,
                createdAt: commandNow
            }));
            try {
                const current = await stored.repository.read();
                const committed = await stored.repository.execute({
                    requestId: input.deliveryId,
                    commandKind: "submit_turn",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `participant:${caller.sessionId}`,
                        attemptId: input.attemptId
                    },
                    requestHash: JSON.stringify(input),
                    expectedMeetingVersion: current.version,
                    transition: (snapshot) => {
                        const state = snapshot.state as unknown as MeetingState;
                        const taskEvidence =
                            input.completionClaims === undefined
                                ? []
                                : taskEvidenceResolver.resolve({
                                      state,
                                      meetingId: input.meetingId,
                                      participantId: caller.participantId!,
                                      taskIds: [
                                          ...(input.completionClaims.outputClaims?.flatMap(
                                              (claim) => claim.taskIds
                                          ) ?? []),
                                          ...(input.completionClaims.criterionClaims?.flatMap(
                                              (claim) => claim.taskIds
                                          ) ?? [])
                                      ].filter(
                                          (taskId, index, taskIds) =>
                                              taskIds.indexOf(taskId) === index
                                      )
                                  });
                        const transition = submitSpeakerAndAdvanceMeeting(
                            state,
                            caller.participantId!,
                            {
                                meetingId: input.meetingId,
                                participantId: caller.participantId!,
                                turnId: input.turnId,
                                stepId: input.stepId,
                                attemptId: input.attemptId,
                                deliveryId: input.deliveryId,
                                agendaItemId: input.agendaItemId,
                                message: {
                                    id: messageId,
                                    content: input.content,
                                    kind: input.kind,
                                    mentions: input.mentions,
                                    ...(input.replyTo === undefined
                                        ? {}
                                        : { replyTo: input.replyTo }),
                                    taskIds: input.taskIds,
                                    agendaRelation: input.agendaRelation,
                                    createdAt: commandNow
                                },
                                now: commandNow,
                                nextPlanningAttemptId: `${state.id}-planning-${state.replanCount + 1}`,
                                nextPlanningDeliveryId: `${state.id}-planning-delivery-${state.replanCount + 1}`,
                                questions,
                                ...(input.completionClaims === undefined
                                    ? {}
                                    : {
                                          completion: {
                                              claims: input.completionClaims,
                                              authorizedTaskIds: taskEvidence.map(
                                                  (evidence) => evidence.meetingTaskId
                                              ),
                                              factId: (kind: string, index: number) =>
                                                  `completion-${input.deliveryId}-${kind}-${index}`
                                          }
                                      })
                            }
                        );
                        const nextStep =
                            transition.state.currentTurn?.steps[
                                transition.state.currentTurn.currentStepIndex
                            ];
                        const submittedTurn = transition.state.currentTurn;
                        const taskOutbox: Array<{
                            deliveryId: string;
                            kind: "dispatch";
                            payload: JsonObject;
                        }> = transition.state.meetingTasks
                            .filter(
                                (task) =>
                                    task.status === "queued" &&
                                    task.originatingSpeakerAttemptId === input.attemptId &&
                                    input.taskIds.includes(task.meetingTaskId)
                            )
                            .map((task) => ({
                                deliveryId: task.deliveryId,
                                kind: "dispatch" as const,
                                payload: {
                                    role: "meeting_task",
                                    meetingTaskId: task.meetingTaskId,
                                    participantId: task.participantId,
                                    executionId: task.executionId
                                }
                            }));
                        const turnStatus =
                            submittedTurn?.status ??
                            (transition.state.status === "partial" ? "truncated" : "completed");
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: {
                                messageId,
                                messageSeq: transition.state.messageSeq,
                                turnStatus,
                                ...(nextStep === undefined ? {} : { nextStepId: nextStep.id }),
                                meetingStatus: transition.state.status
                            },
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox: [
                                ...taskOutbox,
                                ...(submittedTurn?.status === "running" && nextStep?.attempt
                                    ? [
                                          {
                                              deliveryId: nextStep.attempt.deliveryId,
                                              kind: "dispatch" as const,
                                              payload: {
                                                  role: "participant",
                                                  participantId: nextStep.attempt.participantId,
                                                  attemptId: nextStep.attempt.attemptId,
                                                  turnId: submittedTurn.id,
                                                  stepId: nextStep.id
                                              }
                                          }
                                      ]
                                    : transition.state.manager.currentPlanningAttempt
                                      ? [
                                            {
                                                deliveryId:
                                                    transition.state.manager.currentPlanningAttempt
                                                        .deliveryId,
                                                kind: "dispatch" as const,
                                                payload: {
                                                    role: "manager",
                                                    planningAttemptId:
                                                        transition.state.manager
                                                            .currentPlanningAttempt.id
                                                }
                                            }
                                        ]
                                      : [])
                            ] as Array<{
                                deliveryId: string;
                                kind: "dispatch";
                                payload: JsonObject;
                            }>
                        };
                    }
                });
                if (committed.result) deliveryWorkers.wake(input.meetingId);
                return success<TurnSubmissionResultV1>(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as TurnSubmissionResultV1
                );
            } catch (error) {
                return commandError(
                    error,
                    "STALE_ATTEMPT",
                    "The speaker attempt is stale.",
                    {
                        meetingId: input.meetingId,
                        turnId: input.turnId,
                        stepId: input.stepId,
                        attemptId: input.attemptId,
                        deliveryId: input.deliveryId,
                        participantId: caller.participantId
                    },
                    { INVALID_ENTITY_STATE: "INVALID_ARGUMENT" }
                );
            }
        },
        async submitManagerPlan(input: ManagerPlanSubmissionV1, caller, _commandSignal) {
            await recovery.rehydrate();
            if (caller.kind !== "manager" || caller.meetingId !== input.meetingId)
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "Only the matching Manager can submit a plan."
                );
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            if (stored.parent === undefined) {
                return failure(
                    "INTERNAL_ERROR",
                    "The live Captain parent is unavailable for dispatch.",
                    true
                );
            }
            try {
                const current = await stored.repository.read();
                const recovered = await stored.repository.recover();
                const state = current.state as unknown as MeetingState;
                const dispatchableParticipantIds = state.participants
                    .filter(
                        (participant) =>
                            participant.status === "available" &&
                            !participantHasActiveMeetingTask(state, participant.id)
                    )
                    .filter((participant) =>
                        recovered.sessionOwnership.some(
                            (ownership) =>
                                ownership.role === "participant" &&
                                ownership.participantId === participant.id &&
                                ownership.lifecycleStatus === "active" &&
                                ownership.capabilityStatus === "active"
                        )
                    )
                    .map((participant) => participant.id);
                const committed = await stored.repository.execute({
                    requestId: input.requestId,
                    commandKind: "submit_manager_plan",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `manager:${caller.sessionId}`,
                        attemptId: input.planningAttemptId
                    },
                    requestHash: JSON.stringify(input),
                    expectedMeetingVersion: input.observedMeetingVersion,
                    transition: (snapshot) => {
                        const snapshotState = snapshot.state as unknown as MeetingState;
                        const transition = submitManagerPlanTransition(
                            snapshotState,
                            input,
                            {
                                meetingId: input.meetingId,
                                planningAttemptId: input.planningAttemptId,
                                deliveryId:
                                    snapshotState.manager.currentPlanningAttempt?.deliveryId ?? "",
                                observedMeetingVersion: input.observedMeetingVersion,
                                dispatchableParticipantIds,
                                now: options.now?.() ?? Date.now()
                            },
                            {
                                turnId: `turn-${snapshotState.turnSeq + 1}`,
                                stepId: (index) => `step-turn-${snapshotState.turnSeq + 1}-${index}`
                            }
                        );
                        const turn = transition.state.currentTurn;
                        return {
                            state: transition.state as unknown as JsonObject,
                            result:
                                turn === undefined
                                    ? { waiting: true }
                                    : {
                                          turnId: turn.id,
                                          firstStepId: turn.steps[0]!.id,
                                          firstAttemptId: turn.steps[0]!.attempt!.attemptId
                                      },
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox:
                                turn === undefined
                                    ? []
                                    : [
                                          {
                                              deliveryId: turn.steps[0]!.attempt!.deliveryId,
                                              kind: "dispatch",
                                              payload: {
                                                  role: "participant",
                                                  participantId:
                                                      turn.steps[0]!.attempt!.participantId,
                                                  attemptId: turn.steps[0]!.attempt!.attemptId,
                                                  turnId: turn.id,
                                                  stepId: turn.steps[0]!.id
                                              }
                                          }
                                      ]
                        };
                    }
                });
                if ("waiting" in committed.result)
                    return failure(
                        "REQUIRED_SPEAKER_UNAVAILABLE",
                        "A required speaker is unavailable."
                    );
                return success<ManagerPlanResultV1>(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as ManagerPlanResultV1
                );
            } catch (error) {
                return commandError(
                    error,
                    "MANAGER_PLAN_INVALID",
                    "The Manager plan is invalid.",
                    {
                        meetingId: input.meetingId,
                        meetingVersion: input.observedMeetingVersion
                    },
                    { VERSION_CONFLICT: "STALE_MANAGER_ATTEMPT" }
                );
            }
        },
        async pause(input, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (
                stored === undefined ||
                caller.kind !== "captain" ||
                caller.sessionId !== stored.captainSessionId
            )
                return failure("UNAUTHORIZED_CALLER", "Only the meeting Captain can pause it.");
            return transitionMeetingStatus(input, "paused", {
                kind: "captain",
                sessionId: caller.sessionId
            });
        },
        async resume(input, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (
                stored === undefined ||
                caller.kind !== "captain" ||
                caller.sessionId !== stored.captainSessionId
            )
                return failure("UNAUTHORIZED_CALLER", "Only the meeting Captain can resume it.");
            return transitionMeetingStatus(input, "running", {
                kind: "captain",
                sessionId: caller.sessionId
            });
        },
        async reassignTurn(input, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (
                stored === undefined ||
                caller.kind !== "captain" ||
                caller.sessionId !== stored.captainSessionId ||
                (caller.meetingId !== undefined && caller.meetingId !== input.meetingId)
            ) {
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "Only the meeting Captain can reassign a turn."
                );
            }
            if (stored.parent === undefined) {
                return failure(
                    "INTERNAL_ERROR",
                    "The live Captain parent is unavailable for speaker dispatch.",
                    true
                );
            }
            try {
                const committed = await stored.repository.execute({
                    requestId: input.requestId,
                    commandKind: "reassign_turn",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `captain:${caller.sessionId}`,
                        attemptId: input.currentAttemptId
                    },
                    requestHash: JSON.stringify(input),
                    expectedMeetingVersion: input.expectedMeetingVersion,
                    transition: (snapshot) => {
                        const transition = reassignTurnTransition(
                            snapshot.state as unknown as MeetingState,
                            {
                                currentAttemptId: input.currentAttemptId,
                                action: input.action,
                                ...(input.replacementParticipantId === undefined
                                    ? {}
                                    : { replacementParticipantId: input.replacementParticipantId }),
                                reason: input.reason,
                                now: options.now?.() ?? Date.now()
                            }
                        );
                        const current = transition.state.currentTurn;
                        const nextAttempt = current?.steps[current.currentStepIndex]?.attempt;
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: {
                                revokedAttemptId: input.currentAttemptId,
                                ...(input.action === "skip" || nextAttempt === undefined
                                    ? {}
                                    : { replacementAttemptId: nextAttempt.attemptId }),
                                action: input.action
                            } satisfies ReassignTurnResultV1,
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox:
                                nextAttempt === undefined
                                    ? []
                                    : [
                                          {
                                              deliveryId: nextAttempt.deliveryId,
                                              kind: "dispatch" as const,
                                              payload: {
                                                  role: "participant",
                                                  participantId: nextAttempt.participantId,
                                                  attemptId: nextAttempt.attemptId,
                                                  turnId: current!.id,
                                                  stepId: current!.steps[current!.currentStepIndex]!
                                                      .id
                                              }
                                          }
                                      ]
                        };
                    }
                });
                deliveryWorkers.wake(input.meetingId);
                return success<ReassignTurnResultV1>(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as ReassignTurnResultV1
                );
            } catch (error) {
                return commandError(
                    error,
                    "STALE_ATTEMPT",
                    "The speaker attempt is stale or cannot be reassigned.",
                    { meetingId: input.meetingId, attemptId: input.currentAttemptId },
                    {
                        INVALID_ENTITY_STATE: "INVALID_ARGUMENT",
                        REQUIRED_SPEAKER_UNAVAILABLE: "REQUIRED_SPEAKER_UNAVAILABLE"
                    }
                );
            }
        },
        async endMeeting(input: EndMeetingInputV1, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (
                stored === undefined ||
                caller.kind !== "captain" ||
                caller.sessionId !== stored.captainSessionId ||
                (caller.meetingId !== undefined && caller.meetingId !== input.meetingId)
            ) {
                return failure("UNAUTHORIZED_CALLER", "Only the meeting Captain can end it.");
            }
            try {
                const committed = await stored.repository.execute({
                    requestId: input.requestId,
                    commandKind: "end_meeting",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `captain:${caller.sessionId}`
                    },
                    requestHash: JSON.stringify(input),
                    expectedMeetingVersion: input.expectedMeetingVersion,
                    transition: (snapshot) => {
                        const transition = endMeetingTransition(
                            snapshot.state as unknown as MeetingState,
                            {
                                meetingId: input.meetingId,
                                captainBinding: `captain:${caller.sessionId}`,
                                outcome: input.outcome,
                                reason: input.reason,
                                acceptedDecisionIds: input.acceptedDecisionIds,
                                deferredAgendaItemIds: input.deferredAgendaItemIds,
                                waivers: input.waivers,
                                now: options.now?.() ?? Date.now(),
                                factId: (index) => `completion-${input.requestId}-waiver-${index}`
                            }
                        );
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: {
                                status: transition.state.status,
                                terminationCode: transition.state.termination!.code
                            },
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox: []
                        };
                    }
                });
                try {
                    await recoverArchiveForCaptain(stored, caller);
                } catch {
                    // The end_meeting receipt is already committed; leave archive cleanup recoverable.
                }
                deliveryWorkers.wake(input.meetingId);
                return success<EndMeetingResultV1>(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as EndMeetingResultV1
                );
            } catch (error) {
                return commandError(
                    error,
                    "INVALID_ARGUMENT",
                    error instanceof Error ? error.message : "The meeting could not be ended.",
                    {
                        meetingId: input.meetingId,
                        meetingVersion: input.expectedMeetingVersion
                    },
                    {
                        INVALID_ENTITY_STATE: "INVALID_ARGUMENT",
                        INVALID_STATE_TRANSITION: "INVALID_ARGUMENT"
                    }
                );
            }
        },

        findBySessionId: queryApplication.findBySessionId,
        async dispose() {
            runtimeController.abort(new Error("Meeting runtime disposed"));
            await deliveryWorkers.dispose();
            await Promise.all([...meetings.values()].map((stored) => stored.repository.close()));
            meetings.clear();
        }
    } satisfies MeetingRuntimeWithCallerLookup;

    async function transitionMeetingStatus(
        input: {
            meetingId: string;
            expectedMeetingVersion: number;
            requestId: string;
            reason?: string;
        },
        target: "paused" | "running",
        source: MeetingControlSource
    ) {
        const stored = meetings.get(input.meetingId);
        if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
        const authorization =
            source.kind === "captain"
                ? {
                      callerBinding: `session:${source.sessionId}`,
                      capabilityId: `captain:${source.sessionId}`
                  }
                : {
                      callerBinding: "local-host:loopback-web",
                      capabilityId: "local-host:loopback-web"
                  };
        try {
            const committed = await stored.repository.execute({
                requestId: input.requestId,
                commandKind: target === "paused" ? "pause_meeting" : "resume_meeting",
                authorization,
                requestHash: JSON.stringify(input),
                expectedMeetingVersion: input.expectedMeetingVersion,
                transition: (snapshot) => {
                    if (target === "running" && stored.parent === undefined) {
                        if (source.kind === "local_host") {
                            throw new LocalMeetingRecoveryUnavailableError(
                                "The live Captain parent is unavailable for resume dispatch."
                            );
                        }
                        throw new Error(
                            "The live Captain parent is unavailable for resume dispatch."
                        );
                    }
                    const transition = transitionMeeting(
                        snapshot.state as unknown as MeetingState,
                        target,
                        {
                            now: options.now?.() ?? Date.now(),
                            reason:
                                input.reason ??
                                `${source.kind === "captain" ? "captain" : "local host"} ${target} meeting`,
                            ...(target === "paused"
                                ? {
                                      pause: {
                                          at: options.now?.() ?? Date.now(),
                                          by: {
                                              kind: source.kind,
                                              actorId:
                                                  source.kind === "captain"
                                                      ? source.sessionId
                                                      : "loopback-web"
                                          }
                                      }
                                  }
                                : {})
                        }
                    );
                    let nextState = transition.state as MeetingState;
                    let extraEvents: DomainEventInput[] = [];
                    let outbox: Array<{
                        deliveryId: string;
                        kind: "dispatch";
                        payload: JsonObject;
                    }> = [];
                    if (target === "running" && nextState.currentTurn === undefined) {
                        nextState = {
                            ...nextState,
                            participants: nextState.participants.map((participant) =>
                                participant.status === "speaking" || participant.status === "busy"
                                    ? { ...participant, status: "available" as const }
                                    : participant
                            )
                        };
                        if (nextState.selectionMode === "manager") {
                            const planningSequence = nextState.replanCount + 1;
                            const planningAttemptId = `${nextState.id}-planning-${planningSequence}`;
                            const planningDeliveryId = `${nextState.id}-planning-delivery-${planningSequence}`;
                            nextState = {
                                ...nextState,
                                replanCount: planningSequence,
                                manager: {
                                    ...nextState.manager,
                                    status: "planning",
                                    currentPlanningAttempt: {
                                        id: planningAttemptId,
                                        meetingId: nextState.id,
                                        observedMeetingVersion: nextState.version,
                                        reason: "next_turn",
                                        deliveryId: planningDeliveryId,
                                        status: "running",
                                        createdAt: options.now?.() ?? Date.now()
                                    }
                                }
                            };
                            outbox = [
                                {
                                    deliveryId: planningDeliveryId,
                                    kind: "dispatch",
                                    payload: { role: "manager", planningAttemptId }
                                }
                            ];
                            extraEvents = [
                                {
                                    type: "manager_plan.started",
                                    payload: {
                                        meetingId: nextState.id,
                                        planningAttemptId,
                                        meetingVersion: nextState.version
                                    }
                                }
                            ];
                            return {
                                state: nextState as unknown as JsonObject,
                                result: { status: target, changed: true },
                                events: [
                                    ...(transition.effect.events as unknown as DomainEventInput[]),
                                    ...extraEvents
                                ],
                                outbox
                            };
                        }
                        const planned = planRoundRobinTurn(
                            nextState,
                            {
                                turnId: `turn-${nextState.turnSeq + 1}`,
                                stepId: (participantId, index) => `step-${participantId}-${index}`
                            },
                            options.now?.() ?? Date.now()
                        );
                        const running = assignTurnAttempt(
                            nextState,
                            planned,
                            0,
                            options.now?.() ?? Date.now()
                        );
                        const speaker = running.steps[0];
                        nextState = {
                            ...nextState,
                            currentTurn: running,
                            turnSeq: running.seq,
                            participants: nextState.participants.map((participant) =>
                                participant.id === speaker?.speaker
                                    ? { ...participant, status: "speaking" as const }
                                    : participant
                            )
                        };
                        if (speaker?.attempt !== undefined) {
                            outbox = [
                                {
                                    deliveryId: speaker.attempt.deliveryId,
                                    kind: "dispatch",
                                    payload: {
                                        participantId: speaker.attempt.participantId,
                                        attemptId: speaker.attempt.attemptId,
                                        turnId: running.id,
                                        stepId: speaker.id
                                    }
                                }
                            ];
                        }
                        extraEvents = [
                            { type: "turn.started", payload: { turnId: running.id } },
                            ...(speaker?.attempt === undefined
                                ? []
                                : [
                                      {
                                          type: "speaker_attempt.started" as const,
                                          payload: { attemptId: speaker.attempt.attemptId }
                                      }
                                  ])
                        ];
                    }
                    return {
                        state: nextState as unknown as JsonObject,
                        result: { status: target, changed: true },
                        events: [
                            ...(transition.effect.events as unknown as DomainEventInput[]),
                            ...extraEvents
                        ],
                        outbox
                    };
                }
            });
            if (target === "running" && stored.parent !== undefined) {
                ensureWorker(stored);
                deliveryWorkers.wake(input.meetingId);
            }
            return success<MeetingControlResultV1>(
                input.meetingId,
                committed.meetingVersion,
                committed.result as MeetingControlResultV1
            );
        } catch (error) {
            if (source.kind === "local_host") {
                if (
                    error instanceof RepositoryError &&
                    [
                        "MEETING_NOT_FOUND",
                        "SQLITE_BUSY",
                        "SCHEMA_VERSION_UNSUPPORTED",
                        "CORRUPT_DATABASE",
                        "CLOSED"
                    ].includes(error.code)
                ) {
                    throw new LocalMeetingRecoveryUnavailableError(
                        "Local meeting control recovery is unavailable.",
                        { cause: error }
                    );
                }
                if (
                    error instanceof RepositoryError &&
                    error.code !== "VERSION_CONFLICT" &&
                    error.code !== "IDEMPOTENCY_CONFLICT"
                ) {
                    throw error;
                }
                if (!(error instanceof RepositoryError) && !(error instanceof DomainError)) {
                    throw error;
                }
            }
            return commandError(
                error,
                "INTERNAL_ERROR",
                `${error instanceof Error ? error.message : `The meeting could not be ${target}.`}`,
                {
                    meetingId: input.meetingId,
                    meetingVersion: input.expectedMeetingVersion
                }
            );
        }
    }
}
