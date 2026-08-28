import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    followupManagerSession,
    followupMeetingTaskSession,
    followupParticipantSession,
    type ArchiveSessionRuntime,
    type ContinuableFollowupRuntime,
    type ContinuableInspectionRuntime,
    type ContinuableLifecycleRuntime,
    type ContinuableStarter
} from "../dsh/index.js";
import {
    createMeetingTask as createMeetingTaskTransition,
    createHandRaise,
    completedTaskSnapshots,
    participantHasActiveMeetingTask,
    finishMeetingTask as finishMeetingTaskTransition,
    planRoundRobinTurn,
    endMeeting as endMeetingTransition,
    startMeetingTask as startMeetingTaskTransition,
    startManagerPlanning,
    submitManagerPlan as submitManagerPlanTransition,
    submitSpeakerAndAdvanceMeeting,
    transitionMeeting,
    type MeetingState,
    type MeetingTurn
} from "../domain/index.js";
import {
    createMeetingRuntime,
    createOutboxWorker,
    openMeetingRepository,
    recoverArchive,
    type DomainEventInput,
    type JsonObject,
    type MeetingCreationRuntimeDependencies,
    type MeetingRepositoryRuntime,
    type RepositoryAuthorizationValidator,
    meetingTaskEvidenceResolver,
    type AuthorizedTaskEvidenceResolver
} from "../runtime/index.js";
import { projectManagerMeetingContext, projectMeetingStatus } from "../projection/index.js";
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
    ProtocolSuccessV1
} from "../protocol/index.js";
import type { MeetingToolCaller, MeetingToolRuntime } from "./register-tools.js";
import type { MeetingOwnershipLookup } from "../dsh/index.js";
import { interruptAndDrainOwnedSessions } from "../dsh/index.js";

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
    readonly signal?: AbortSignal;
    readonly now?: () => number;
    readonly taskEvidenceResolver?: AuthorizedTaskEvidenceResolver;
}

interface ClaimedOutboxItem {
    id: string;
    deliveryId: string;
    payload: JsonObject;
    leaseOwner: string;
    leaseToken: string;
}

export type MeetingRuntimeWithCallerLookup = MeetingToolRuntime &
    MeetingOwnershipLookup & { dispose(): Promise<void> };

interface StoredMeeting {
    readonly teamId: string;
    readonly captainSessionId: string;
    readonly repository: MeetingRepositoryRuntime;
    readonly parent?: Agent;
}

type ArchiveCleanupRuntime = ArchiveSessionRuntime & ContinuableLifecycleRuntime;

function archiveCleanupRuntime(
    runtime: CreateStatusRuntimeOptions["continuable"]
): ArchiveCleanupRuntime | undefined {
    if (
        typeof runtime.listChildren !== "function" ||
        typeof runtime.interrupt !== "function" ||
        typeof runtime.drainContinuableChildren !== "function"
    ) {
        return undefined;
    }
    return runtime as ArchiveCleanupRuntime;
}

function terminalDispatchError(code: string, message: string): Error {
    return Object.assign(new Error(message), { code, retryable: false });
}

function requireDispatchableMeeting(
    state: MeetingState | undefined
): asserts state is MeetingState {
    if (
        state === undefined ||
        [
            "completed",
            "partial",
            "no_consensus",
            "cancelled",
            "failed",
            "archiving",
            "archived"
        ].includes(state.status)
    ) {
        throw terminalDispatchError(
            "MEETING_NOT_DISPATCHABLE",
            "Meeting is terminal or archiving and cannot dispatch work."
        );
    }
}

function success<T>(meetingId: string, meetingVersion: number, result: T): ProtocolSuccessV1<T> {
    return { protocolVersion: 1, ok: true, meetingId, meetingVersion, result };
}

function failure(
    code: ProtocolErrorV1["code"],
    message: string,
    retryable = false
): ProtocolErrorV1 {
    return { protocolVersion: 1, ok: false, code, message, retryable };
}

function repositoryPath(root: string, teamId: string, meetingId: string): string {
    if (!/^(?!\.\.?(?:$|[\\/]))[^\\/\0]+$/.test(teamId)) {
        throw new Error("Invalid teamId path component.");
    }
    return join(root, encodeURIComponent(teamId), `${encodeURIComponent(meetingId)}.sqlite`);
}

