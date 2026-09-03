import type {
    CaptainDecisionAcceptanceInputV1,
    CaptainDecisionAcceptanceResultV1,
    CaptainDecisionDispositionInputV1,
    CaptainDecisionDispositionResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1
} from "../../protocol/index.js";
import { acceptDecisionCandidate, disposeDecision } from "../../domain/index.js";
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

export interface MeetingDecisionApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
}
export function createMeetingDecisionApplication({
    options,
    meetings,
    recovery
}: MeetingDecisionApplicationOptions): Pick<
    MeetingToolRuntime,
    "acceptDecision" | "disposeDecision"
> {
    return {
        async acceptDecision(
            input: CaptainDecisionAcceptanceInputV1,
            caller: MeetingToolCaller
        ): Promise<ProtocolSuccessV1<CaptainDecisionAcceptanceResultV1> | ProtocolErrorV1> {
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
                    "Only the meeting Captain can accept a decision."
                );
            try {
                const now = options.now?.() ?? Date.now();
                const committed = await stored.repository.execute({
                    requestId: input.requestId,
                    commandKind: "accept_decision",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `captain:${caller.sessionId}`
                    },
                    requestHash: serializeValidatedRequestV1(input),
                    expectedMeetingVersion: input.expectedMeetingVersion,
                    transition: (snapshot) => {
                        const result = acceptDecisionCandidate(snapshot.state as never, {
                            meetingId: input.meetingId,
                            decisionCandidateId: input.decisionCandidateId,
                            actorBinding: `captain:${caller.sessionId}`,
                            reason: input.reason,
                            evidenceMessageIds: input.evidenceMessageIds,
                            now
                        });
                        const decision = result.state.decisions.at(-1)!;
                        return {
                            state: result.state as unknown as JsonObject,
                            result: {
                                requestId: input.requestId,
                                decisionCandidateId: input.decisionCandidateId,
                                decisionId: decision.id,
                                proposalId: decision.proposalId,
                                proposalRevision: decision.proposalRevision,
                                completionFactId: `completion-${input.decisionCandidateId}-acceptance`
                            },
                            events: result.effect.events as never,
                            outbox: []
                        };
                    }
                });
                return success(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as CaptainDecisionAcceptanceResultV1
                );
            } catch (error) {
                return mapCommandError(
                    error,
                    "INTERNAL_ERROR",
                    "The decision could not be accepted.",
                    { meetingId: input.meetingId },
                    { INVALID_ENTITY_STATE: "INVALID_ARGUMENT" }
                );
            }
        },
        async disposeDecision(input: CaptainDecisionDispositionInputV1, caller) {
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
                    "Only the meeting Captain can dispose a decision."
                );
            try {
                const now = options.now?.() ?? Date.now();
                const committed = await stored.repository.execute({
                    requestId: input.requestId,
                    commandKind: "dispose_decision",
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `captain:${caller.sessionId}`
                    },
                    requestHash: serializeValidatedRequestV1(input),
                    expectedMeetingVersion: input.expectedMeetingVersion,
                    transition: (snapshot) => {
                        const transition =
                            input.action === "supersede"
                                ? disposeDecision(snapshot.state as never, {
                                      meetingId: input.meetingId,
                                      requestId: input.requestId,
                                      decisionId: input.decisionId,
                                      action: "supersede",
                                      replacementCandidateId: input.replacementCandidateId!,
                                      actorBinding: `captain:${caller.sessionId}`,
                                      reason: input.reason,
                                      evidenceMessageIds: input.evidenceMessageIds,
                                      now
                                  })
                                : disposeDecision(snapshot.state as never, {
                                      meetingId: input.meetingId,
                                      requestId: input.requestId,
                                      decisionId: input.decisionId,
                                      action: "revoke",
                                      actorBinding: `captain:${caller.sessionId}`,
                                      reason: input.reason,
                                      evidenceMessageIds: input.evidenceMessageIds,
                                      now
                                  });
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: {
                                requestId: input.requestId,
                                decisionId: input.decisionId,
                                action: input.action,
                                completionFactId: `completion-${input.requestId}-decision-${input.action === "supersede" ? "supersession" : "revocation"}`,
                                ...(input.action === "supersede"
                                    ? {
                                          replacementDecisionId:
                                              transition.state.decisions.at(-1)!.id
                                      }
                                    : {})
                            },
                            events: transition.effect.events as never,
                            outbox: []
                        } satisfies {
                            state: JsonObject;
                            result: CaptainDecisionDispositionResultV1;
                            events: never;
                            outbox: never[];
                        };
                    }
                });
                return success(
                    input.meetingId,
                    committed.meetingVersion,
                    committed.result as CaptainDecisionDispositionResultV1
                );
            } catch (error) {
                return mapCommandError(
                    error,
                    "INTERNAL_ERROR",
                    "The decision could not be disposed.",
                    { meetingId: input.meetingId },
                    { INVALID_ENTITY_STATE: "INVALID_ARGUMENT" }
                );
            }
        }
    };
}
