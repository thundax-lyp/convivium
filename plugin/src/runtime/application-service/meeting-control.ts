import {
    DomainError,
    planRoundRobinTurn,
    reassignTurn as reassignTurnTransition,
    transitionMeeting,
    type MeetingState
} from "../../domain/index.js";
import type { MeetingControlResultV1, ReassignTurnResultV1 } from "../../protocol/index.js";
import {
    RepositoryError,
    type CommandAuthorization,
    type MeetingRepository,
    type SessionOwnership
} from "../../repository/index.js";
import type { DomainEventInput, JsonObject } from "../meeting-runtime.js";
import {
    commandFailure as failure,
    commandSuccess as success,
    mapCommandError as commandError
} from "../services/command-result-service.js";
import {
    LocalMeetingRecoveryUnavailableError,
    type MeetingRehydrationService
} from "../services/meeting-recovery-service.js";
import type { MeetingDeliveryWorkerService } from "../services/types.js";
import type {
    CreateStatusRuntimeOptions,
    LocalMeetingWebRuntime,
    MeetingToolRuntime
} from "./index.js";
import { assignTurnAttempt } from "./meeting-turn.js";
import type { MeetingControlSource, StoredMeeting } from "./types.js";

export interface MeetingControlApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
    readonly deliveryWorkers: MeetingDeliveryWorkerService;
    readonly ensureWorker: (stored: StoredMeeting) => void;
}

export function createMeetingControlApplication(dependencies: MeetingControlApplicationOptions) {
    const { options, meetings, recovery, deliveryWorkers, ensureWorker } = dependencies;
    const application: Pick<
        MeetingToolRuntime & LocalMeetingWebRuntime,
        "pauseLocalMeeting" | "resumeLocalMeeting" | "pause" | "resume" | "reassignTurn"
    > = {
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
        }
    };
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
    return application;
}

export interface PauseRecoveryDependencies {
    readonly repository: Pick<MeetingRepository, "execute" | "recordSessionOwnership">;
    readonly authorization: CommandAuthorization;
    readonly requestId: string;
    readonly expectedMeetingVersion: number;
    readonly reason: string;
    readonly parent?: Agent;
    readonly lifecycle?: ContinuableLifecycleRuntime;
    readonly ownerships: readonly SessionOwnership[];
    readonly signal: AbortSignal;
    readonly now?: () => number;
}

export interface ResumeRecoveryDependencies {
    readonly repository: Pick<MeetingRepository, "execute">;
    readonly authorization: CommandAuthorization;
    readonly requestId: string;
    readonly expectedMeetingVersion: number;
    readonly signal: AbortSignal;
    readonly now?: () => number;
}

function ownershipForRevocation(ownership: SessionOwnership): SessionOwnership {
    return { ...ownership, capabilityStatus: "revoked" };
}

export async function pauseMeetingRuntime(
    dependencies: PauseRecoveryDependencies
): Promise<unknown> {
    const now = dependencies.now?.() ?? Date.now();
    const committed = await dependencies.repository.execute({
        requestId: dependencies.requestId,
        commandKind: "pause_meeting",
        authorization: dependencies.authorization,
        requestHash: JSON.stringify({
            requestId: dependencies.requestId,
            expectedMeetingVersion: dependencies.expectedMeetingVersion,
            reason: dependencies.reason
        }),
        expectedMeetingVersion: dependencies.expectedMeetingVersion,
        transition: (snapshot) => {
            const transition = transitionMeeting(
                snapshot.state as unknown as MeetingState,
                "paused",
                {
                    now,
                    reason: dependencies.reason,
                    pause: {
                        at: now,
                        by: { kind: "captain", actorId: dependencies.authorization.callerBinding }
                    }
                }
            );
            return {
                state: transition.state as unknown as JsonObject,
                result: { status: "paused", changed: true },
                events: transition.effect.events as never,
                outbox: []
            };
        }
    });
    const active = dependencies.ownerships.filter(
        (ownership) =>
            ownership.lifecycleStatus === "active" && ownership.capabilityStatus === "active"
    );
    for (const ownership of active) {
        await dependencies.repository.recordSessionOwnership(
            ownershipForRevocation(ownership),
            now
        );
    }
    if (
        dependencies.parent !== undefined &&
        dependencies.lifecycle !== undefined &&
        active.length > 0
    ) {
        await interruptAndDrainOwnedSessions({
            runtime: dependencies.lifecycle,
            parent: dependencies.parent,
            ownerships: active
        });
        for (const ownership of active) {
            await dependencies.repository.recordSessionOwnership(
                { ...ownershipForRevocation(ownership), lifecycleStatus: "closed" },
                now
            );
        }
    }
    return { committed, revokedOwnerships: active.length };
}

export async function resumeMeetingRuntime(
    dependencies: ResumeRecoveryDependencies
): Promise<unknown> {
    const now = dependencies.now?.() ?? Date.now();
    return dependencies.repository.execute({
        requestId: dependencies.requestId,
        commandKind: "resume_meeting",
        authorization: dependencies.authorization,
        requestHash: JSON.stringify({ requestId: dependencies.requestId }),
        expectedMeetingVersion: dependencies.expectedMeetingVersion,
        transition: (snapshot) => {
            const transition = transitionMeeting(
                snapshot.state as unknown as MeetingState,
                "running",
                { now, reason: "captain resumed meeting" }
            );
            return {
                state: transition.state as unknown as JsonObject,
                result: { status: "running", changed: true },
                events: transition.effect.events as never,
                outbox: []
            };
        }
    });
}
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    interruptAndDrainOwnedSessions,
    type ContinuableLifecycleRuntime
} from "../../dsh/index.js";
