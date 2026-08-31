import { endMeeting as endMeetingTransition, type MeetingState } from "../../domain/index.js";
import type { EndMeetingInputV1, EndMeetingResultV1 } from "../../protocol/index.js";
import type { DomainEventInput, JsonObject } from "../meeting-runtime.js";
import {
    commandFailure as failure,
    commandSuccess as success,
    mapCommandError as commandError
} from "../services/command-result-service.js";
import type { MeetingRehydrationService } from "../services/meeting-recovery-service.js";
import type { MeetingDeliveryWorkerService } from "../services/types.js";
import type { CreateStatusRuntimeOptions, MeetingToolCaller, MeetingToolRuntime } from "./index.js";
import type { StoredMeeting } from "./types.js";

export interface MeetingEndApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
    readonly deliveryWorkers: MeetingDeliveryWorkerService;
    readonly recoverArchiveForCaptain: (
        stored: StoredMeeting,
        caller: MeetingToolCaller
    ) => Promise<void>;
}

export function createMeetingEndApplication(dependencies: MeetingEndApplicationOptions) {
    const { options, meetings, recovery, deliveryWorkers, recoverArchiveForCaptain } = dependencies;
    const application: Pick<MeetingToolRuntime, "endMeeting"> = {
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
        }
    };
    return application;
}
