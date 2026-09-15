import type {
    CaptainAgendaCandidateDispositionInputV1,
    CaptainAgendaCandidateDispositionResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1
} from "@/protocol/index.js";
import { disposeAgendaCandidate } from "@/domain/index.js";
import { evaluateContributionProgress } from "@/domain/index.js";
import type { DomainEvent, LegacyMeetingState } from "@/domain/index.js";
import {
    contributionOutbox,
    interruptCancelledContributions
} from "@/runtime/services/contribution-runtime-service.js";
import { serializeValidatedRequestV1 } from "@/protocol/index.js";
import type { MeetingToolCaller, MeetingToolRuntime, CreateStatusRuntimeOptions } from "./index.js";
import type { MeetingRehydrationService } from "@/runtime/services/meeting-recovery-service.js";
import type { StoredMeeting } from "./types.js";
import {
    commandFailure as failure,
    commandSuccess as success,
    mapCommandError
} from "@/runtime/services/command-result-service.js";
import type { JsonObject } from "@/runtime/meeting-runtime.js";

export interface MeetingAgendaCandidateApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
}

export function createMeetingAgendaCandidateApplication({
    options,
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
                let committedEvents: readonly DomainEvent[] = [];
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
                        const progress = evaluateContributionProgress(
                            transition.state,
                            options.now?.() ?? Date.now()
                        );
                        committedEvents = [...transition.effect.events, ...progress.effect.events];
                        return {
                            state: progress.state as unknown as JsonObject,
                            result: {
                                requestId: input.requestId,
                                candidateId: input.candidateId,
                                action: input.action,
                                ...(input.action === "promote"
                                    ? { agendaItemId: `${input.candidateId}-agenda-item` }
                                    : {})
                            },
                            events: [
                                ...transition.effect.events,
                                ...progress.effect.events
                            ] as never,
                            outbox: [
                                ...contributionOutbox(
                                    snapshot.state as unknown as LegacyMeetingState,
                                    progress.state,
                                    committedEvents
                                )
                            ]
                        } satisfies {
                            state: JsonObject;
                            result: CaptainAgendaCandidateDispositionResultV1;
                            events: never;
                            outbox: ReturnType<typeof contributionOutbox>;
                        };
                    }
                });
                await interruptCancelledContributions({
                    repository: stored.repository,
                    parent: stored.parent,
                    runtime: options.continuable,
                    events: committedEvents
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
