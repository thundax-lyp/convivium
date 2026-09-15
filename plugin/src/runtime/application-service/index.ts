import { emitDiagnostic } from "@/repository/diagnostics.js";
import { randomUUID } from "node:crypto";
import { reconcileMeetingSessions } from "@/runtime/services/meeting-session-recovery.js";
import { createMeetingAttendanceApplication } from "./meeting-attendance.js";
import { createMeetingContributionApplication } from "./meeting-contribution.js";
import {
    scanContributionTimeouts,
    recoverContributionWork,
    recordContributionDeliveryFailure
} from "@/runtime/services/contribution-runtime-service.js";
import {
    DomainError,
    failSpeakerAttempt,
    isMeetingStateV2,
    nextManagerPlanningIds,
    type LegacyMeetingState
} from "@/domain/index.js";
import { RepositoryError } from "@/repository/errors.js";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { openMeetingRepository } from "@/runtime/meeting-runtime.js";
import type { DomainEventInput, JsonObject } from "@/runtime/meeting-runtime.js";
import {
    createMeetingDeliveryDispatcher,
    createMeetingDeliveryWorkerService,
    scanMeetingMailTimeouts
} from "@/runtime/services/meeting-dispatch-service.js";
import { resolveArchiveCleanupRuntime } from "@/runtime/services/meeting-session-service.js";
import {
    createDeveloperMarkdownService,
    type DeveloperMarkdownService
} from "@/runtime/services/developer-markdown-service.js";
import { recoverArchive } from "@/runtime/services/meeting-archive-service.js";
import {
    createMeetingRehydrationService,
    LocalMeetingRecoveryUnavailableError,
    type MeetingRehydrationService
} from "@/runtime/services/meeting-recovery-service.js";
import { createMeetingTurnApplication, type ManagerFallbackInput } from "./meeting-turn.js";
import { createMeetingQueryApplication } from "./meeting-query.js";
import { createMeetingApplication } from "./create-meeting.js";
import { createMeetingTaskApplication } from "./meeting-task.js";
import { createMeetingControlApplication } from "./meeting-control.js";
import { createMeetingEndApplication } from "./meeting-end.js";
import { createMeetingMailApplication } from "./meeting-mail.js";
import { createMeetingDecisionApplication } from "./meeting-decision.js";
import { createMeetingAgendaCandidateApplication } from "./meeting-agenda-candidate.js";
import type { StoredMeeting } from "./types.js";
import { captureManagerCatalogBinding } from "@/runtime/services/agent-catalog.js";
import { createMeetingRefreshFeed } from "@/runtime/services/meeting-refresh-feed.js";

import type {
    MeetingToolCaller,
    CreateStatusRuntimeOptions,
    MeetingRuntimeWithCallerLookup
} from "./types.js";
export type {
    MeetingToolCaller,
    MeetingToolRuntime,
    CreateStatusRuntimeOptions,
    LocalMeetingWebRuntime,
    MeetingRuntimeWithCallerLookup
} from "./types.js";

interface InternalCreateStatusRuntimeOptions extends CreateStatusRuntimeOptions {
    readonly repositoryRegistry: Promise<DomainRepositoryRegistry>;
}

export { LocalMeetingRecoveryUnavailableError } from "@/runtime/services/meeting-recovery-service.js";

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

function hasExpiredManagerPlanning(state: LegacyMeetingState, now: number): boolean {
    const planningAttempt = state.manager.currentPlanningAttempt;
    return (
        state.status === "running" &&
        planningAttempt?.status === "running" &&
        planningAttempt.deadlineAt !== undefined &&
        planningAttempt.deadlineAt <= now
    );
}

function hasExpiredSpeakerAttempt(state: LegacyMeetingState, now: number): boolean {
    const turn = state.currentTurn;
    const step = turn?.steps[turn.currentStepIndex];
    const attempt = step?.attempt;
    return (
        state.status === "running" &&
        turn?.status === "running" &&
        step?.status === "running" &&
        attempt?.status === "running" &&
        attempt.deadlineAt !== undefined &&
        attempt.deadlineAt <= now
    );
}

