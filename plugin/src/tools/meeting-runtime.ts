import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    followupManagerSession,
    followupParticipantSession,
    type ContinuableFollowupRuntime,
    type ContinuableStarter
} from "../dsh/index.js";
import {
    planRoundRobinTurn,
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
    type DomainEventInput,
    type JsonObject,
    type MeetingCreationRuntimeDependencies,
    type MeetingRepositoryRuntime,
    type RepositoryAuthorizationValidator
} from "../runtime/index.js";
import { projectMeetingStatus } from "../projection/index.js";
import type {
    CreateMeetingInputV1,
    CreateMeetingResultV1,
    MeetingStatusInputV1,
    MeetingStatusResultV1,
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
    readonly continuable: ContinuableStarter & ContinuableFollowupRuntime;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly maxParticipants?: number;
    readonly signal?: AbortSignal;
    readonly now?: () => number;
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

function commandError(
    error: unknown,
    fallback: ProtocolErrorV1["code"],
    message: string,
    context?: Partial<ProtocolErrorV1>
) {
    const code =
        error && typeof error === "object" && "code" in error
            ? (error as { code?: unknown }).code
            : undefined;
    return {
        ...failure(
            typeof code === "string" ? code : fallback,
            message,
            code === "VERSION_CONFLICT"
        ),
        ...context,
        ...(error && typeof error === "object" && "meetingId" in error
            ? { meetingId: String((error as { meetingId: unknown }).meetingId) }
            : {})
    };
}

function hasUnsupportedClaims(input: { changes: object; completionClaims?: object }): boolean {
    return (
        Object.values(input.changes as Record<string, unknown>).some(
            (value) => Array.isArray(value) && value.length > 0
        ) ||
        (input.completionClaims !== undefined && Object.keys(input.completionClaims).length > 0)
    );
}

export function createCreateStatusRuntime(
    options: CreateStatusRuntimeOptions
): MeetingRuntimeWithCallerLookup {
    const meetings = new Map<string, StoredMeeting>();
    const workers = new Map<string, ReturnType<typeof createOutboxWorker>>();
    const signal = options.signal ?? new AbortController().signal;

    async function rehydrate() {
        const teams = await readdir(options.dataRoot, { withFileTypes: true }).catch(() => []);
        for (const team of teams) {
            if (!team.isDirectory()) continue;
            const files = await readdir(join(options.dataRoot, team.name)).catch(() => []);
            for (const file of files) {
                if (!file.endsWith(".sqlite")) continue;
                const meetingId = decodeURIComponent(file.slice(0, -7));
                if (meetings.has(meetingId)) continue;
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
                    meetings.set(meetingId, {
                        teamId: decodeURIComponent(team.name),
                        captainSessionId: parentSessionId,
                        repository
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
        claimedItem?: ClaimedOutboxItem,
        completeClaimed = true
    ) {
        const recovered = await repository.recover();
        const item =
            claimedItem ??
            (
                await repository.claimOutbox({
                    owner: `runtime:${meetingId}`,
                    ttlMs: 60_000,
                    batchSize: 1,
                    now: options.now?.() ?? Date.now()
                })
            )[0];
        if (item === undefined) return;
        const payload = item.payload as unknown as {
            participantId: string;
            attemptId: string;
            turnId: string;
        };
        const ownership = recovered.sessionOwnership.find(
            (candidate) => candidate.participantId === payload.participantId
        );
        if (ownership === undefined)
            throw new Error("Initial speaker Session ownership is missing.");
        try {
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
                        throw new Error("Speaker attempt is no longer authorized.");
                    }
                    const owned = latest.sessionOwnership.find(
                        (candidate) => candidate.sessionId === ownership.sessionId
                    );
                    if (
                        owned?.lifecycleStatus !== "active" ||
                        owned.capabilityStatus !== "active"
                    ) {
                        throw new Error("Speaker Session capability is no longer active.");
                    }
                }
            });
            if (completeClaimed)
                await repository.completeOutbox({
                    id: item.id,
                    leaseOwner: item.leaseOwner,
                    leaseToken: item.leaseToken,
                    completion: { status: "delivered" }
                });
        } catch (error) {
            if (completeClaimed)
                await repository.completeOutbox({
                    id: item.id,
                    leaseOwner: item.leaseOwner,
                    leaseToken: item.leaseToken,
                    completion: {
                        status: "retry",
                        availableAt: Date.now(),
                        errorCode: "DISPATCH_FAILED"
                    }
                });
            throw error;
        }
    }

    async function dispatchManagerPlanningDelivery(
        repository: MeetingRepositoryRuntime,
        parent: Agent,
        meetingId: string,
        commandSignal: AbortSignal,
        claimedItem?: ClaimedOutboxItem,
        completeClaimed = true
    ) {
        const recovered = await repository.recover();
        const item =
            claimedItem ??
            (
                await repository.claimOutbox({
                    owner: `runtime:${meetingId}`,
                    ttlMs: 60_000,
                    batchSize: 1,
                    now: options.now?.() ?? Date.now()
                })
            )[0];
        if (item === undefined) return;
        const payload = item.payload as unknown as {
            role: "manager";
            planningAttemptId: string;
        };
        const ownership = recovered.sessionOwnership.find(
            (candidate) => candidate.role === "manager"
        );
        if (ownership === undefined) throw new Error("Manager Session ownership is missing.");
        try {
            await followupManagerSession({
                runtime: options.continuable,
                parent,
                ownership,
                attempt: {
                    planningAttemptId: payload.planningAttemptId,
                    deliveryId: item.deliveryId
                },
                prompt: [
                    { type: "text", text: `Meeting ${meetingId}: submit one ordered turn plan.` }
                ],
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
                        throw new Error("Manager planning attempt is no longer authorized.");
                }
            });
            if (completeClaimed)
                await repository.completeOutbox({
                    id: item.id,
                    leaseOwner: item.leaseOwner,
                    leaseToken: item.leaseToken,
                    completion: { status: "delivered" }
                });
        } catch (error) {
            if (completeClaimed)
                await repository.completeOutbox({
                    id: item.id,
                    leaseOwner: item.leaseOwner,
                    leaseToken: item.leaseToken,
                    completion: {
                        status: "retry",
                        availableAt: Date.now(),
                        errorCode: "DISPATCH_FAILED"
                    }
                });
            throw error;
        }
    }

    function ensureWorker(stored: StoredMeeting): void {
        const meetingId = stored.repository.meetingId;
        if (stored.parent === undefined || workers.has(meetingId)) return;
        const worker = createOutboxWorker({
            repository: stored.repository,
            owner: `worker:${meetingId}`,
            ttlMs: 60_000,
            batchSize: 1,
            pollMs: 250,
            dispatch: async (item) => {
                const payload = item.payload as unknown as { role?: "manager" | "participant" };
                if (payload.role === "manager")
                    await dispatchManagerPlanningDelivery(
                        stored.repository,
                        stored.parent!,
                        meetingId,
                        signal,
                        item,
                        false
                    );
                else
                    await dispatchInitialDelivery(
                        stored.repository,
                        stored.parent!,
                        meetingId,
                        signal,
                        item,
                        false
                    );
            },
            now: options.now
        });
        workers.set(meetingId, worker);
        void worker.start().catch(() => undefined);
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
                    meetings.set(meetingId, {
                        teamId: input.teamId,
                        captainSessionId: caller.sessionId,
                        repository,
                        parent: caller.agent
                    });
                    ensureWorker(meetings.get(meetingId)!);
                    return success(meetingId, existing.snapshot?.version ?? 1, {
                        ...participantResult(input, meetingId),
                        meetingVersion: existing.snapshot?.version ?? 1,
                        status: "running"
                    });
                }
                await createMeetingRuntime(input, dependencies);
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
                    await dispatchManagerPlanningDelivery(
                        repository,
                        caller.agent as Agent,
                        meetingId,
                        commandSignal ?? signal
                    );
                    meetings.set(meetingId, {
                        teamId: input.teamId,
                        captainSessionId: caller.sessionId,
                        repository,
                        parent: caller.agent
                    });
                    ensureWorker(meetings.get(meetingId)!);
                    return success(meetingId, started.meetingVersion, {
                        ...participantResult(input, meetingId),
                        meetingVersion: started.meetingVersion,
                        status: "running"
                    });
                }
                await initializeFirstTurn(repository, options.now?.() ?? Date.now());
                meetings.set(meetingId, {
                    teamId: input.teamId,
                    captainSessionId: caller.sessionId,
                    repository,
                    parent: caller.agent
                });
                ensureWorker(meetings.get(meetingId)!);
                await dispatchInitialDelivery(
                    repository,
                    caller.agent as Agent,
                    meetingId,
                    commandSignal ?? signal
                );
                return success(meetingId, 1, {
                    ...participantResult(input, meetingId),
                    meetingVersion: 1,
                    status: "running"
                });
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

        async submitTurn(input, caller, commandSignal) {
            await rehydrate();
            if (
                caller.kind !== "participant" ||
                caller.meetingId !== input.meetingId ||
                caller.participantId === undefined
            ) {
                return failure("UNAUTHORIZED_CALLER", "Only the matching Participant can submit.");
            }
            if (hasUnsupportedClaims(input)) {
                return failure(
                    "UNSUPPORTED_CAPABILITY",
                    "Structured claims are outside this runtime slice."
                );
            }
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            const messageId = `message-${input.deliveryId}`;
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
                                    createdAt: Date.now()
                                },
                                now: options.now?.() ?? Date.now(),
                                nextPlanningAttemptId: `${state.id}-planning-${state.turnSeq + 1}`,
                                nextPlanningDeliveryId: `${state.id}-planning-delivery-${state.turnSeq + 1}`
                            }
                        );
                        const nextStep =
                            transition.state.currentTurn?.steps[
                                transition.state.currentTurn.currentStepIndex
                            ];
                        const submittedTurn = transition.state.currentTurn;
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
                            outbox:
                                submittedTurn?.status === "running" && nextStep?.attempt
                                    ? [
                                          {
                                              deliveryId: nextStep.attempt.deliveryId,
                                              kind: "dispatch",
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
                                                kind: "dispatch",
                                                payload: {
                                                    role: "manager",
                                                    planningAttemptId:
                                                        transition.state.manager
                                                            .currentPlanningAttempt.id
                                                }
                                            }
                                        ]
                                      : []
                        };
                    }
                });
                if (
                    stored.parent !== undefined &&
                    committed.result &&
                    ("nextStepId" in committed.result ||
                        (committed.result.meetingStatus === "running" &&
                            committed.result.turnStatus === "completed"))
                ) {
                    if (committed.result.turnStatus === "running")
                        await dispatchInitialDelivery(
                            stored.repository,
                            stored.parent,
                            input.meetingId,
                            commandSignal ?? signal
                        );
                    else
                        await dispatchManagerPlanningDelivery(
                            stored.repository,
                            stored.parent,
                            input.meetingId,
                            commandSignal ?? signal
                        );
                }
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
            try {
                const current = await stored.repository.read();
                const recovered = await stored.repository.recover();
                const state = current.state as unknown as MeetingState;
                const dispatchableParticipantIds = state.participants
                    .filter((participant) => participant.status === "available")
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
                return commandError(error, "MANAGER_PLAN_INVALID", "The Manager plan is invalid.", {
                    meetingId: input.meetingId,
                    meetingVersion: input.observedMeetingVersion
                });
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
        let dispatchManager = false;
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
                            const planningAttemptId = `${nextState.id}-planning-${nextState.version}`;
                            const planningDeliveryId = `${nextState.id}-planning-delivery-${nextState.version}`;
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
                            dispatchManager = true;
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
                if (dispatchManager)
                    await dispatchManagerPlanningDelivery(
                        stored.repository,
                        stored.parent,
                        input.meetingId,
                        options.signal ?? signal
                    );
                else
                    await dispatchInitialDelivery(
                        stored.repository,
                        stored.parent,
                        input.meetingId,
                        options.signal ?? signal
                    );
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
        taskSnapshots: [],
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

async function initializeFirstTurn(repository: MeetingRepositoryRuntime, now: number) {
    const current = await repository.read();
    const currentState = current.state as unknown as MeetingState;
    const firstAgenda = currentState.agenda[0];
    if (firstAgenda === undefined) return;
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
    await repository.execute({
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
}
