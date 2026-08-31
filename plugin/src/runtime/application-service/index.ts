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
import { RepositoryError, type MeetingSnapshot } from "../../repository/index.js";
import {
    createMeetingRuntime,
    openMeetingRepository,
    type DomainEventInput,
    type JsonObject,
    type MeetingCreationRuntimeDependencies,
    type MeetingRepositoryRuntime,
    type RepositoryAuthorizationValidator
} from "../meeting-runtime.js";
import { createMeetingDeliveryWorkerService } from "../services/meeting-dispatch-service.js";
import {
    commandFailure as failure,
    commandSuccess as success,
    mapCommandError as commandError
} from "../services/meeting-command-service.js";
import { resolveArchiveCleanupRuntime } from "../services/meeting-session-service.js";
import { recoverArchive } from "../services/meeting-archive-service.js";
import { assignTurnAttempt, initializeFirstMeetingTurn } from "./meeting-turn.js";
import {
    meetingTaskEvidenceResolver,
    type AuthorizedTaskEvidenceResolver
} from "../task-evidence.js";
import { projectManagerMeetingContext, projectMeetingStatus } from "../../projection/index.js";
import { LocalMeetingListResponseSchema, MeetingStatusResultSchema } from "../../protocol/index.js";
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
import { interruptAndDrainOwnedSessions } from "../../dsh/index.js";

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