function stableMeetingId(input: CreateMeetingInputV1): string {
    return `meeting-${createHash("sha256")
        .update(`${input.teamId}\0${input.requestId}`)
        .digest("hex")
        .slice(0, 32)}`;
}

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

function requestHash(input: CreateMeetingInputV1): string {
    return JSON.stringify(input);
}

function participantResult(input: CreateMeetingInputV1, meetingId: string): CreateMeetingResultV1 {
    return {
        meetingId,
        meetingVersion: 0,
        status: "created",
        participants: input.participants.map(({ participantKey }) => ({
            participantKey,
            participantId: `participant-${participantKey}`
        }))
    };
}

function runningCreateResult(
    input: CreateMeetingInputV1,
    meetingId: string,
    meetingVersion: number
): CreateMeetingResultV1 {
    return {
        ...participantResult(input, meetingId),
        meetingVersion,
        status: "running"
    };
}

function commandError(
    error: unknown,
    fallback: ProtocolErrorV1["code"],
    message: string,
    context?: Partial<ProtocolErrorV1>,
    codeMap: Readonly<Record<string, ProtocolErrorV1["code"]>> = {}
) {
    const code =
        error && typeof error === "object" && "code" in error
            ? (error as { code?: unknown }).code
            : undefined;
    const mappedCode = typeof code === "string" ? (codeMap[code] ?? code) : fallback;
    return {
        ...failure(mappedCode, message, mappedCode === "VERSION_CONFLICT"),
        ...context,
        ...(error && typeof error === "object" && "meetingId" in error
            ? { meetingId: String((error as { meetingId: unknown }).meetingId) }
            : {})
    };
}

