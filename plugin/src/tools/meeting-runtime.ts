import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    followupParticipantSession,
    type ContinuableFollowupRuntime,
    type ContinuableStarter
} from "../dsh/index.js";
import {
    planRoundRobinTurn,
    submitSpeakerAttempt,
    transitionMeeting,
    type MeetingState,
    type MeetingTurn
} from "../domain/index.js";
import {
    createMeetingRuntime,
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
    MeetingControlResultV1,
    TurnSubmissionResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1
} from "../protocol/index.js";
import type { MeetingToolCaller, MeetingToolRuntime } from "./register-tools.js";
import type { MeetingOwnershipLookup } from "../dsh/index.js";

export interface CreateStatusRuntimeOptions {
    readonly dataRoot: string;
    readonly provider: string;
    readonly continuable: ContinuableStarter & ContinuableFollowupRuntime;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly signal?: AbortSignal;
    readonly now?: () => number;
}

export type MeetingRuntimeWithCallerLookup = MeetingToolRuntime & MeetingOwnershipLookup;

interface StoredMeeting {
    readonly teamId: string;
    readonly captainSessionId: string;
    readonly repository: MeetingRepositoryRuntime;
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
    return join(root, encodeURIComponent(teamId), `${encodeURIComponent(meetingId)}.sqlite`);
}

function stableMeetingId(input: CreateMeetingInputV1): string {
    return `meeting-${createHash("sha256")
        .update(`${input.teamId}\0${input.requestId}`)
        .digest("hex")
        .slice(0, 32)}`;
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

function commandError(error: unknown, fallback: ProtocolErrorV1["code"], message: string) {
    const code =
        error && typeof error === "object" && "code" in error
            ? (error as { code?: unknown }).code
            : undefined;
    return failure(
        typeof code === "string" ? code : fallback,
        message,
        code === "VERSION_CONFLICT"
    );
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
        commandSignal: AbortSignal
    ) {
        const recovered = await repository.recover();
        const [item] = await repository.claimOutbox({
            owner: `runtime:${meetingId}`,
            ttlMs: 60_000,
            batchSize: 1,
            now: options.now?.() ?? Date.now()
        });
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
                authorize: async () => undefined
            });
            await repository.completeOutbox({
                id: item.id,
                leaseOwner: item.leaseOwner,
                leaseToken: item.leaseToken,
                completion: { status: "delivered" }
            });
        } catch (error) {
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

    return {
        async createMeeting(input, caller, commandSignal) {
            if (caller.kind !== "captain" || caller.agent === undefined) {
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "Only a live Captain Agent can create a meeting."
                );
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
                now: options.now
            };
            try {
                const existing = await repository.recover().catch(() => undefined);
                if (
                    existing?.bootstrap.status === "ready" &&
                    existing.bootstrap.createResult !== undefined
                ) {
                    meetings.set(meetingId, {
                        teamId: input.teamId,
                        captainSessionId: caller.sessionId,
                        repository
                    });
                    return success(meetingId, existing.snapshot?.version ?? 1, {
                        ...participantResult(input, meetingId),
                        meetingVersion: existing.snapshot?.version ?? 1,
                        status: "running"
                    });
                }
                await createMeetingRuntime(input, dependencies);
                await initializeFirstTurn(repository, options.now?.() ?? Date.now());
                meetings.set(meetingId, {
                    teamId: input.teamId,
                    captainSessionId: caller.sessionId,
                    repository
                });
                void dispatchInitialDelivery(
                    repository,
                    caller.agent as Agent,
                    meetingId,
                    commandSignal ?? signal
                ).catch(() => undefined);
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

        async submitTurn(input, caller) {
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
                        const transition = submitSpeakerAttempt(
                            state,
                            caller.participantId!,
                            snapshot.version,
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
                                }
                            }
                        );
                        const nextStep =
                            transition.state.currentTurn?.steps[
                                transition.state.currentTurn.currentStepIndex
                            ];
                        const prepared = prepareNextAttempt(
                            transition.state,
                            transition.state.currentTurn?.currentStepIndex ?? 0,
                            options.now?.() ?? Date.now()
                        );
                        return {
                            state: prepared as unknown as JsonObject,
                            result: {
                                messageId,
                                messageSeq: prepared.messageSeq,
                                turnStatus:
                                    prepared.currentTurn?.status === "completed"
                                        ? "completed"
                                        : "running",
                                ...(nextStep === undefined ? {} : { nextStepId: nextStep.id }),
                                meetingStatus: prepared.status
                            },
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox: []
                        };
                    }
                });
                return success<TurnSubmissionResultV1>(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as TurnSubmissionResultV1
                );
            } catch (error) {
                return commandError(error, "STALE_ATTEMPT", "The speaker attempt is stale.");
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
                    return {
                        state: transition.state as unknown as JsonObject,
                        result: { status: target, changed: true },
                        events: transition.effect.events as unknown as DomainEventInput[],
                        outbox: []
                    };
                }
            });
            return success<MeetingControlResultV1>(
                input.meetingId,
                committed.meetingVersion,
                committed.result as MeetingControlResultV1
            );
        } catch (error) {
            return commandError(error, "INTERNAL_ERROR", `The meeting could not be ${target}.`);
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
        attemptId: `attempt-${index}`,
        participantId: step.speaker,
        meetingId: state.id,
        turnId: turn.id,
        stepId: step.id,
        deliveryId: `delivery-${index}`,
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

function prepareNextAttempt(state: MeetingState, index: number, now: number): MeetingState {
    const turn = state.currentTurn;
    if (turn === undefined || turn.status === "completed") return state;
    const nextStep = turn.steps[index];
    if (nextStep === undefined || nextStep.status !== "pending") return state;
    const preparedTurn = assignAttempt(state, turn, index, now);
    return {
        ...state,
        currentTurn: preparedTurn,
        participants: state.participants.map((participant) =>
            participant.id === nextStep.speaker
                ? { ...participant, status: "speaking" as const }
                : participant
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
