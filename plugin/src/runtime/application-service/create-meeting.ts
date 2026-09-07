import { createHash } from "node:crypto";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { interruptAndDrainOwnedSessions } from "../../dsh/index.js";
import {
    needsSemanticArbitration,
    nextManagerPlanningIds,
    rankRulePlanningCandidates,
    startManagerPlanning,
    type MeetingState
} from "../../domain/index.js";
import type { CreateMeetingInputV1, CreateMeetingResultV1 } from "../../protocol/index.js";
import type { DomainRepositoryRegistry } from "../../repository/domain/domain-repository-registry.js";
import { commandFailure, commandSuccess } from "../services/command-result-service.js";
import type { MeetingRehydrationService } from "../services/meeting-recovery-service.js";
import type { MeetingDeliveryWorkerService } from "../services/types.js";
import {
    createMeetingRuntime,
    openMeetingRepository,
    prepareMeetingCreation,
    type DomainEventInput,
    type JsonObject,
    type MeetingCreationRuntimeDependencies
} from "../meeting-runtime.js";
import { initializeFirstMeetingTurn } from "./meeting-turn.js";
import type { CreateStatusRuntimeOptions, MeetingToolCaller } from "./index.js";
import type { StoredMeeting } from "./types.js";
import { captureManagerCatalogBinding } from "../services/agent-catalog.js";
import { resolveContinuationSelection } from "./continuation-selection.js";

function stableMeetingId(input: CreateMeetingInputV1): string {
    return `meeting-${createHash("sha256")
        .update(`${input.teamId}\0${input.requestId}`)
        .digest("hex")
        .slice(0, 32)}`;
}

function requestHash(input: CreateMeetingInputV1): string {
    return JSON.stringify(input);
}

function runningCreateResult(
    input: CreateMeetingInputV1,
    meetingId: string,
    meetingVersion: number,
    status: "running" | "waiting" = "running"
): CreateMeetingResultV1 {
    return {
        meetingId,
        meetingVersion,
        status,
        participants: input.participants.map(({ participantKey }) => ({
            participantKey,
            participantId: `participant-${participantKey}`
        }))
    };
}

export interface CreateMeetingApplicationOptions {
    readonly runtime: CreateStatusRuntimeOptions & {
        readonly repositoryRegistry: Promise<DomainRepositoryRegistry>;
    };
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
    readonly deliveryWorkers: MeetingDeliveryWorkerService;
    readonly ensureWorker: (stored: StoredMeeting) => void;
    readonly signal: AbortSignal;
}