export function createCreateStatusRuntime(
    options: CreateStatusRuntimeOptions
): MeetingRuntimeWithCallerLookup {
    const meetings = new Map<string, StoredMeeting>();
    const workers = new Map<string, ReturnType<typeof createOutboxWorker>>();
    const runtimeController = new AbortController();
    const taskEvidenceResolver = options.taskEvidenceResolver ?? meetingTaskEvidenceResolver;
    const signal =
        options.signal === undefined
            ? runtimeController.signal
            : AbortSignal.any([options.signal, runtimeController.signal]);

    async function rehydrate() {
        const teams = await readdir(options.dataRoot, { withFileTypes: true }).catch(() => []);
        for (const team of teams) {
            if (!team.isDirectory()) continue;
            const files = await readdir(join(options.dataRoot, team.name)).catch(() => []);
            for (const file of files) {
                if (!file.endsWith(".sqlite")) continue;
                const meetingId = decodeURIComponent(file.slice(0, -7));
                const stored = meetings.get(meetingId);
                if (stored !== undefined) {
                    continue;
                }
                try {
                    const repository = await openMeetingRepository({
                        databasePath: join(options.dataRoot, team.name, file),
                        teamId: decodeURIComponent(team.name),
                        meetingId,
                        authorizationValidator: options.authorizationValidator
                    });
                    const recovered = await repository.recover();
                    const parentSessionId = recovered.sessionOwnership[0]?.parentSessionId;
                    if (
                        recovered.bootstrap.status !== "ready" ||
                        recovered.snapshot === undefined ||
                        parentSessionId === undefined
                    ) {
                        await repository.close();
                        continue;
                    }
                    const recoveredMeeting: StoredMeeting = {
                        teamId: decodeURIComponent(team.name),
                        captainSessionId: parentSessionId,
                        repository
                    };
                    meetings.set(meetingId, recoveredMeeting);
                    await recoverArchive({
                        repository,
                        signal,
                        now: options.now?.() ?? Date.now()
                    });
                } catch {
                    // Ignore unrelated or incomplete databases during startup discovery.
                }
            }
        }
    }

    async function dispatchInitialDelivery(
        repository: MeetingRepositoryRuntime,
        parent: Agent,
        meetingId: string,
        commandSignal: AbortSignal,
        item: ClaimedOutboxItem
    ) {
        const recovered = await repository.recover();
        requireDispatchableMeeting(
            recovered.snapshot?.state as unknown as MeetingState | undefined
        );
        const payload = item.payload as unknown as {
            participantId: string;
            attemptId: string;
            turnId: string;
        };
        const ownership = recovered.sessionOwnership.find(
            (candidate) => candidate.participantId === payload.participantId
        );
        if (ownership === undefined)
            throw terminalDispatchError(
                "SESSION_OWNERSHIP_MISSING",
                "Initial speaker Session ownership is missing."
            );
        if (
            ownership.parentSessionId !== String(parent.id) ||
            ownership.lifecycleStatus !== "active" ||
            ownership.capabilityStatus !== "active"
        ) {
            throw terminalDispatchError(
                "SESSION_CAPABILITY_REVOKED",
                "Speaker Session ownership is no longer authorized."
            );
        }
        await followupParticipantSession({
            runtime: options.continuable,
            parent,
            ownership,
            attempt: {
                attemptId: payload.attemptId,
                deliveryId: item.deliveryId,
                participantId: payload.participantId
            },
            prompt: [
                {
                    type: "text",
                    text: `Meeting ${meetingId} turn ${payload.turnId}: submit your statement.`
                }
            ],
            signal: commandSignal,
            authorize: async ({ attempt }) => {
                const latest = await repository.recover();
                const current = latest.snapshot?.state as unknown as MeetingState | undefined;
                const active = current?.currentTurn?.steps.find(
                    (step) => step.attempt?.attemptId === attempt.attemptId
                )?.attempt;
                if (
                    active?.deliveryId !== attempt.deliveryId ||
                    active.status !== "running" ||
                    !["pending", "accepted"].includes(active.deliveryStatus)
                ) {
                    throw terminalDispatchError(
                        "STALE_SPEAKER_ATTEMPT",
                        "Speaker attempt is no longer authorized."
                    );
                }
                const owned = latest.sessionOwnership.find(
                    (candidate) => candidate.sessionId === ownership.sessionId
                );
                if (owned?.lifecycleStatus !== "active" || owned.capabilityStatus !== "active") {
                    throw terminalDispatchError(
                        "SESSION_CAPABILITY_REVOKED",
                        "Speaker Session capability is no longer active."
                    );
                }
            }
        });
    }

    async function dispatchManagerPlanningDelivery(
        repository: MeetingRepositoryRuntime,
        parent: Agent,
        meetingId: string,
        commandSignal: AbortSignal,
        item: ClaimedOutboxItem
    ) {
        const recovered = await repository.recover();
        const payload = item.payload as unknown as {
            role: "manager";
            planningAttemptId: string;
        };
        const ownership = recovered.sessionOwnership.find(
            (candidate) => candidate.role === "manager"
        );
        if (ownership === undefined)
            throw terminalDispatchError(
                "SESSION_OWNERSHIP_MISSING",
                "Manager Session ownership is missing."
            );
        if (
            ownership.parentSessionId !== String(parent.id) ||
            ownership.lifecycleStatus !== "active" ||
            ownership.capabilityStatus !== "active"
        ) {
            throw terminalDispatchError(
                "SESSION_CAPABILITY_REVOKED",
                "Manager Session ownership is no longer authorized."
            );
        }
        const state = recovered.snapshot?.state as unknown as MeetingState | undefined;
        requireDispatchableMeeting(state);
        const dispatchableParticipantIds = state.participants
            .filter(
                (participant) =>
                    participant.status === "available" &&
                    !participantHasActiveMeetingTask(state, participant.id) &&
                    recovered.sessionOwnership.some(
                        (candidate) =>
                            candidate.role === "participant" &&
                            candidate.participantId === participant.id &&
                            candidate.lifecycleStatus === "active" &&
                            candidate.capabilityStatus === "active"
                    )
            )
            .map((participant) => participant.id);
        const managerContext = projectManagerMeetingContext(state, dispatchableParticipantIds);
        await followupManagerSession({
            runtime: options.continuable,
            parent,
            ownership,
            attempt: {
                planningAttemptId: payload.planningAttemptId,
                deliveryId: item.deliveryId
            },
            prompt: [{ type: "text", text: JSON.stringify(managerContext) }],
            signal: commandSignal,
            authorize: async ({ attempt }) => {
                const latest = await repository.recover();
                const current = latest.snapshot?.state as unknown as MeetingState | undefined;
                const active = current?.manager.currentPlanningAttempt;
                if (
                    active?.id !== attempt.planningAttemptId ||
                    active.deliveryId !== attempt.deliveryId ||
                    active.status !== "running"
                )
                    throw terminalDispatchError(
                        "STALE_MANAGER_ATTEMPT",
                        "Manager planning attempt is no longer authorized."
                    );
            }
        });
    }

    async function dispatchMeetingTaskDelivery(
        repository: MeetingRepositoryRuntime,
        parent: Agent,
        meetingId: string,
        commandSignal: AbortSignal,
        item: ClaimedOutboxItem
    ) {
        const recovered = await repository.recover();
        const payload = item.payload as unknown as {
            meetingTaskId: string;
            participantId: string;
            executionId: string;
        };
        const state = recovered.snapshot?.state as unknown as MeetingState | undefined;
        requireDispatchableMeeting(state);
        const task = state?.meetingTasks?.find(
            (candidate) =>
                candidate.meetingTaskId === payload.meetingTaskId &&
                candidate.participantId === payload.participantId
        );
        if (task === undefined || task.status !== "queued") {
            throw terminalDispatchError(
                "MEETING_TASK_NOT_QUEUED",
                "MeetingTask is no longer queued."
            );
        }
        const ownership = recovered.sessionOwnership.find(
            (candidate) =>
                candidate.role === "participant" &&
                candidate.participantId === task.participantId &&
                candidate.lifecycleStatus === "active" &&
                candidate.capabilityStatus === "active"
        );
        if (ownership === undefined || ownership.parentSessionId !== String(parent.id)) {
            throw terminalDispatchError(
                "SESSION_CAPABILITY_REVOKED",
                "Task Participant Session is unavailable."
            );
        }
        await followupMeetingTaskSession({
            runtime: options.continuable,
            parent,
            ownership,
            meetingTaskId: task.meetingTaskId,
            deliveryId: item.deliveryId,
            prompt: [
                {
                    type: "text",
                    text: [
                        `Execute MeetingTask ${task.meetingTaskId}: ${task.title}`,
                        `executionId: ${task.executionId}`,
                        `deliveryId: ${task.deliveryId}`,
                        task.description,
                        "Call convivium_start_meeting_task with deliveryId as requestId before executing, then call convivium_finish_meeting_task with executionId when done."
                    ].join("\n")
                }
            ],
            signal: commandSignal,
            authorize: async (phase) => {
                const latest = await repository.recover();
                const current = latest.snapshot?.state as unknown as MeetingState | undefined;
                const currentTask = current?.meetingTasks.find(
                    (candidate) => candidate.meetingTaskId === task.meetingTaskId
                );
                const meetingTerminal = [
                    "completed",
                    "partial",
                    "no_consensus",
                    "cancelled",
                    "failed",
                    "archiving",
                    "archived"
                ].includes(current?.status ?? "");
                const allowed =
                    phase === "before"
                        ? !meetingTerminal && currentTask?.status === "queued"
                        : !meetingTerminal &&
                          ["queued", "running", "completed", "failed"].includes(
                              currentTask?.status ?? ""
                          );
                if (!allowed)
                    throw terminalDispatchError(
                        "MEETING_TASK_NOT_EXECUTABLE",
                        "MeetingTask is no longer executable."
                    );
            }
        });
    }

    function ensureWorker(stored: StoredMeeting): void {
        const meetingId = stored.repository.meetingId;
        if (stored.parent === undefined || workers.has(meetingId)) return;
        const worker = createOutboxWorker({
            repository: stored.repository,
            owner: `worker:${meetingId}`,
            ttlMs: 60_000,
            batchSize: 1,
            pollMs: options.outboxPollMs ?? 1_000,
            dispatch: async (item, workerSignal) => {
                const dispatchSignal = AbortSignal.any([signal, workerSignal]);
                const payload = item.payload as unknown as {
                    role?: "manager" | "participant" | "meeting_task";
                };
                if (payload.role === "manager")
                    await dispatchManagerPlanningDelivery(
                        stored.repository,
                        stored.parent!,
                        meetingId,
                        dispatchSignal,
                        item
                    );
                else if (payload.role === "meeting_task")
                    await dispatchMeetingTaskDelivery(
                        stored.repository,
                        stored.parent!,
                        meetingId,
                        dispatchSignal,
                        item
                    );
                else
                    await dispatchInitialDelivery(
                        stored.repository,
                        stored.parent!,
                        meetingId,
                        dispatchSignal,
                        item
                    );
            },
            now: options.now
        });
        workers.set(meetingId, worker);
        void worker.start().catch(() => undefined);
    }

    async function readAuthorizedTask(
        stored: StoredMeeting,
        caller: MeetingToolCaller,
        meetingTaskId: string,
        executionId?: string
    ) {
        if (caller.kind !== "participant" || caller.participantId === undefined) return undefined;
        const recovered = await stored.repository.recover();
        const ownership = recovered.sessionOwnership.find(
            (candidate) =>
                candidate.sessionId === caller.sessionId &&
                candidate.role === "participant" &&
                candidate.participantId === caller.participantId &&
                candidate.lifecycleStatus === "active" &&
                candidate.capabilityStatus === "active"
        );
        if (ownership === undefined) return undefined;
        const state = recovered.snapshot?.state as unknown as MeetingState | undefined;
        const task = state?.meetingTasks?.find(
            (candidate) => candidate.meetingTaskId === meetingTaskId
        );
        return task === undefined ||
            task.participantId !== caller.participantId ||
            (executionId !== undefined && task.executionId !== executionId)
            ? undefined
            : { recovered, state: state!, task };
    }

    return {
        async createMeeting(input, caller, commandSignal) {
            if (caller.kind !== "captain" || caller.agent === undefined) {
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "Only a live Captain Agent can create a meeting."
                );
            }
            if (
                options.maxParticipants !== undefined &&
                input.participants.length > options.maxParticipants
            ) {
                return failure("INVALID_ARGUMENT", "The participant limit was exceeded.");
            }
            if (input.agenda.length === 0) {
                return failure("INVALID_ARGUMENT", "At least one agenda item is required.");
            }
            await rehydrate();
            const meetingId = stableMeetingId(input);
            const repository = await openMeetingRepository({
                databasePath: repositoryPath(options.dataRoot, input.teamId, meetingId),
                teamId: input.teamId,
                meetingId,
                authorizationValidator: options.authorizationValidator
            });
            const dependencies: MeetingCreationRuntimeDependencies = {
                repository,
                continuable: options.continuable,
                parent: caller.agent as Agent,
                provider: options.provider,
                authorization: {
                    callerBinding: `session:${caller.sessionId}`,
                    capabilityId: `captain:${caller.sessionId}`
                },
                allocateSessionId: (role, key) => `${meetingId}-${role}-${key}` as never,
                signal: commandSignal ?? signal,
                now: options.now,
                cleanup: async (created) => {
                    const recovered = await repository.recover();
                    const owned = recovered.sessionOwnership.filter((candidate) =>
                        created.some((item) => item.sessionId === candidate.sessionId)
                    );
                    const lifecycle = options.continuable as typeof options.continuable & {
                        interrupt?: (sessionId: never, authority: unknown) => void;
                        drainContinuableChildren?: (
                            parent: Agent,
                            ids: readonly never[]
                        ) => Promise<void>;
                    };
                    if (
                        caller.agent !== undefined &&
                        lifecycle.interrupt !== undefined &&
                        lifecycle.drainContinuableChildren !== undefined &&
                        owned.length > 0
                    ) {
                        await interruptAndDrainOwnedSessions({
                            runtime: lifecycle as never,
                            parent: caller.agent,
                            ownerships: owned
                        });
                    }
                    for (const ownership of owned) {
                        await repository.recordSessionOwnership(
                            {
                                ...ownership,
                                capabilityStatus: "revoked",
                                lifecycleStatus: "closed"
                            },
                            options.now?.() ?? Date.now()
                        );
                    }
                }
            };
            try {
                const existing = await repository.recover().catch(() => undefined);
                let resumeReadyCreate = false;
                if (
                    existing?.bootstrap.status === "ready" &&
                    existing.bootstrap.createResult !== undefined
                ) {
                    if (existing.bootstrap.requestHash !== requestHash(input)) {
                        await repository.close();
                        return failure(
                            "IDEMPOTENCY_CONFLICT",
                            "The create request conflicts with the persisted meeting."
                        );
                    }
                    const persistedCaptain = existing.sessionOwnership[0]?.parentSessionId;
                    if (persistedCaptain !== caller.sessionId) {
                        await repository.close();
                        return failure(
                            "UNAUTHORIZED_CALLER",
                            "Only the original meeting Captain can replay creation."
                        );
                    }
                    const resident = meetings.get(meetingId);
                    if (resident?.parent !== undefined) {
                        await repository.close();
                        const persisted = existing.bootstrap.createResult;
                        return success(
                            meetingId,
                            persisted.meetingVersion,
                            persisted as CreateMeetingResultV1
                        );
                    }
                    if (resident !== undefined) {
                        await resident.repository.close();
                        meetings.delete(meetingId);
                    }
                    const replayedMeeting: StoredMeeting = {
                        teamId: input.teamId,
                        captainSessionId: caller.sessionId,
                        repository
                    };
                    meetings.set(meetingId, replayedMeeting);
                    ensureWorker(replayedMeeting);
                    const persisted = existing.bootstrap.createResult;
                    if (persisted.status === "running" && persisted.participants !== undefined) {
                        return success(
                            meetingId,
                            persisted.meetingVersion,
                            persisted as CreateMeetingResultV1
                        );
                    }
                    resumeReadyCreate = true;
                }
                if (!resumeReadyCreate) await createMeetingRuntime(input, dependencies);
                if (input.selectionMode === "manager") {
                    const started = await repository.execute({
                        requestId: `${input.requestId}:start-manager-planning`,
                        commandKind: "start_manager_planning",
                        authorization: dependencies.authorization,
                        requestHash: `${requestHash(input)}:start-manager-planning`,
                        expectedMeetingVersion: 0,
                        transition: (snapshot) => {
                            const transition = startManagerPlanning(
                                snapshot.state as unknown as MeetingState,
                                {
                                    meetingId,
                                    planningAttemptId: `${meetingId}-planning-1`,
                                    deliveryId: `${meetingId}-planning-delivery-1`,
                                    reason: "initial_plan",
                                    now: options.now?.() ?? Date.now()
                                }
                            );
                            return {
                                state: transition.state as unknown as JsonObject,
                                result: { status: "planning" },
                                events: transition.effect.events as unknown as DomainEventInput[],
                                outbox: [
                                    {
                                        deliveryId: `${meetingId}-planning-delivery-1`,
                                        kind: "dispatch",
                                        payload: {
                                            role: "manager",
                                            planningAttemptId: `${meetingId}-planning-1`
                                        }
                                    }
                                ]
                            };
                        }
                    });
                    const result = runningCreateResult(input, meetingId, started.meetingVersion);
                    await repository.updateCreateResult({
                        expectedMeetingVersion: started.meetingVersion,
                        result,
                        now: options.now?.()
                    });
                    meetings.set(meetingId, {
                        teamId: input.teamId,
                        captainSessionId: caller.sessionId,
                        repository,
                        parent: caller.agent
                    });
                    ensureWorker(meetings.get(meetingId)!);
                    workers.get(meetingId)?.wake();
                    return success(meetingId, started.meetingVersion, result);
                }
                const meetingVersion = await initializeFirstTurn(
                    repository,
                    options.now?.() ?? Date.now()
                );
                const result = runningCreateResult(input, meetingId, meetingVersion);
                await repository.updateCreateResult({
                    expectedMeetingVersion: meetingVersion,
                    result,
                    now: options.now?.()
                });
                meetings.set(meetingId, {
                    teamId: input.teamId,
                    captainSessionId: caller.sessionId,
                    repository,
                    parent: caller.agent
                });
                ensureWorker(meetings.get(meetingId)!);
                workers.get(meetingId)?.wake();
                return success(meetingId, meetingVersion, result);
            } catch (error) {
                await repository.close();
                if (error && typeof error === "object" && "code" in error) {
                    const code = (error as { code?: unknown }).code;
                    if (code === "UNSUPPORTED_CAPABILITY")
                        return failure("UNSUPPORTED_CAPABILITY", String(error));
                }
                return failure("INTERNAL_ERROR", "The meeting could not be created.", true);
            }
        },

        async getStatus(input: MeetingStatusInputV1, caller) {
            await rehydrate();
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            if (!isAuthorizedForMeeting(caller, stored, input.meetingId)) {
                return failure("UNAUTHORIZED_CALLER", "The caller is not bound to this meeting.");
            }
            try {
                const snapshot = await stored.repository.read();
                const state = JSON.parse(JSON.stringify(snapshot.state));
                return success(
                    snapshot.meetingId,
                    snapshot.version,
                    projectMeetingStatus(state, caller) as MeetingStatusResultV1
                );
            } catch {
                return failure("MEETING_NOT_FOUND", "Meeting not found.");
            }
        },

        async createMeetingTask(input: MeetingTaskRequestV1, caller) {
            await rehydrate();
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
            await rehydrate();
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            const authorized = await readAuthorizedTask(stored, caller, input.meetingTaskId);
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
            await rehydrate();
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            const authorized = await readAuthorizedTask(stored, caller, input.meetingTaskId);
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
            await rehydrate();
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            const authorized = await readAuthorizedTask(
                stored,
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
            await rehydrate();
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
                    transition: (snapshot) => {
                        const transition = createHandRaise(
                            snapshot.state as unknown as MeetingState,
                            {
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
                            }
                        );
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: {
                                handRaiseId,
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
            await rehydrate();
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
                if (committed.result) workers.get(input.meetingId)?.wake();
                return success<TurnSubmissionResultV1>(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as TurnSubmissionResultV1
                );
            } catch (error) {
                return commandError(error, "STALE_ATTEMPT", "The speaker attempt is stale.", {
                    meetingId: input.meetingId,
                    turnId: input.turnId,
                    stepId: input.stepId,
                    attemptId: input.attemptId,
                    deliveryId: input.deliveryId,
                    participantId: caller.participantId
                });
            }
        },
        async submitManagerPlan(input: ManagerPlanSubmissionV1, caller, _commandSignal) {
            await rehydrate();
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
            await rehydrate();
            const stored = meetings.get(input.meetingId);
            if (
                stored === undefined ||
                caller.kind !== "captain" ||
                caller.sessionId !== stored.captainSessionId
            )
                return failure("UNAUTHORIZED_CALLER", "Only the meeting Captain can pause it.");
            return transitionMeetingStatus(input, caller, "paused");
        },
        async resume(input, caller) {
            await rehydrate();
            const stored = meetings.get(input.meetingId);
            if (
                stored === undefined ||
                caller.kind !== "captain" ||
                caller.sessionId !== stored.captainSessionId
            )
                return failure("UNAUTHORIZED_CALLER", "Only the meeting Captain can resume it.");
            return transitionMeetingStatus(input, caller, "running");
        },
        async endMeeting(input: EndMeetingInputV1, caller) {
            await rehydrate();
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
                await recoverArchive({
                    repository: stored.repository,
                    parent: stored.parent,
                    runtime: archiveCleanupRuntime(options.continuable),
                    signal,
                    now: options.now?.() ?? Date.now()
                });
                workers.get(input.meetingId)?.wake();
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

        async findBySessionId(sessionId, lookupSignal) {
            if (lookupSignal.aborted) throw lookupSignal.reason;
            await rehydrate();
            for (const [meetingId, stored] of meetings) {
                const recovered = await stored.repository.recover();
                const ownership = recovered.sessionOwnership.find(
                    (candidate) => candidate.sessionId === sessionId
                );
                if (ownership !== undefined) {
                    return { teamId: stored.teamId, meetingId, ownership };
                }
            }
            return undefined;
        },
        async dispose() {
            runtimeController.abort(new Error("Meeting runtime disposed"));
            for (const worker of workers.values()) worker.stop();
            await Promise.all([...workers.values()].map((worker) => worker.wait()));
            workers.clear();
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
        caller: MeetingToolCaller,
        target: "paused" | "running"
    ) {
        const stored = meetings.get(input.meetingId);
        if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
        if (target === "running" && stored.parent === undefined) {
            return failure(
                "INTERNAL_ERROR",
                "The live Captain parent is unavailable for resume dispatch.",
                true
            );
        }
        try {
            const committed = await stored.repository.execute({
                requestId: input.requestId,
                commandKind: target === "paused" ? "pause_meeting" : "resume_meeting",
                authorization: {
                    callerBinding: `session:${caller.sessionId}`,
                    capabilityId: `captain:${caller.sessionId}`
                },
                requestHash: JSON.stringify(input),
                expectedMeetingVersion: input.expectedMeetingVersion,
                transition: (snapshot) => {
                    const transition = transitionMeeting(
                        snapshot.state as unknown as MeetingState,
                        target,
                        {
                            now: options.now?.() ?? Date.now(),
                            reason: input.reason ?? `captain ${target} meeting`,
                            ...(target === "paused"
                                ? {
                                      pause: {
                                          at: options.now?.() ?? Date.now(),
                                          by: {
                                              kind: "captain" as const,
                                              actorId: caller.sessionId
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
                        const running = assignAttempt(
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
                workers.get(input.meetingId)?.wake();
            }
            return success<MeetingControlResultV1>(
                input.meetingId,
                committed.meetingVersion,
                committed.result as MeetingControlResultV1
            );
        } catch (error) {
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

function isAuthorizedForMeeting(
    caller: MeetingToolCaller,
    stored: StoredMeeting,
    meetingId: string
): boolean {
    if (caller.kind === "captain") return caller.sessionId === stored.captainSessionId;
    return caller.meetingId === meetingId;
}

function assignAttempt(
    state: MeetingState,
    turn: MeetingTurn,
    index: number,
    now: number
): MeetingTurn {
    const step = turn.steps[index];
    if (step === undefined) return turn;
    const attempt = {
        attemptId: turn.id === "turn-1" ? `attempt-${index}` : `${turn.id}-attempt-${index}`,
        participantId: step.speaker,
        meetingId: state.id,
        turnId: turn.id,
        stepId: step.id,
        deliveryId: turn.id === "turn-1" ? `delivery-${index}` : `${turn.id}-delivery-${index}`,
        contextFromSeq: 0,
        contextThroughSeq: state.messageSeq,
        taskSnapshots: completedTaskSnapshots(state, step.speaker, now),
        assignedAt: now,
        startedAt: now,
        status: "running" as const,
        deliveryStatus: "accepted" as const
    };
    return {
        ...turn,
        status: "running",
        steps: turn.steps.map((candidate, candidateIndex) =>
            candidateIndex === index ? { ...candidate, status: "running", attempt } : candidate
        )
    };
}

async function initializeFirstTurn(
    repository: MeetingRepositoryRuntime,
    now: number
): Promise<number> {
    const current = await repository.read();
    const currentState = current.state as unknown as MeetingState;
    const firstAgenda = currentState.agenda[0];
    if (firstAgenda === undefined) throw new Error("At least one agenda item is required.");
    const activeState: MeetingState = {
        ...currentState,
        status: "running",
        activeAgendaItemId: currentState.activeAgendaItemId ?? firstAgenda.id,
        agenda: currentState.agenda.map((agenda, index) =>
            index === 0 ? { ...agenda, status: "discussing" } : agenda
        )
    };
    const planned = planRoundRobinTurn(
        activeState,
        {
            turnId: "turn-1",
            stepId: (participantId, index) => `step-${participantId}-${index}`
        },
        now
    );
    const running = assignAttempt(activeState, planned, 0, now);
    const speaker = running.steps[0]?.speaker;
    const events: DomainEventInput[] = [
        { type: "meeting.started", payload: { meetingId: activeState.id } },
        { type: "turn.started", payload: { turnId: running.id } },
        {
            type: "speaker_attempt.started",
            payload: { attemptId: running.steps[0]?.attempt?.attemptId ?? "attempt-0" }
        }
    ];
    const committed = await repository.execute({
        requestId: "runtime-initialize-turn-1",
        commandKind: "start_turn",
        authorization: {
            callerBinding: "runtime:convivium",
            capabilityId: "runtime:turn"
        },
        requestHash: "runtime-initialize-turn-1",
        expectedMeetingVersion: current.version,
        transition: () => ({
            state: {
                ...activeState,
                currentTurn: running,
                participants: activeState.participants.map((participant) =>
                    participant.id === speaker
                        ? { ...participant, status: "speaking" as const }
                        : participant
                ),
                turnSeq: running.seq,
                version: activeState.version + 1,
                updatedAt: now
            } as unknown as JsonObject,
            result: { turnId: running.id, firstStepId: running.steps[0]?.id },
            events,
            outbox:
                speaker === undefined
                    ? []
                    : [
                          {
                              deliveryId: running.steps[0]!.attempt!.deliveryId,
                              kind: "dispatch",
                              payload: {
                                  participantId: speaker,
                                  attemptId: running.steps[0]!.attempt!.attemptId,
                                  turnId: running.id,
                                  stepId: running.steps[0]!.id
                              }
                          }
                      ]
        })
    });
    return committed.meetingVersion;
}
