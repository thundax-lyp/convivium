import { endMeeting as endMeetingTransition, type MeetingState } from "../../domain/index.js";
import type { EndMeetingInputV1, EndMeetingResultV1 } from "../../protocol/index.js";
import { RepositoryError } from "../../repository/index.js";
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
    MeetingToolCaller,
    MeetingToolRuntime
} from "./index.js";
import type { MeetingControlSource, StoredMeeting } from "./types.js";

export interface MeetingEndApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
    readonly deliveryWorkers: MeetingDeliveryWorkerService;
    readonly recoverArchiveForCaptain: (
        stored: StoredMeeting,
        caller: MeetingToolCaller
    ) => Promise<void>;
    readonly assertLocalArchiveRecoveryAvailable: (stored: StoredMeeting) => void;
    readonly recoverArchiveForLocal: (stored: StoredMeeting) => Promise<void>;
}

export function createMeetingEndApplication(dependencies: MeetingEndApplicationOptions) {
    const {
        options,
        meetings,
        recovery,
        deliveryWorkers,
        recoverArchiveForCaptain,
        assertLocalArchiveRecoveryAvailable,
        recoverArchiveForLocal
    } = dependencies;
    const application: Pick<
        MeetingToolRuntime & LocalMeetingWebRuntime,
        "endMeeting" | "endLocalMeeting"
    > = {
        async endMeeting(input: EndMeetingInputV1, caller) {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (
                stored === undefined ||
                caller.kind !== "captain" ||
                caller.sessionId !== stored.captainSessionId ||
                (caller.meetingId !== undefined && caller.meetingId !== input.meetingId)
            ) {
                return failure("UNAUTHORIZED_CALLER", "Only the meeting Captain can end it.");
            }
            return endMeetingForSource(
                input,
                stored,
                { kind: "captain", sessionId: caller.sessionId },
                () => recoverArchiveForCaptain(stored, caller)
            );
        },
        async endLocalMeeting(input) {
            const snapshots = await recovery.rehydrate({
                kind: "local_meeting",
                meetingId: input.meetingId
            });
            if (!snapshots?.has(input.meetingId))
                return failure("MEETING_NOT_FOUND", "Meeting not found.");
            const stored = meetings.get(input.meetingId);
            if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
            return endMeetingForSource(input, stored, { kind: "local_host" }, () =>
                recoverArchiveForLocal(stored)
            );
        }
    };

    async function endMeetingForSource(
        input: EndMeetingInputV1,
        stored: StoredMeeting,
        source: MeetingControlSource,
        recoverArchiveAfterCommit: () => Promise<void>
    ) {
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
        const captainBinding =
            source.kind === "captain" ? `captain:${source.sessionId}` : "local-host:loopback-web";
        try {
            const committed = await stored.repository.execute({
                requestId: input.requestId,
                commandKind: "end_meeting",
                authorization,
                requestHash: JSON.stringify(input),
                expectedMeetingVersion: input.expectedMeetingVersion,
                transition: (snapshot) => {
                    if (source.kind === "local_host") {
                        assertLocalArchiveRecoveryAvailable(stored);
                    }
                    const transition = endMeetingTransition(
                        snapshot.state as unknown as MeetingState,
                        {
                            meetingId: input.meetingId,
                            captainBinding,
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
                await recoverArchiveAfterCommit();
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
            if (source.kind === "local_host") {
                if (error instanceof LocalMeetingRecoveryUnavailableError) throw error;
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
                        "Local meeting archive recovery is unavailable.",
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
            }
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
    }
    return application;
}