export function createMeetingApplication(options: CreateMeetingApplicationOptions) {
    return async function createMeeting(
        input: CreateMeetingInputV1,
        caller: MeetingToolCaller,
        commandSignal: AbortSignal
    ) {
        if (caller.kind !== "captain" || caller.agent === undefined) {
            return commandFailure(
                "UNAUTHORIZED_CALLER",
                "Only a live Captain Agent can create a meeting."
            );
        }
        if (
            options.runtime.maxParticipants !== undefined &&
            input.participants.length > options.runtime.maxParticipants
        ) {
            return commandFailure("INVALID_ARGUMENT", "The participant limit was exceeded.");
        }
        if (input.agenda.length === 0) {
            return commandFailure("INVALID_ARGUMENT", "At least one agenda item is required.");
        }
        const continuation = await resolveContinuationSelection(
            input.continuation,
            input.teamId,
            caller,
            options.recovery,
            options.meetings
        );
        if (!continuation.ok) return continuation.error;
        await options.recovery.rehydrate();
        const meetingId = stableMeetingId(input);
        const now = options.runtime.now?.() ?? Date.now();
        const authorization = {
            callerBinding: `session:${caller.sessionId}`,
            capabilityId: `captain:${caller.sessionId}`
        };
        const prepared = prepareMeetingCreation(input, meetingId, authorization, {
            now,
            speakerAttemptTimeoutMs: options.runtime.speakerAttemptTimeoutMs,
            continuation: continuation.continuation
        });
        let repository;
        try {
            repository = await openMeetingRepository({
                registry: options.runtime.repositoryRegistry,
                teamId: input.teamId,
                meetingId,
                create: prepared.createInput
            });
        } catch (error) {
            if (
                error !== null &&
                typeof error === "object" &&
                "code" in error &&
                error.code === "IDEMPOTENCY_CONFLICT"
            )
                return commandFailure(
                    "IDEMPOTENCY_CONFLICT",
                    "The create request conflicts with the persisted meeting."
                );
            return commandFailure("INTERNAL_ERROR", "The meeting could not be opened.", true);
        }
        const dependencies: MeetingCreationRuntimeDependencies = {
            repository,
            continuable: options.runtime.continuable,
            parent: caller.agent as Agent,
            provider: options.runtime.provider,
            authorization,
            allocateSessionId: (role, key) => `${meetingId}-${role}-${key}` as never,
            signal: commandSignal ?? options.signal,
            now: options.runtime.now,
            speakerAttemptTimeoutMs: options.runtime.speakerAttemptTimeoutMs,
            continuation: continuation.continuation,
            prepared,
            cleanup: async (created) => {
                const recovered = await repository.recover();
                const owned = recovered.sessionOwnership.filter((candidate) =>
                    created.some((item) => item.sessionId === candidate.sessionId)
                );
                const lifecycle = options.runtime
                    .continuable as typeof options.runtime.continuable & {
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
                        options.runtime.now?.() ?? Date.now()
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
                    return commandFailure(
                        "IDEMPOTENCY_CONFLICT",
                        "The create request conflicts with the persisted meeting."
                    );
                }
                const persistedCaptain = existing.sessionOwnership[0]?.parentSessionId;
                if (persistedCaptain !== caller.sessionId) {
                    return commandFailure(
                        "UNAUTHORIZED_CALLER",
                        "Only the original meeting Captain can replay creation."
                    );
                }
                const resident = options.meetings.get(meetingId);
                if (resident?.parent !== undefined) {
                    const persisted = existing.bootstrap.createResult;
                    return commandSuccess(
                        meetingId,
                        persisted.meetingVersion,
                        persisted as CreateMeetingResultV1
                    );
                }
                if (resident !== undefined) {
                    options.meetings.delete(meetingId);
                }
                const replayedMeeting: StoredMeeting = {
                    teamId: input.teamId,
                    captainSessionId: caller.sessionId,
                    repository
                };
                options.meetings.set(meetingId, replayedMeeting);
                options.ensureWorker(replayedMeeting);
                const persisted = existing.bootstrap.createResult;
                if (
                    (persisted.status === "running" || persisted.status === "waiting") &&
                    persisted.participants !== undefined
                ) {
                    return commandSuccess(
                        meetingId,
                        persisted.meetingVersion,
                        persisted as CreateMeetingResultV1
                    );
                }
                resumeReadyCreate = true;
            }
            if (!resumeReadyCreate) await createMeetingRuntime(input, dependencies);
            const initial = await repository.read();
            const initialState = initial.state as unknown as MeetingState;
            const firstAgenda = initialState.agenda[0];
            const activeInitialState: MeetingState = {
                ...initialState,
                activeAgendaItemId: initialState.activeAgendaItemId ?? firstAgenda?.id,
                agenda: initialState.agenda.map((agenda, index) =>
                    index === 0 ? { ...agenda, status: "discussing" as const } : agenda
                )
            };
            const managerRequested =
                input.selectionMode === "manager" ||
                (input.selectionMode === "hybrid" &&
                    needsSemanticArbitration(
                        activeInitialState,
                        rankRulePlanningCandidates(activeInitialState),
                        "normal"
                    ));
            const managerAvailable =
                activeInitialState.manager.status !== "failed" &&
                activeInitialState.manager.status !== "closed";
            if (managerRequested && managerAvailable) {
                const catalogBinding = await captureManagerCatalogBinding(
                    options.runtime.agentCatalog,
                    {
                        teamId: input.teamId,
                        meetingId,
                        captainSessionId: caller.sessionId
                    }
                );
                const started = await repository.execute({
                    requestId: `${input.requestId}:start-manager-planning`,
                    commandKind: "start_manager_planning",
                    authorization: dependencies.authorization,
                    requestHash: `${requestHash(input)}:start-manager-planning`,
                    expectedMeetingVersion: 0,
                    transition: (snapshot) => {
                        const planningIds = nextManagerPlanningIds(
                            snapshot.state as unknown as MeetingState
                        );
                        const transition = startManagerPlanning(
                            snapshot.state as unknown as MeetingState,
                            {
                                meetingId,
                                planningAttemptId: planningIds.planningAttemptId,
                                deliveryId: planningIds.deliveryId,
                                reason:
                                    input.selectionMode === "hybrid"
                                        ? "semantic_arbitration"
                                        : "initial_plan",
                                now: options.runtime.now?.() ?? Date.now(),
                                catalogBinding
                            }
                        );
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: { status: "planning" },
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox: [
                                {
                                    deliveryId: planningIds.deliveryId,
                                    kind: "dispatch",
                                    payload: {
                                        role: "manager",
                                        planningAttemptId: planningIds.planningAttemptId
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
                    now: options.runtime.now?.()
                });
                options.meetings.set(meetingId, {
                    teamId: input.teamId,
                    captainSessionId: caller.sessionId,
                    repository,
                    parent: caller.agent
                });
                options.ensureWorker(options.meetings.get(meetingId)!);
                options.deliveryWorkers.wake(meetingId);
                return commandSuccess(meetingId, started.meetingVersion, result);
            }
            const initialized = await initializeFirstMeetingTurn(
                repository,
                options.runtime.now?.() ?? Date.now(),
                managerRequested
            );
            const result = runningCreateResult(
                input,
                meetingId,
                initialized.meetingVersion,
                initialized.status
            );
            await repository.updateCreateResult({
                expectedMeetingVersion: initialized.meetingVersion,
                result,
                now: options.runtime.now?.()
            });
            options.meetings.set(meetingId, {
                teamId: input.teamId,
                captainSessionId: caller.sessionId,
                repository,
                parent: caller.agent
            });
            options.ensureWorker(options.meetings.get(meetingId)!);
            options.deliveryWorkers.wake(meetingId);
            return commandSuccess(meetingId, initialized.meetingVersion, result);
        } catch (error) {
            if (error && typeof error === "object" && "code" in error) {
                const code = (error as { code?: unknown }).code;
                if (code === "UNSUPPORTED_CAPABILITY") {
                    return commandFailure("UNSUPPORTED_CAPABILITY", String(error));
                }
                if (code === "INVALID_CREATE_INPUT") {
                    return commandFailure("INVALID_ARGUMENT", String(error));
                }
            }
            return commandFailure("INTERNAL_ERROR", "The meeting could not be created.", true);
        }
    };
}
