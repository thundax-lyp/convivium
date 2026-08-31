import type { Agent } from "@deepseek-ai/dsh-agent";
import { failSpeakerAttempt, type MeetingState } from "../../domain/index.js";
import type { DomainEventInput, JsonObject } from "../meeting-runtime.js";
import {
    type ArchiveSessionRuntime,
    type ContinuableFollowupRuntime,
    type ContinuableInspectionRuntime,
    type ContinuableLifecycleRuntime,
    type ContinuableStarter
} from "../../dsh/index.js";
import type { RepositoryAuthorizationValidator } from "../meeting-runtime.js";
import {
    createMeetingDeliveryDispatcher,
    createMeetingDeliveryWorkerService
} from "../services/meeting-dispatch-service.js";
import { resolveArchiveCleanupRuntime } from "../services/meeting-session-service.js";
import { recoverArchive } from "../services/meeting-archive-service.js";
import {
    createMeetingRehydrationService,
    type MeetingRehydrationService
} from "../services/meeting-recovery-service.js";
import { createMeetingTurnApplication } from "./meeting-turn.js";
import { createMeetingQueryApplication } from "./meeting-query.js";
import { createMeetingApplication } from "./create-meeting.js";
import { createMeetingTaskApplication } from "./meeting-task.js";
import { createMeetingControlApplication } from "./meeting-control.js";
import { createMeetingEndApplication } from "./meeting-end.js";
import type { StoredMeeting } from "./types.js";
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
    CaptainRiskDispositionInputV1,
    CaptainRiskDispositionResultV1,
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
    disposeRisk(
        input: CaptainRiskDispositionInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainRiskDispositionResultV1> | ProtocolErrorV1>;
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
    MeetingOwnershipLookup & {
        scanExpiredSpeakerAttempts(): Promise<void>;
    } & LocalMeetingWebRuntime & { dispose(): Promise<void> };

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
    const repositoryRecovery = createMeetingRehydrationService({
        dataRoot: options.dataRoot,
        authorizationValidator: options.authorizationValidator,
        meetings,
        signal,
        now: options.now
    });
    const recovery: MeetingRehydrationService = {
        async rehydrate(mode) {
            const knownMeetingIds = new Set(meetings.keys());
            const snapshots = await repositoryRecovery.rehydrate(mode);
            if (mode !== undefined && mode.kind !== "agent_best_effort") return snapshots;
            for (const [meetingId, stored] of meetings) {
                if (knownMeetingIds.has(meetingId)) continue;
                try {
                    await recoverArchive({
                        repository: stored.repository,
                        signal,
                        now: options.now?.() ?? Date.now()
                    });
                } catch {
                    // Keep startup discovery best-effort; a later application command may retry.
                }
            }
            return snapshots;
        }
    };

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
    const taskApplication = createMeetingTaskApplication({
        options,
        meetings,
        recovery
    });
    const turnApplication = createMeetingTurnApplication({
        options,
        meetings,
        recovery,
        deliveryWorkers,
        taskEvidenceResolver
    });
    const controlApplication = createMeetingControlApplication({
        options,
        meetings,
        recovery,
        deliveryWorkers,
        ensureWorker
    });
    const endApplication = createMeetingEndApplication({
        options,
        meetings,
        recovery,
        deliveryWorkers,
        recoverArchiveForCaptain
    });

    async function scanExpiredSpeakerAttempts(): Promise<void> {
        await recovery.rehydrate();
        const now = options.now?.() ?? Date.now();
        for (const stored of meetings.values()) {
            const parent = stored.parent;
            if (parent === undefined) continue;
            const current = await stored.repository.read();
            const state = current.state as unknown as MeetingState;
            const turn = state.currentTurn;
            const step = turn?.steps[turn.currentStepIndex];
            const attempt = step?.attempt;
            if (
                state.status !== "running" ||
                turn?.status !== "running" ||
                step?.status !== "running" ||
                attempt?.status !== "running" ||
                attempt.deadlineAt === undefined ||
                attempt.deadlineAt > now
            ) {
                continue;
            }
            try {
                const committed = await stored.repository.execute({
                    requestId: `runtime-timeout:${attempt.attemptId}`,
                    commandKind: "expire_speaker_attempt",
                    authorization: {
                        callerBinding: "runtime:convivium",
                        capabilityId: "runtime:timeout",
                        attemptId: attempt.attemptId
                    },
                    requestHash: `runtime-timeout:${attempt.attemptId}`,
                    expectedMeetingVersion: current.version,
                    transition: (snapshot) => {
                        const transition = failSpeakerAttempt(
                            snapshot.state as unknown as MeetingState,
                            {
                                meetingId: state.id,
                                participantId: attempt.participantId,
                                turnId: attempt.turnId,
                                stepId: attempt.stepId,
                                attemptId: attempt.attemptId,
                                deliveryId: attempt.deliveryId,
                                agendaItemId: turn.agendaItemId,
                                now,
                                nextPlanningAttemptId: `${state.id}-planning-${state.replanCount + 1}`,
                                nextPlanningDeliveryId: `${state.id}-planning-delivery-${state.replanCount + 1}`
                            }
                        );
                        const nextAttempt =
                            transition.state.currentTurn?.steps[
                                transition.state.currentTurn.currentStepIndex
                            ]?.attempt;
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: { expiredAttemptId: attempt.attemptId },
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
                                                  turnId: nextAttempt.turnId,
                                                  stepId: nextAttempt.stepId
                                              }
                                          }
                                      ]
                        };
                    }
                });
                deliveryWorkers.wake(stored.repository.meetingId);
                const ownership = (await stored.repository.recover()).sessionOwnership.find(
                    (candidate) =>
                        candidate.role === "participant" &&
                        candidate.participantId === attempt.participantId &&
                        candidate.parentSessionId === String(parent.id) &&
                        candidate.lifecycleStatus === "active" &&
                        candidate.capabilityStatus === "active"
                );
                if (
                    ownership !== undefined &&
                    typeof options.continuable.interrupt === "function"
                ) {
                    options.continuable.interrupt(ownership.sessionId as never, {
                        kind: "ancestor",
                        agent: parent
                    });
                }
                void committed;
            } catch {
                // A concurrent submit/scan makes the attempt stale; no scan retry creates a new fact.
            }
        }
    }

    return {
        createMeeting,
        getStatus: queryApplication.getStatus,
        listLocalMeetings: queryApplication.listLocalMeetings,
        getLocalMeetingStatus: queryApplication.getLocalMeetingStatus,

        pauseLocalMeeting: controlApplication.pauseLocalMeeting,
        resumeLocalMeeting: controlApplication.resumeLocalMeeting,
        createMeetingTask: taskApplication.createMeetingTask,
        meetingTaskStatus: taskApplication.meetingTaskStatus,
        startMeetingTask: taskApplication.startMeetingTask,
        finishMeetingTask: taskApplication.finishMeetingTask,
        raiseHand: turnApplication.raiseHand,
        submitTurn: turnApplication.submitTurn,
        submitManagerPlan: turnApplication.submitManagerPlan,
        pause: controlApplication.pause,
        resume: controlApplication.resume,
        reassignTurn: controlApplication.reassignTurn,
        disposeRisk: controlApplication.disposeRisk,
        endMeeting: endApplication.endMeeting,
        scanExpiredSpeakerAttempts,
        findBySessionId: queryApplication.findBySessionId,
        async dispose() {
            runtimeController.abort(new Error("Meeting runtime disposed"));
            await deliveryWorkers.dispose();
            await Promise.all([...meetings.values()].map((stored) => stored.repository.close()));
            meetings.clear();
        }
    } satisfies MeetingRuntimeWithCallerLookup;
}
