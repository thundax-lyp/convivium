import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ContinuableStarter } from "../dsh/index.js";
import { submitSpeakerAttempt, transitionMeeting, type MeetingState } from "../domain/index.js";
import { createMeetingRuntime, type MeetingCreationRuntimeDependencies } from "../runtime/index.js";
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
import {
    MeetingRepository,
    type DomainEventInput,
    type JsonObject,
    type RepositoryAuthorizationValidator
} from "../repository/index.js";
import type { MeetingToolCaller, MeetingToolRuntime } from "./register-tools.js";

export interface CreateStatusRuntimeOptions {
    readonly dataRoot: string;
    readonly provider: string;
    readonly continuable: ContinuableStarter;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly signal?: AbortSignal;
    readonly now?: () => number;
}

interface StoredMeeting {
    readonly teamId: string;
    readonly repository: MeetingRepository;
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

export function createCreateStatusRuntime(options: CreateStatusRuntimeOptions): MeetingToolRuntime {
    const meetings = new Map<string, StoredMeeting>();
    const signal = options.signal ?? new AbortController().signal;

    return {
        async createMeeting(input, caller, commandSignal) {
            if (caller.kind !== "captain" || caller.agent === undefined) {
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "Only a live Captain Agent can create a meeting."
                );
            }
            const meetingId = `meeting-${randomUUID()}`;
            const repository = await MeetingRepository.open({
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
                await createMeetingRuntime(input, dependencies);
                meetings.set(meetingId, { teamId: input.teamId, repository });
                return success(meetingId, 0, participantResult(input, meetingId));
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
            if (caller.meetingId !== input.meetingId) {
                return failure("UNAUTHORIZED_CALLER", "The caller is not bound to this meeting.");
            }
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
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
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: {
                                messageId,
                                messageSeq: transition.state.messageSeq,
                                turnStatus:
                                    transition.state.currentTurn?.status === "completed"
                                        ? "completed"
                                        : "running",
                                ...(nextStep === undefined ? {} : { nextStepId: nextStep.id }),
                                meetingStatus: transition.state.status
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
            if (caller.kind !== "captain" || caller.meetingId !== input.meetingId)
                return failure("UNAUTHORIZED_CALLER", "Only the meeting Captain can pause it.");
            return transitionMeetingStatus(input, caller, "paused");
        },
        async resume(input, caller) {
            if (caller.kind !== "captain" || caller.meetingId !== input.meetingId)
                return failure("UNAUTHORIZED_CALLER", "Only the meeting Captain can resume it.");
            return transitionMeetingStatus(input, caller, "running");
        }
    };

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
