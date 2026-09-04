import type {
    CaptainAgendaCandidateDispositionInputV1,
    CaptainAgendaCandidateDispositionResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1
} from "../../protocol/index.js";
import { disposeAgendaCandidate } from "../../domain/index.js";
import { serializeValidatedRequestV1 } from "../../protocol/request-idempotency.js";
import type { MeetingToolCaller, MeetingToolRuntime, CreateStatusRuntimeOptions } from "./index.js";
import type { MeetingRehydrationService } from "../services/meeting-recovery-service.js";
import type { StoredMeeting } from "./types.js";
import {
    commandFailure as failure,
    commandSuccess as success,
    mapCommandError
} from "../services/command-result-service.js";
import type { JsonObject } from "../meeting-runtime.js";

export interface MeetingAgendaCandidateApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
}

export function createMeetingAgendaCandidateApplication({
    meetings,
    recovery
}: MeetingAgendaCandidateApplicationOptions): Pick<MeetingToolRuntime, "disposeAgendaCandidate"> {
    return {
        async disposeAgendaCandidate(
            input: CaptainAgendaCandidateDispositionInputV1,
            caller: MeetingToolCaller,
            _signal: AbortSignal
        ): Promise<ProtocolSuccessV1<CaptainAgendaCandidateDispositionResultV1> | ProtocolErrorV1> {
            await recovery.rehydrate();
            const stored = meetings.get(input.meetingId);
            if (
                !stored ||
                caller.kind !== "captain" ||
                caller.sessionId !== stored.captainSessionId ||
                (caller.meetingId !== undefined && caller.meetingId !== input.meetingId)
            )
                return failure(
                    "UNAUTHORIZED_CALLER",
                    "Only the meeting Captain can dispose an agenda candidate."
                );
            try {
                const committed = await stored.repository.execute({
                    requestId: input.requestId,
                    commandKind: "dispose_agenda_candidate",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `captain:${caller.sessionId}`
                    },
                    requestHash: serializeValidatedRequestV1(input),
                    expectedMeetingVersion: input.expectedMeetingVersion,
                    transition: (snapshot) => {
                        const transition =
                            input.action === "promote"
                                ? disposeAgendaCandidate(snapshot.state as never, {
                                      meetingId: input.meetingId,
                                      candidateId: input.candidateId,
                                      actorBinding: `captain:${caller.sessionId}`,
                                      action: "promote",
                                      agendaItem: input.agendaItem
                                  })
                                : disposeAgendaCandidate(snapshot.state as never, {
                                      meetingId: input.meetingId,
                                      candidateId: input.candidateId,
                                      actorBinding: `captain:${caller.sessionId}`,
                                      action: input.action
                                  });
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: {
                                requestId: input.requestId,
                                candidateId: input.candidateId,
                                action: input.action,
                                ...(input.action === "promote"
                                    ? { agendaItemId: `${input.candidateId}-agenda-item` }
                                    : {})
                            },
                            events: transition.effect.events as never,
                            outbox: []
                        } satisfies {
                            state: JsonObject;
                            result: CaptainAgendaCandidateDispositionResultV1;
                            events: never;
                            outbox: never[];
                        };
                    }
                });
                return success(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as CaptainAgendaCandidateDispositionResultV1
                );
            } catch (error) {
                return mapCommandError(
                    error,
                    "INTERNAL_ERROR",
                    "The agenda candidate could not be disposed.",
                    { meetingId: input.meetingId },
                    { INVALID_ENTITY_STATE: "INVALID_ARGUMENT" }
                );
            }
        }
    };
}
