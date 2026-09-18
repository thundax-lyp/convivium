import { RoleCompositionError } from "@/role-composition/resolve.js";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { interruptAndDrainOwnedSessions } from "@/dsh/index.js";
import { isMeetingStateV2, type LegacyMeetingState } from "@/domain/index.js";
import type { CreateMeetingInputV1, CreateMeetingResultV1 } from "@/protocol/index.js";
import type { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { commandFailure, commandSuccess } from "@/runtime/services/command-result-service.js";
import type { MeetingRehydrationService } from "@/runtime/services/meeting-recovery-service.js";
import type { MeetingDeliveryWorkerService } from "@/runtime/services/types.js";
import {
    createMeetingRuntime,
    assertContributionCreationInput,
    openMeetingRepository,
    prepareMeetingCreation,
    type DomainEventInput,
    type JsonObject,
    type MeetingCreationRuntimeDependencies
} from "@/runtime/meeting-runtime.js";
import type { CreateStatusRuntimeOptions, MeetingToolCaller } from "./index.js";
import type { StoredMeeting } from "./types.js";
import { resolveContinuationSelection } from "./continuation-selection.js";
import { contributionOutbox } from "@/runtime/services/contribution-runtime-service.js";
import { meetingIdFor } from "@/repository/domain/keys.js";

function stableMeetingId(input: CreateMeetingInputV1): string {
    return meetingIdFor(input.requestId);
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
    readonly holdCreation?: (meetingId: string) => () => void;
    readonly markContributionRecovered: (meetingId: string) => void;
}

async function initializeContributionMeeting(
    repository: MeetingCreationRuntimeDependencies["repository"] & {
        read(): Promise<{ state: JsonObject }>;
        execute<T>(input: unknown): Promise<{ meetingVersion: number; result: T }>;
    },
    input: CreateMeetingInputV1,
    authorization: MeetingCreationRuntimeDependencies["authorization"],
    now: number
): Promise<{ meetingVersion: number; status: "running" }> {
    const committed = await repository.execute<{ status: "running" }>({
        requestId: `${input.requestId}:start-contributions`,
        commandKind: "start_contribution_meeting",
        authorization,
        requestHash: `${requestHash(input)}:start-contributions`,
        expectedMeetingVersion: 0,
        transition: (snapshot: { state: JsonObject }) => {
            if (!isMeetingStateV2(snapshot.state) || snapshot.state.contributions === undefined) {
                throw new TypeError("Contribution meeting state is unavailable.");
            }
            const state = snapshot.state as unknown as LegacyMeetingState;
            const contributions = state.contributions!;
            const firstAgenda = state.agenda[0]!;
            const managerNoticeSeq = 1;
            const events = [
                { type: "meeting.started" as const, payload: { meetingId: state.id } },
                {
                    type: "contribution.manager_notified" as const,
                    payload: {
                        noticeSeq: managerNoticeSeq,
                        contextThroughSeq: state.messageSeq,
                        actor: "runtime",
                        at: now
                    }
                }
            ];
            const next: LegacyMeetingState = {
                ...state,
                status: "running",
                activeAgendaItemId: firstAgenda.id,
                agenda: state.agenda.map((agenda, index) =>
                    index === 0 ? { ...agenda, status: "discussing" } : agenda
                ),
                manager: { ...state.manager, status: "idle" },
                contributions: {
                    ...contributions,
                    managerNoticeSeq,
                    managerDeadlineAt: now + 600_000
                },
                updatedAt: now,
                eventSeq: state.eventSeq + events.length
            };
            return {
                state: JSON.parse(JSON.stringify(next)) as JsonObject,
                result: { status: "running" as const },
                events: events as unknown as DomainEventInput[],
                outbox: contributionOutbox(state, next, events)
            };
        }
    });
    return { meetingVersion: committed.meetingVersion, status: "running" };
}

function validateCreateMeetingRequest(
    input: CreateMeetingInputV1,
    caller: MeetingToolCaller,
    maxParticipants: number | undefined
): ReturnType<typeof commandFailure> | undefined {
    if (caller.kind !== "captain" || caller.agent === undefined) {
        return commandFailure(
            "UNAUTHORIZED_CALLER",
            "Only a live Captain Agent can create a meeting."
        );
    }
    try {
        assertContributionCreationInput(input);
    } catch (error) {
        return commandFailure(
            "INVALID_ARGUMENT",
            error instanceof Error ? error.message : "The contribution meeting input is invalid."
        );
    }
    if (maxParticipants !== undefined && input.participants.length > maxParticipants) {
        return commandFailure("INVALID_ARGUMENT", "The participant limit was exceeded.");
    }
    if (input.agenda.length === 0) {
        return commandFailure("INVALID_ARGUMENT", "At least one agenda item is required.");
    }
}

function meetingRepositoryOpenFailure(error: unknown): ReturnType<typeof commandFailure> {
    if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "IDEMPOTENCY_CONFLICT"
    ) {
        return commandFailure(
            "IDEMPOTENCY_CONFLICT",
            "The create request conflicts with the persisted meeting."
        );
    }
    return commandFailure("INTERNAL_ERROR", "The meeting could not be opened.", true);
}

export function createMeetingApplication(options: CreateMeetingApplicationOptions) {
    return async function createMeeting(
        input: CreateMeetingInputV1,
        caller: MeetingToolCaller,
        commandSignal: AbortSignal
    ) {
        const invalid = validateCreateMeetingRequest(
            input,
            caller,
            options.runtime.maxParticipants
        );
        if (invalid !== undefined) return invalid;
        const meetingId = stableMeetingId(input);
        const releaseCreation = options.holdCreation?.(meetingId);
        try {
            const continuation = await resolveContinuationSelection(
                input.continuation,
                input.teamId,
                caller,
                options.recovery,
                options.meetings
            );
            if (!continuation.ok) return continuation.error;
            await options.recovery.rehydrate();
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
                    meetingId,
                    create: prepared.createInput
                });
            } catch (error) {
                return meetingRepositoryOpenFailure(error);
            }
            const dependencies: MeetingCreationRuntimeDependencies = {
                agentDefinitions: options.runtime.agentDefinitions,
                agentModelOverrides: options.runtime.agentModelOverrides,
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
                const initialized = await initializeContributionMeeting(
                    repository,
                    input,
                    dependencies.authorization,
                    options.runtime.now?.() ?? Date.now()
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
                options.markContributionRecovered(meetingId);
                options.ensureWorker(options.meetings.get(meetingId)!);
                options.deliveryWorkers.wake(meetingId);
                return commandSuccess(meetingId, initialized.meetingVersion, result);
            } catch (error) {
                if (error instanceof RoleCompositionError)
                    return commandFailure(error.code, error.message, false);
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
        } catch (error) {
            if (
                error !== null &&
                typeof error === "object" &&
                "code" in error &&
                error.code === "INVALID_CREATE_INPUT"
            ) {
                return commandFailure("INVALID_ARGUMENT", String(error));
            }
            return commandFailure("INTERNAL_ERROR", "The meeting could not be created.", true);
        } finally {
            releaseCreation?.();
        }
    };
}
