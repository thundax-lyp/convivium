import type { Agent } from "@deepseek-ai/dsh-agent";
import type { MeetingState } from "../../domain/index.js";
import { projectMeetingStatus } from "../../projection/index.js";
import {
    LocalMeetingListResponseSchema,
    MeetingStatusResultSchema,
    type MeetingStatusInputV1,
    type MeetingStatusResultV1
} from "../../protocol/index.js";
import { commandFailure, commandSuccess } from "../services/command-result-service.js";
import {
    LocalMeetingRecoveryUnavailableError,
    type MeetingRehydrationService
} from "../services/meeting-recovery-service.js";
import type { StoredMeeting } from "./types.js";

export interface MeetingQueryCaller {
    readonly sessionId: string;
    readonly agent?: Agent;
    readonly kind: "captain" | "manager" | "participant";
    readonly meetingId?: string;
    readonly participantId?: string;
}

export interface MeetingQueryApplicationOptions {
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
    readonly recoverArchiveForCaptain: (
        stored: StoredMeeting,
        caller: MeetingQueryCaller
    ) => Promise<void>;
}

function isAuthorizedForMeeting(
    caller: MeetingQueryCaller,
    stored: StoredMeeting,
    meetingId: string
): boolean {
    if (caller.kind === "captain") return caller.sessionId === stored.captainSessionId;
    return caller.meetingId === meetingId;
}

export function createMeetingQueryApplication(options: MeetingQueryApplicationOptions) {
    return {
        async getStatus(input: MeetingStatusInputV1, caller: MeetingQueryCaller) {
            await options.recovery.rehydrate();
            const stored = options.meetings.get(input.meetingId);
            if (stored === undefined)
                return commandFailure("MEETING_NOT_FOUND", "Meeting not found.");
            if (!isAuthorizedForMeeting(caller, stored, input.meetingId)) {
                return commandFailure(
                    "UNAUTHORIZED_CALLER",
                    "The caller is not bound to this meeting."
                );
            }
            try {
                await options.recoverArchiveForCaptain(stored, caller).catch(() => undefined);
                const snapshot = await stored.repository.read();
                const state = JSON.parse(JSON.stringify(snapshot.state));
                return commandSuccess(
                    snapshot.meetingId,
                    snapshot.version,
                    projectMeetingStatus(state, caller) as MeetingStatusResultV1
                );
            } catch {
                return commandFailure("MEETING_NOT_FOUND", "Meeting not found.");
            }
        },

        async listLocalMeetings() {
            const snapshots =
                (await options.recovery.rehydrate({ kind: "local_list" })) ?? new Map();
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

        async getLocalMeetingStatus(input: MeetingStatusInputV1) {
            const snapshots = await options.recovery.rehydrate({
                kind: "local_meeting",
                meetingId: input.meetingId
            });
            const snapshot = snapshots?.get(input.meetingId);
            if (snapshot === undefined)
                return commandFailure("MEETING_NOT_FOUND", "Meeting not found.");
            try {
                const state = JSON.parse(JSON.stringify(snapshot.state)) as MeetingState;
                const projection = projectMeetingStatus(state, {
                    kind: "local_host",
                    sessionId: "loopback-web"
                });
                const projected = MeetingStatusResultSchema(
                    projection as unknown as Record<string, unknown>
                ) as unknown as MeetingStatusResultV1;
                return commandSuccess(snapshot.meetingId, snapshot.version, projected);
            } catch (error) {
                throw new LocalMeetingRecoveryUnavailableError(
                    "Local meeting status projection is unavailable.",
                    { cause: error }
                );
            }
        },

        async findBySessionId(sessionId: string, signal: AbortSignal) {
            if (signal.aborted) throw signal.reason;
            await options.recovery.rehydrate();
            for (const [meetingId, stored] of options.meetings) {
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
    };
}
