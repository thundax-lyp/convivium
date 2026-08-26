import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ContinuableStarter } from "../dsh/index.js";
import { createMeetingRuntime, type MeetingCreationRuntimeDependencies } from "../runtime/index.js";
import { projectMeetingStatus } from "../projection/index.js";
import type {
    CreateMeetingInputV1,
    CreateMeetingResultV1,
    MeetingStatusInputV1,
    MeetingStatusResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1
} from "../protocol/index.js";
import { MeetingRepository, type RepositoryAuthorizationValidator } from "../repository/index.js";
import type { MeetingToolRuntime } from "./register-tools.js";

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

        async submitTurn() {
            return failure(
                "UNSUPPORTED_CAPABILITY",
                "Turn submission is not wired in this runtime."
            );
        },
        async pause() {
            return failure("UNSUPPORTED_CAPABILITY", "Pause is not wired in this runtime.");
        },
        async resume() {
            return failure("UNSUPPORTED_CAPABILITY", "Resume is not wired in this runtime.");
        }
    };
}