interface ClaimedOutboxItem {
    id: string;
    deliveryId: string;
    payload: JsonObject;
    leaseOwner: string;
    leaseToken: string;
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

export class LocalMeetingRecoveryUnavailableError extends Error {
    readonly name = "LocalMeetingRecoveryUnavailableError";
}

export type MeetingRuntimeWithCallerLookup = MeetingToolRuntime &
    MeetingOwnershipLookup &
    LocalMeetingWebRuntime & { dispose(): Promise<void> };

interface StoredMeeting {
    readonly teamId: string;
    readonly captainSessionId: string;
    readonly repository: MeetingRepositoryRuntime;
    parent?: Agent;
}

type MeetingControlSource =
    { readonly kind: "captain"; readonly sessionId: string } | { readonly kind: "local_host" };

type RehydrateMode =
    | { readonly kind: "agent_best_effort" }
    | { readonly kind: "local_list" }
    | { readonly kind: "local_meeting"; readonly meetingId: string };

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

export function createCreateStatusRuntime(
    options: CreateStatusRuntimeOptions
): MeetingRuntimeWithCallerLookup {
    const meetings = new Map<string, StoredMeeting>();
    const deliveryWorkers = createMeetingDeliveryWorkerService({
        pollMs: options.outboxPollMs ?? 1_000,
        now: options.now
    });
    const runtimeController = new AbortController();
    const taskEvidenceResolver = options.taskEvidenceResolver ?? meetingTaskEvidenceResolver;
    const signal =
        options.signal === undefined
            ? runtimeController.signal
            : AbortSignal.any([options.signal, runtimeController.signal]);

    async function rehydrate(
        mode: RehydrateMode = { kind: "agent_best_effort" }
    ): Promise<Map<string, MeetingSnapshot> | undefined> {
        if (mode.kind !== "agent_best_effort") {
            const snapshots = new Map<string, MeetingSnapshot>();
            const unavailable = (error: unknown): LocalMeetingRecoveryUnavailableError =>
                error instanceof LocalMeetingRecoveryUnavailableError
                    ? error
                    : new LocalMeetingRecoveryUnavailableError(
                          "Local meeting recovery is unavailable.",
                          { cause: error }
                      );
            const isMissing = (error: unknown): boolean =>
                error !== null &&
                typeof error === "object" &&
                "code" in error &&
                (error as { code?: unknown }).code === "ENOENT";
            const recoverLocal = async (
                meetingId: string,
                teamId: string,
                databasePath: string,
                existing?: StoredMeeting
            ): Promise<void> => {
                let repository = existing?.repository;
                let opened = false;
                try {
                    if (repository === undefined) {
                        repository = await openMeetingRepository({
                            databasePath,
                            teamId,
                            meetingId,
                            authorizationValidator: options.authorizationValidator
                        });
                        opened = true;
                    } else if (existing?.teamId !== teamId) {
                        throw new Error(
                            "Recovered Meeting team ownership does not match discovery."
                        );
                    }
                    const recovered = await repository.recover();
                    if (
                        recovered.bootstrap.status === "creating" ||
                        recovered.bootstrap.status === "creation_failed"
                    ) {
                        if (existing !== undefined) meetings.delete(meetingId);
                        await repository.close();
                        return;
                    }
                    const parentSessionId = recovered.sessionOwnership[0]?.parentSessionId;
                    if (recovered.snapshot === undefined || parentSessionId === undefined) {
                        throw new Error("Ready Meeting recovery is incomplete.");
                    }
                    const recoveredState = recovered.snapshot.state as unknown as MeetingState;
                    if (
                        recoveredState.status === "archiving" ||
                        recoveredState.status === "archived"
                    ) {
                        await recoverArchive({
                            repository,
                            signal,
                            now: options.now?.() ?? Date.now()
                        });
                    }
                    const current = await repository.read();
                    if (opened) {
                        meetings.set(meetingId, {
                            teamId,
                            captainSessionId: parentSessionId,
                            repository
                        });
                    }
                    snapshots.set(meetingId, current);
                } catch (error) {
                    if (opened && repository !== undefined) {
                        await repository.close().catch(() => undefined);
                    }
                    throw unavailable(error);
                }
            };

            if (mode.kind === "local_meeting") {
                const existing = meetings.get(mode.meetingId);
                if (existing !== undefined) {
                    await recoverLocal(
                        mode.meetingId,
                        existing.teamId,
                        repositoryPath(options.dataRoot, existing.teamId, mode.meetingId),
                        existing
                    );
                    return snapshots;
                }
            }

            let teams;
            try {
                teams = await readdir(options.dataRoot, { withFileTypes: true });
            } catch (error) {
                if (isMissing(error)) return snapshots;
                throw unavailable(error);
            }
            for (const team of teams) {
                if (!team.isDirectory()) continue;
                let teamId: string;
                try {
                    teamId = decodeURIComponent(team.name);
                } catch (error) {
                    throw unavailable(error);
                }
                let files: string[];
                try {
                    files = await readdir(join(options.dataRoot, team.name));
                } catch (error) {
                    throw unavailable(error);
                }
                for (const file of files) {
                    if (!file.endsWith(".sqlite")) continue;
                    let meetingId: string;
                    try {
                        meetingId = decodeURIComponent(file.slice(0, -7));
                    } catch (error) {
                        if (mode.kind === "local_list") throw unavailable(error);
                        continue;
                    }
                    if (mode.kind === "local_meeting" && meetingId !== mode.meetingId) continue;
                    await recoverLocal(
                        meetingId,
                        teamId,
                        join(options.dataRoot, team.name, file),
                        meetings.get(meetingId)
                    );
                    if (mode.kind === "local_meeting") return snapshots;
                }
            }
            return snapshots;
        }

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
        deliveryWorkers.ensure({
            meetingId,
            repository: stored.repository,
            parent: stored.parent,
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
            }
        });
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
                speakerAttemptTimeoutMs: options.speakerAttemptTimeoutMs,
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
                    deliveryWorkers.wake(meetingId);
                    return success(meetingId, started.meetingVersion, result);
                }
                const meetingVersion = await initializeFirstMeetingTurn(
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
                deliveryWorkers.wake(meetingId);
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
                await recoverArchiveForCaptain(stored, caller).catch(() => undefined);
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

        async listLocalMeetings() {
            const snapshots = (await rehydrate({ kind: "local_list" })) ?? new Map();
            try {
                return LocalMeetingListResponseSchema({
                    protocolVersion: 1,
                    ok: true,
                    result: {
                        meetings: [...snapshots.values()]
                            .map((snapshot) => {
                                const state = snapshot.state as unknown as MeetingState;
                                return {
                                    meetingId: snapshot.meetingId,
                                    teamId: snapshot.teamId,
                                    topic: state.topic,
                                    status: state.status,
                                    meetingVersion: snapshot.version,
                                    updatedAt: snapshot.updatedAt
                                };
                            })
                            .sort(
                                (left, right) =>
                                    right.updatedAt - left.updatedAt ||
                                    left.meetingId.localeCompare(right.meetingId)
                            )
                    }
                });
            } catch (error) {
                throw new LocalMeetingRecoveryUnavailableError(
                    "Local meeting list projection is unavailable.",
                    { cause: error }
                );
            }
        },

        async getLocalMeetingStatus(input) {
            const snapshots = await rehydrate({
                kind: "local_meeting",
                meetingId: input.meetingId
            });
            const snapshot = snapshots?.get(input.meetingId);
            if (snapshot === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            try {
                const state = JSON.parse(JSON.stringify(snapshot.state)) as MeetingState;
                const projection = projectMeetingStatus(state, {
                    kind: "local_host",
                    sessionId: "loopback-web"
                });
                const projected = MeetingStatusResultSchema(
                    projection as unknown as Record<string, unknown>
                ) as unknown as MeetingStatusResultV1;
                return success(snapshot.meetingId, snapshot.version, projected);
            } catch (error) {
                throw new LocalMeetingRecoveryUnavailableError(
                    "Local meeting status projection is unavailable.",
                    { cause: error }
                );
            }
        },

        async pauseLocalMeeting(input) {
            const snapshots = await rehydrate({
                kind: "local_meeting",
                meetingId: input.meetingId
            });
            if (!snapshots?.has(input.meetingId))
                return failure("MEETING_NOT_FOUND", "Meeting not found.");
            return transitionMeetingStatus(input, "paused", { kind: "local_host" });
        },

        async resumeLocalMeeting(input) {
            const snapshots = await rehydrate({
                kind: "local_meeting",
                meetingId: input.meetingId
            });
            if (!snapshots?.has(input.meetingId))
                return failure("MEETING_NOT_FOUND", "Meeting not found.");
            return transitionMeetingStatus(input, "running", { kind: "local_host" });
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
            return transitionMeetingStatus(input, "paused", {
                kind: "captain",
                sessionId: caller.sessionId
            });
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
            return transitionMeetingStatus(input, "running", {
                kind: "captain",
                sessionId: caller.sessionId
            });
        },
        async reassignTurn(input, caller) {
            await rehydrate();
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

function isAuthorizedForMeeting(
    caller: MeetingToolCaller,
    stored: StoredMeeting,
    meetingId: string
): boolean {
    if (caller.kind === "captain") return caller.sessionId === stored.captainSessionId;
    return caller.meetingId === meetingId;
}