export function createCreateStatusRuntime(
    options: CreateStatusRuntimeOptions
): MeetingRuntimeWithCallerLookup {
    let developerMarkdownService: DeveloperMarkdownService | undefined;
    const refreshFeed = createMeetingRefreshFeed();
    const repositoryRegistry = DomainRepositoryRegistry.open({
        storageDomain: options.storageDomain,
        onDiagnostic: options.onDiagnostic,
        authorizationValidator: options.authorizationValidator,
        now: options.now,
        onProjectionCommitted: (snapshot) => {
            developerMarkdownService?.schedule(snapshot);
            refreshFeed.notify(snapshot.meetingId, snapshot.version);
        }
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
    const contributionRecoveryEpoch = randomUUID();
    const recoveredContributionMeetings = new Set<string>();
    const deliveryWorkers = createMeetingDeliveryWorkerService({
        pollMs: options.outboxPollMs ?? 1_000,
        now: options.now
    });
    const deliveryDispatcher = createMeetingDeliveryDispatcher({
        continuable: options.continuable,
        now: options.now
    });
    const runtimeController = new AbortController();
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
    const creatingMeetings = new Map<string, number>();
    const holdCreation = (meetingId: string) => {
        creatingMeetings.set(meetingId, (creatingMeetings.get(meetingId) ?? 0) + 1);
        return () => {
            const count = creatingMeetings.get(meetingId)! - 1;
            if (count === 0) creatingMeetings.delete(meetingId);
            else creatingMeetings.set(meetingId, count);
        };
    };
    const {
        recovery,
        recoverArchiveForCaptain,
        assertLocalArchiveRecoveryAvailable,
        recoverContributionArchive,
        recoverArchiveForLocal
    } = createRuntimeRecoveryFacade({
        options,
        repositoryRegistry,
        creatingMeetings,
        meetings,
        signal,
        recoveredContributionMeetings,
        contributionRecoveryEpoch,
        ensureWorker
    });

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
                await scanContributionTimeouts({ repository: stored.repository, now });
                await recoverContributionArchive(stored, now);
                await scanMeetingMailTimeouts({
                    repository: stored.repository,
                    parent: stored.parent,
                    continuable: options.continuable,
                    now
                });
            },
            onTerminalFailure: async (item, _errorCode, failedAt) => {
                const payload = item.payload as { role?: string; planningAttemptId?: string };
                if (payload.role === "contribution" || payload.role === "contribution_manager") {
                    await recordContributionDeliveryFailure({
                        repository: stored.repository,
                        item,
                        errorCode: _errorCode,
                        now: failedAt
                    });
                    return;
                }
                if (payload.role !== "manager" || payload.planningAttemptId === undefined) return;
                const snapshot = await stored.repository.read();
                const attempt = (snapshot.state as unknown as LegacyMeetingState).manager
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
        holdCreation,
        runtime: runtimeOptions,
        meetings,
        recovery,
        deliveryWorkers,
        ensureWorker,
        markContributionRecovered: (meetingId) => recoveredContributionMeetings.add(meetingId),
        signal
    });
    const taskApplication = createMeetingTaskApplication({
        meetings,
        recovery
    });
    const turnApplication = createMeetingTurnApplication({
        meetings,
        recovery
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
        meetings,
        recovery
    });
    const attendanceApplication = createMeetingAttendanceApplication({
        options: runtimeOptions,
        meetings,
        recovery
    });
    const contributionApplication = createMeetingContributionApplication({
        options,
        meetings,
        recovery,
        deliveryWorkers
    });
    const decisionApplication = createMeetingDecisionApplication({
        options: runtimeOptions,
        meetings,
        recovery
    });
    const agendaCandidateApplication = createMeetingAgendaCandidateApplication({
        options: runtimeOptions,
        meetings,
        recovery
    });

    const scanExpiredSpeakerAttempts = createRuntimeTimeoutScanner({
        options,
        recovery,
        meetings,
        timeoutAttemptsInFlight,
        fallbackManagerPlanning,
        deliveryWorkers,
        holdTimeoutDispatch,
        recoverContributionArchive
    });

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
        watchLocalMeetingUpdates: (watchSignal) => refreshFeed.watch(watchSignal),
        ...contributionApplication,
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
        disposeLocalRisk: controlApplication.disposeLocalRisk,
        acceptLocalDecision: decisionApplication.acceptLocalDecision,
        disposeLocalDecision: decisionApplication.disposeLocalDecision,
        disposeRisk: controlApplication.disposeRisk,
        acceptDecision: decisionApplication.acceptDecision,
        disposeDecision: decisionApplication.disposeDecision,
        disposeAttendanceRecommendation: attendanceApplication.disposeAttendanceRecommendation,
        disposeAgendaCandidate: agendaCandidateApplication.disposeAgendaCandidate,
        endMeeting: endApplication.endMeeting,
        endLocalMeeting: endApplication.endLocalMeeting,
        scanExpiredSpeakerAttempts,
        findBySessionId: queryApplication.findBySessionId,
        async dispose() {
            refreshFeed.dispose();
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

interface RuntimeRecoveryFacadeOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly repositoryRegistry: Promise<DomainRepositoryRegistry>;
    readonly creatingMeetings: Map<string, number>;
    readonly meetings: Map<string, StoredMeeting>;
    readonly signal: AbortSignal;
    readonly recoveredContributionMeetings: Set<string>;
    readonly contributionRecoveryEpoch: string;
    readonly ensureWorker: (stored: StoredMeeting) => void;
}

function createRuntimeRecoveryFacade(dependencies: RuntimeRecoveryFacadeOptions) {
    const {
        options,
        repositoryRegistry,
        creatingMeetings,
        meetings,
        signal,
        recoveredContributionMeetings,
        contributionRecoveryEpoch,
        ensureWorker
    } = dependencies;
    const repositoryRecovery = createMeetingRehydrationService({
        registry: repositoryRegistry,
        isCreating: (meetingId) => creatingMeetings.has(meetingId),
        meetings,
        signal,
        now: options.now,
        ...(options.getCaptainParent === undefined
            ? {}
            : {
                  reconcile: async (repository, existing) => {
                      if (existing?.parent !== undefined) return existing.parent;
                      const recovered = await repository.recover();
                      if (
                          recovered.snapshot?.state.status === "archived" &&
                          recovered.sessionOwnership.every(
                              (item) =>
                                  item.lifecycleStatus === "closed" &&
                                  item.capabilityStatus === "revoked"
                          )
                      )
                          return;
                      if (
                          recovered.bootstrap.status === "creation_failed" &&
                          recovered.sessionOwnership.every(
                              (item) => item.lifecycleStatus === "closed"
                          )
                      )
                          return;
                      if (
                          recovered.bootstrap.status === "creating" &&
                          recovered.sessionOwnership.length === 0
                      ) {
                          await repository.updateBootstrap({
                              status: "creation_failed",
                              failureCode: "CREATION_INTERRUPTED",
                              now: options.now?.() ?? Date.now()
                          });
                          return;
                      }
                      const parentId = recovered.sessionOwnership[0]?.parentSessionId;
                      const parent =
                          parentId === undefined ? undefined : options.getCaptainParent!(parentId);
                      const lifecycle = resolveArchiveCleanupRuntime(options.continuable);
                      if (
                          parent === undefined &&
                          isMeetingStateV2(recovered.snapshot?.state) &&
                          recovered.snapshot.state.contributions !== undefined
                      )
                          return;
                      if (parent === undefined || lifecycle === undefined) {
                          const errorCode =
                              parent === undefined
                                  ? "RECOVERY_CAPTAIN_UNAVAILABLE"
                                  : "RECOVERY_LIFECYCLE_UNAVAILABLE";
                          emitDiagnostic(options.onDiagnostic, {
                              meetingId: repository.meetingId,
                              meetingVersion: recovered.snapshot?.version ?? 0,
                              eventSeq: Number(recovered.snapshot?.state.eventSeq ?? 0),
                              eventType: "recovery.failed",
                              timestamp: options.now?.() ?? Date.now(),
                              errorCode,
                              metrics: { recoveryFailures: 1 }
                          });
                          throw new LocalMeetingRecoveryUnavailableError(errorCode);
                      }
                      await reconcileMeetingSessions({
                          onDiagnostic: options.onDiagnostic,
                          repository,
                          parent,
                          runtime: {
                              ...lifecycle,
                              listChildren: lifecycle.listChildren.bind(lifecycle),
                              interrupt: lifecycle.interrupt.bind(lifecycle),
                              drainContinuableChildren:
                                  lifecycle.drainContinuableChildren.bind(lifecycle),
                              listDescendants: options.continuable.listDescendants.bind(
                                  options.continuable
                              ),
                              startContinuable: options.continuable.startContinuable.bind(
                                  options.continuable
                              )
                          },
                          signal,
                          now: options.now?.() ?? Date.now()
                      });
                      return parent;
                  }
              })
    });
    const recovery: MeetingRehydrationService = {
        async rehydrate(mode) {
            const knownMeetingIds = new Set(meetings.keys());
            const snapshots = await repositoryRecovery.rehydrate(mode);
            for (const [meetingId, stored] of meetings) {
                if (
                    stored.parent === undefined ||
                    recoveredContributionMeetings.has(meetingId) ||
                    creatingMeetings.has(meetingId)
                )
                    continue;
                const snapshot = await stored.repository.read();
                if (!isMeetingStateV2(snapshot.state) || snapshot.state.contributions === undefined)
                    continue;
                await recoverContributionWork({
                    repository: stored.repository,
                    now: options.now?.() ?? Date.now(),
                    recoveryEpoch: contributionRecoveryEpoch
                });
                recoveredContributionMeetings.add(meetingId);
                snapshots?.set(meetingId, await stored.repository.read());
                ensureWorker(stored);
            }
            if (mode !== undefined && mode.kind !== "agent_best_effort") return snapshots;
            for (const [meetingId, stored] of meetings) {
                if (knownMeetingIds.has(meetingId)) continue;
                if (stored.parent !== undefined) ensureWorker(stored);
                try {
                    await recoverArchive({
                        onDiagnostic: options.onDiagnostic,
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
        if (stored.parent === undefined) {
            const lifecycle = resolveArchiveCleanupRuntime(options.continuable);
            if (lifecycle !== undefined)
                await reconcileMeetingSessions({
                    onDiagnostic: options.onDiagnostic,
                    repository: stored.repository,
                    parent: caller.agent,
                    runtime: {
                        listChildren: lifecycle.listChildren.bind(lifecycle),
                        interrupt: lifecycle.interrupt.bind(lifecycle),
                        drainContinuableChildren:
                            lifecycle.drainContinuableChildren.bind(lifecycle),
                        listDescendants: options.continuable.listDescendants.bind(
                            options.continuable
                        ),
                        startContinuable: options.continuable.startContinuable.bind(
                            options.continuable
                        )
                    },
                    signal,
                    now: options.now?.() ?? Date.now()
                });
            stored.parent = caller.agent;
        }
        if (!recoveredContributionMeetings.has(stored.repository.meetingId)) {
            const snapshot = await stored.repository.read();
            if (isMeetingStateV2(snapshot.state) && snapshot.state.contributions !== undefined) {
                await recoverContributionWork({
                    repository: stored.repository,
                    now: options.now?.() ?? Date.now(),
                    recoveryEpoch: contributionRecoveryEpoch
                });
                recoveredContributionMeetings.add(stored.repository.meetingId);
            }
        }
        ensureWorker(stored);
        await recoverArchive({
            onDiagnostic: options.onDiagnostic,
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

    async function recoverContributionArchive(stored: StoredMeeting, now: number): Promise<void> {
        const snapshot = await stored.repository.read();
        if (!isMeetingStateV2(snapshot.state) || snapshot.state.contributions === undefined) return;
        await recoverArchive({
            onDiagnostic: options.onDiagnostic,
            repository: stored.repository,
            parent: stored.parent,
            runtime: resolveArchiveCleanupRuntime(options.continuable),
            signal,
            now
        });
    }

    async function recoverArchiveForLocal(stored: StoredMeeting): Promise<void> {
        assertLocalArchiveRecoveryAvailable(stored);
        await recoverArchive({
            onDiagnostic: options.onDiagnostic,
            repository: stored.repository,
            parent: stored.parent,
            runtime: resolveArchiveCleanupRuntime(options.continuable),
            signal,
            now: options.now?.() ?? Date.now()
        });
    }

    return {
        recovery,
        recoverArchiveForCaptain,
        assertLocalArchiveRecoveryAvailable,
        recoverContributionArchive,
        recoverArchiveForLocal
    };
}

interface RuntimeTimeoutScannerOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly recovery: MeetingRehydrationService;
    readonly meetings: Map<string, StoredMeeting>;
    readonly timeoutAttemptsInFlight: Set<string>;
    readonly fallbackManagerPlanning: { current?: (input: ManagerFallbackInput) => Promise<void> };
    readonly deliveryWorkers: ReturnType<typeof createMeetingDeliveryWorkerService>;
    readonly holdTimeoutDispatch: (meetingId: string) => () => void;
    readonly recoverContributionArchive: (stored: StoredMeeting, now: number) => Promise<void>;
}

function createRuntimeTimeoutScanner(dependencies: RuntimeTimeoutScannerOptions) {
    const {
        options,
        recovery,
        meetings,
        timeoutAttemptsInFlight,
        fallbackManagerPlanning,
        deliveryWorkers,
        holdTimeoutDispatch,
        recoverContributionArchive
    } = dependencies;
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
                const contributionSnapshot = await stored.repository.read();
                if (
                    isMeetingStateV2(contributionSnapshot.state) &&
                    contributionSnapshot.state.contributions !== undefined
                ) {
                    await scanContributionTimeouts({ repository: stored.repository, now });
                    await recoverContributionArchive(stored, now);
                    deliveryWorkers.wake(stored.repository.meetingId);
                    continue;
                }
                await scanMeetingMailTimeouts({
                    repository: stored.repository,
                    parent,
                    continuable: options.continuable,
                    now
                });
                const current = await stored.repository.read();
                const state = current.state as unknown as LegacyMeetingState;
                const planningAttempt = state.manager.currentPlanningAttempt;
                if (hasExpiredManagerPlanning(state, now) && planningAttempt !== undefined) {
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
                    !hasExpiredSpeakerAttempt(state, now) ||
                    turn === undefined ||
                    attempt === undefined
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
                            snapshot.state as unknown as LegacyMeetingState
                        );
                        const transition = failSpeakerAttempt(
                            snapshot.state as unknown as LegacyMeetingState,
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

    return scanExpiredSpeakerAttempts;
}
