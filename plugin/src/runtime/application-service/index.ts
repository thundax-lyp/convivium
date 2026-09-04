import type { Agent } from "@deepseek-ai/dsh-agent";
import type { DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import {
    DomainError,
    failSpeakerAttempt,
    isMeetingStateV2,
    nextManagerPlanningIds,
    type MeetingState
} from "../../domain/index.js";
import { RepositoryError } from "../../repository/errors.js";
import {
    DomainRepositoryRegistry,
    type DomainFacilityPort
} from "../../repository/domain/domain-repository-registry.js";
import { openMeetingRepository } from "../meeting-runtime.js";
import type { DomainEventInput, JsonObject } from "../meeting-runtime.js";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { RepositoryAuthorizationValidator } from "../meeting-runtime.js";
import {
    createMeetingDeliveryDispatcher,
    createMeetingDeliveryWorkerService,
    scanMeetingMailTimeouts
} from "../services/meeting-dispatch-service.js";
import { resolveArchiveCleanupRuntime } from "../services/meeting-session-service.js";
import {
    createDeveloperMarkdownService,
    type DeveloperMarkdownService,
    type DeveloperMarkdownWarning
} from "../services/developer-markdown-service.js";
import type { AgentCatalogPort } from "../services/agent-catalog.js";
import { recoverArchive } from "../services/meeting-archive-service.js";
import {
    createMeetingRehydrationService,
    LocalMeetingRecoveryUnavailableError,
    type MeetingRehydrationService
} from "../services/meeting-recovery-service.js";
import { createMeetingTurnApplication, type ManagerFallbackInput } from "./meeting-turn.js";
import { createMeetingQueryApplication } from "./meeting-query.js";
import { createMeetingApplication } from "./create-meeting.js";
import { createMeetingTaskApplication } from "./meeting-task.js";
import { createMeetingControlApplication } from "./meeting-control.js";
import { createMeetingEndApplication } from "./meeting-end.js";
import { createMeetingMailApplication } from "./meeting-mail.js";
import { createMeetingDecisionApplication } from "./meeting-decision.js";
import type { StoredMeeting } from "./types.js";
import { captureManagerCatalogBinding } from "../services/agent-catalog.js";
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
    FinishMeetingMailInputV1,
    MeetingMailResultV1,
    SendMeetingMessageInputV1,
    TurnSubmissionV1,
    CaptainDecisionAcceptanceInputV1,
    CaptainDecisionAcceptanceResultV1,
    CaptainDecisionDispositionInputV1,
    CaptainDecisionDispositionResultV1
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
    acceptDecision(
        input: CaptainDecisionAcceptanceInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1> | ProtocolErrorV1>;
    disposeDecision(
        input: CaptainDecisionDispositionInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CaptainDecisionDispositionResultV1> | ProtocolErrorV1>;
    sendMeetingMessage(
        input: SendMeetingMessageInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingMailResultV1> | ProtocolErrorV1>;
    finishMeetingMail(
        input: FinishMeetingMailInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingMailResultV1> | ProtocolErrorV1>;
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
    readonly storageDomain: Pick<DomainFacility, "open"> | DomainFacilityPort;
    readonly provider: string;
    readonly continuable: Pick<
        SubagentRuntime,
        "startContinuable" | "followup" | "listDescendants"
    > &
        Partial<Pick<SubagentRuntime, "listChildren" | "interrupt" | "drainContinuableChildren">>;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly maxParticipants?: number;
    readonly outboxPollMs?: number;
    readonly speakerAttemptTimeoutMs?: number;
    readonly signal?: AbortSignal;
    readonly now?: () => number;
    readonly taskEvidenceResolver?: AuthorizedTaskEvidenceResolver;
    readonly timeoutScanSleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
    readonly agentCatalog?: AgentCatalogPort;
    readonly developerMarkdown?: {
        readonly workspaceRoot: string;
        readonly warn: (warning: DeveloperMarkdownWarning) => void;
    };
}

interface InternalCreateStatusRuntimeOptions extends CreateStatusRuntimeOptions {
    readonly repositoryRegistry: Promise<DomainRepositoryRegistry>;
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
    reassignLocalTurn(
        input: ReassignTurnInputV1
    ): Promise<ProtocolSuccessV1<ReassignTurnResultV1> | ProtocolErrorV1>;
    endLocalMeeting(
        input: EndMeetingInputV1
    ): Promise<ProtocolSuccessV1<EndMeetingResultV1> | ProtocolErrorV1>;
}

export { LocalMeetingRecoveryUnavailableError } from "../services/meeting-recovery-service.js";

export type MeetingRuntimeWithCallerLookup = MeetingToolRuntime &
    MeetingOwnershipLookup & {
        scanExpiredSpeakerAttempts(): Promise<void>;
    } & LocalMeetingWebRuntime & { dispose(): Promise<void> };

export function defaultTimeoutScanSleep(delayMs: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

function isConcurrentTimeoutLoser(error: unknown): boolean {
    return (
        (error instanceof RepositoryError &&
            (error.code === "VERSION_CONFLICT" || error.code === "IDEMPOTENCY_CONFLICT")) ||
        (error instanceof DomainError && error.code === "STALE_ATTEMPT")
    );
}

export function createCreateStatusRuntime(
    options: CreateStatusRuntimeOptions
): MeetingRuntimeWithCallerLookup {
    let developerMarkdownService: DeveloperMarkdownService | undefined;
    const repositoryRegistry = DomainRepositoryRegistry.open({
        storageDomain: options.storageDomain,
        authorizationValidator: options.authorizationValidator,
        now: options.now,
        onProjectionCommitted: (snapshot) => developerMarkdownService?.schedule(snapshot)
    });
    if (options.developerMarkdown !== undefined) {
        developerMarkdownService = createDeveloperMarkdownService({
            workspaceRoot: options.developerMarkdown.workspaceRoot,
            openRepository: (teamId, meetingId) =>
                openMeetingRepository({ registry: repositoryRegistry, teamId, meetingId }),
            now: options.now,
            warn: options.developerMarkdown.warn
        });
    }
    const runtimeOptions: InternalCreateStatusRuntimeOptions = {
        ...options,
        repositoryRegistry
    };
    const meetings = new Map<string, StoredMeeting>();
    const deliveryWorkers = createMeetingDeliveryWorkerService({
        pollMs: options.outboxPollMs ?? 1_000,
        now: options.now
    });
    const deliveryDispatcher = createMeetingDeliveryDispatcher({
        continuable: options.continuable,
        now: options.now
    });
    const runtimeController = new AbortController();
    const taskEvidenceResolver = options.taskEvidenceResolver ?? meetingTaskEvidenceResolver;
    const signal =
        options.signal === undefined
            ? runtimeController.signal
            : AbortSignal.any([options.signal, runtimeController.signal]);
    const timeoutController = new AbortController();
    const timeoutSignal = AbortSignal.any([signal, timeoutController.signal]);
    const timeoutDispatchHolds = new Map<string, Promise<void>>();
    const timeoutAttemptsInFlight = new Set<string>();
    const holdTimeoutDispatch = (meetingId: string): (() => void) => {
        let release!: () => void;
        const hold = new Promise<void>((resolve) => {
            release = resolve;
        });
        timeoutDispatchHolds.set(meetingId, hold);
        return () => {
            if (timeoutDispatchHolds.get(meetingId) === hold) {
                timeoutDispatchHolds.delete(meetingId);
            }
            release();
        };
    };
    const repositoryRecovery = createMeetingRehydrationService({
        registry: repositoryRegistry,
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
        ensureWorker(stored);
        await recoverArchive({
            repository: stored.repository,
            parent: stored.parent,
            runtime: resolveArchiveCleanupRuntime(options.continuable),
            signal,
            now: options.now?.() ?? Date.now()
        });
    }

    function assertLocalArchiveRecoveryAvailable(stored: StoredMeeting): void {
        if (
            stored.parent === undefined ||
            resolveArchiveCleanupRuntime(options.continuable) === undefined
        ) {
            throw new LocalMeetingRecoveryUnavailableError(
                "Local meeting archive recovery is unavailable."
            );
        }
    }

    async function recoverArchiveForLocal(stored: StoredMeeting): Promise<void> {
        assertLocalArchiveRecoveryAvailable(stored);
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

    const fallbackManagerPlanning: {
        current?: (input: ManagerFallbackInput) => Promise<void>;
    } = {};

    function ensureWorker(stored: StoredMeeting): void {
        const meetingId = stored.repository.meetingId;
        deliveryWorkers.ensure({
            meetingId,
            repository: stored.repository,
            parent: stored.parent,
            dispatch: async (item, workerSignal) => {
                await timeoutDispatchHolds.get(meetingId);
                return deliveryDispatcher.dispatch({
                    repository: stored.repository,
                    parent: stored.parent!,
                    meetingId,
                    signal: AbortSignal.any([signal, workerSignal]),
                    item
                });
            },
            scan: async (now) => {
                if (stored.parent === undefined) return;
                await scanMeetingMailTimeouts({
                    repository: stored.repository,
                    parent: stored.parent,
                    continuable: options.continuable,
                    now
                });
            },
            onTerminalFailure: async (item, _errorCode, failedAt) => {
                const payload = item.payload as { role?: string; planningAttemptId?: string };
                if (payload.role !== "manager" || payload.planningAttemptId === undefined) return;
                const snapshot = await stored.repository.read();
                const attempt = (snapshot.state as unknown as MeetingState).manager
                    .currentPlanningAttempt;
                if (attempt?.id !== payload.planningAttemptId || attempt.status !== "running")
                    return;
                await fallbackManagerPlanning.current?.({
                    repository: stored.repository,
                    meetingId: stored.repository.meetingId,
                    attemptId: attempt.id,
                    reasonCode: "manager_delivery_retry_exhausted",
                    observedMeetingVersion: attempt.observedMeetingVersion,
                    now: failedAt
                });
            }
        });
    }

    const createMeeting = createMeetingApplication({
        runtime: runtimeOptions,
        meetings,
        recovery,
        deliveryWorkers,
        ensureWorker,
        signal
    });
    const taskApplication = createMeetingTaskApplication({
        options: runtimeOptions,
        meetings,
        recovery
    });
    const turnApplication = createMeetingTurnApplication({
        options: runtimeOptions,
        meetings,
        recovery,
        deliveryWorkers,
        taskEvidenceResolver
    });
    fallbackManagerPlanning.current = turnApplication.fallbackManagerPlanning;
    const controlApplication = createMeetingControlApplication({
        options: runtimeOptions,
        meetings,
        recovery,
        deliveryWorkers,
        ensureWorker
    });
    const endApplication = createMeetingEndApplication({
        options: runtimeOptions,
        meetings,
        recovery,
        deliveryWorkers,
        recoverArchiveForCaptain,
        assertLocalArchiveRecoveryAvailable,
        recoverArchiveForLocal
    });
    const mailApplication = createMeetingMailApplication({
        options: runtimeOptions,
        meetings,
        recovery,
        deliveryWorkers,
        ensureWorker
    });
    const decisionApplication = createMeetingDecisionApplication({
        options: runtimeOptions,
        meetings,
        recovery
    });

    async function scanExpiredSpeakerAttempts(): Promise<void> {
        await recovery.rehydrate();
        const now = options.now?.() ?? Date.now();
        let firstError: unknown;
        for (const stored of meetings.values()) {
            let releaseDispatch: (() => void) | undefined;
            let timeoutAttemptId: string | undefined;
            let committed = false;
            try {
                const parent = stored.parent;
                if (parent === undefined) continue;
                await scanMeetingMailTimeouts({
                    repository: stored.repository,
                    parent,
                    continuable: options.continuable,
                    now
                });
                const current = await stored.repository.read();
                const state = current.state as unknown as MeetingState;
                const planningAttempt = state.manager.currentPlanningAttempt;
                if (
                    state.status === "running" &&
                    planningAttempt?.status === "running" &&
                    planningAttempt.deadlineAt !== undefined &&
                    planningAttempt.deadlineAt <= now
                ) {
                    if (timeoutAttemptsInFlight.has(planningAttempt.id)) continue;
                    timeoutAttemptsInFlight.add(planningAttempt.id);
                    try {
                        await fallbackManagerPlanning.current?.({
                            repository: stored.repository,
                            meetingId: stored.repository.meetingId,
                            attemptId: planningAttempt.id,
                            reasonCode: "manager_timeout",
                            observedMeetingVersion: planningAttempt.observedMeetingVersion,
                            now
                        });
                    } finally {
                        timeoutAttemptsInFlight.delete(planningAttempt.id);
                    }
                    deliveryWorkers.wake(stored.repository.meetingId);
                    continue;
                }
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
                if (timeoutAttemptsInFlight.has(attempt.attemptId)) continue;
                timeoutAttemptsInFlight.add(attempt.attemptId);
                timeoutAttemptId = attempt.attemptId;
                releaseDispatch = holdTimeoutDispatch(stored.repository.meetingId);
                const planningIds = nextManagerPlanningIds(state);
                const preview = failSpeakerAttempt(state, {
                    meetingId: state.id,
                    participantId: attempt.participantId,
                    turnId: attempt.turnId,
                    stepId: attempt.stepId,
                    attemptId: attempt.attemptId,
                    deliveryId: attempt.deliveryId,
                    agendaItemId: turn.agendaItemId,
                    now,
                    nextPlanningAttemptId: planningIds.planningAttemptId,
                    nextPlanningDeliveryId: planningIds.deliveryId,
                    catalogBinding: { kind: "none" }
                });
                const catalogBinding =
                    preview.state.manager.currentPlanningAttempt?.id ===
                        planningIds.planningAttemptId && isMeetingStateV2(state)
                        ? await captureManagerCatalogBinding(options.agentCatalog, {
                              teamId: stored.teamId,
                              meetingId: stored.repository.meetingId,
                              captainSessionId: stored.captainSessionId
                          })
                        : { kind: "none" as const };
                await stored.repository.execute({
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
                        const planningIds = nextManagerPlanningIds(
                            snapshot.state as unknown as MeetingState
                        );
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
                                nextPlanningAttemptId: planningIds.planningAttemptId,
                                nextPlanningDeliveryId: planningIds.deliveryId,
                                catalogBinding
                            }
                        );
                        const transitionState =
                            transition.state.manager.currentPlanningAttempt === undefined
                                ? transition.state
                                : {
                                      ...transition.state,
                                      managerPlanningSeq: planningIds.managerPlanningSeq
                                  };
                        const nextAttempt =
                            transitionState.currentTurn?.steps[
                                transitionState.currentTurn.currentStepIndex
                            ]?.attempt;
                        const nextPlanningAttempt = transitionState.manager.currentPlanningAttempt;
                        return {
                            state: transitionState as unknown as JsonObject,
                            result: { expiredAttemptId: attempt.attemptId },
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox: nextAttempt
                                ? [
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
                                : nextPlanningAttempt
                                  ? [
                                        {
                                            deliveryId: nextPlanningAttempt.deliveryId,
                                            kind: "dispatch" as const,
                                            payload: {
                                                role: "manager",
                                                planningAttemptId: nextPlanningAttempt.id
                                            }
                                        }
                                    ]
                                  : []
                        };
                    }
                });
                committed = true;
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
                    try {
                        options.continuable.interrupt(ownership.sessionId as never, {
                            kind: "ancestor",
                            agent: parent
                        });
                    } catch {
                        // Timeout facts are committed before this best-effort DSH effect.
                    }
                }
                if (
                    ownership !== undefined &&
                    typeof options.continuable.drainContinuableChildren === "function"
                ) {
                    try {
                        await options.continuable.drainContinuableChildren(parent, [
                            ownership.sessionId as never
                        ]);
                    } catch {
                        // A failed drain does not roll back the committed timeout fact.
                    }
                }
            } catch (error) {
                if (isConcurrentTimeoutLoser(error)) continue;
                firstError ??= error;
            } finally {
                if (timeoutAttemptId !== undefined)
                    timeoutAttemptsInFlight.delete(timeoutAttemptId);
                releaseDispatch?.();
                if (committed) deliveryWorkers.wake(stored.repository.meetingId);
            }
        }
        if (firstError !== undefined) throw firstError;
    }

    const scanSleep = options.timeoutScanSleep ?? defaultTimeoutScanSleep;
    const timeoutMonitor = (async () => {
        while (!timeoutSignal.aborted) {
            try {
                await scanExpiredSpeakerAttempts();
            } catch {
                // The public scan preserves the error. The lifecycle monitor retries on its next poll.
            }
            try {
                await scanSleep(options.outboxPollMs ?? 1_000, timeoutSignal);
            } catch {
                if (timeoutSignal.aborted) return;
                throw new Error("Speaker timeout monitor sleep failed.");
            }
        }
    })();

    return {
        createMeeting,
        sendMeetingMessage: mailApplication.sendMeetingMessage,
        finishMeetingMail: mailApplication.finishMeetingMail,
        getStatus: queryApplication.getStatus,
        listLocalMeetings: queryApplication.listLocalMeetings,
        getLocalMeetingStatus: queryApplication.getLocalMeetingStatus,

        pauseLocalMeeting: controlApplication.pauseLocalMeeting,
        resumeLocalMeeting: controlApplication.resumeLocalMeeting,
        reassignLocalTurn: controlApplication.reassignLocalTurn,
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
        acceptDecision: decisionApplication.acceptDecision,
        disposeDecision: decisionApplication.disposeDecision,
        endMeeting: endApplication.endMeeting,
        endLocalMeeting: endApplication.endLocalMeeting,
        scanExpiredSpeakerAttempts,
        findBySessionId: queryApplication.findBySessionId,
        async dispose() {
            runtimeController.abort(new Error("Meeting runtime disposed"));
            timeoutController.abort(new Error("Speaker timeout monitor disposed"));
            await timeoutMonitor;
            await deliveryWorkers.dispose();
            await developerMarkdownService?.dispose();
            await (await repositoryRegistry).close();
            meetings.clear();
        }
    } satisfies MeetingRuntimeWithCallerLookup;
}
