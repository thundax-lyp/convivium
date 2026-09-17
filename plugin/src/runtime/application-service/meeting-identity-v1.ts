import type { MeetingState } from "@/domain/index.js";
import { recommendIdentityV1, type IdentityRecommendationDraftV1 } from "@/domain/index.js";
import { readMeetingRoleCatalogV1, type RoleCatalogPortV1 } from "@/dsh/index.js";
import type { MeetingAgentDefinitionV1 } from "@/role-composition/model.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { MeetingCommandV1 } from "@/protocol/index.js";
import type { RepositoryCommand } from "@/repository/types.js";
export interface CallerBindingV1 {
    channel: "dsh_tool" | "loopback_remote" | "runtime_recovery" | "deadline_handler";
    principalId: string;
    sessionBindingId?: string;
}
export interface VerifiedIdentitySessionScopeV1 {
    teamId: string;
    managerId: string;
    managerSessionId: string;
    captainParentSessionId: string;
    captainParentAgent: unknown;
}
export interface MeetingIdentityApplicationDepsV1 {
    repository: MeetingRepositoryPort<MeetingState>;
    catalog?: RoleCatalogPortV1;
    definitions: readonly MeetingAgentDefinitionV1[];
    ids: {
        nextId(
            kind: "identity_recommendation" | "meeting_identity" | "fact" | "receipt" | "outbox"
        ): string;
    };
    clock: { now(): number };
    readVerifiedSessionScope(
        meetingId: string
    ): Promise<VerifiedIdentitySessionScopeV1 | undefined>;
}
export type MeetingCommandResultV1 =
    | {
          kind: "accepted";
          meetingId: string;
          committedVersion: number;
          recommendationId: string;
          status: "provisioning" | "rejected";
      }
    | { kind: "rejected"; error: { code: string; message: string } };
export function createMeetingIdentityApplicationV1(deps: MeetingIdentityApplicationDepsV1) {
    return {
        async recommendIdentity(
            command: MeetingCommandV1,
            caller: CallerBindingV1
        ): Promise<MeetingCommandResultV1> {
            if (command.action.kind !== "recommend_identity")
                return {
                    kind: "rejected",
                    error: { code: "INVALID_ARGUMENT", message: "Wrong action" }
                };
            const scope = await deps.readVerifiedSessionScope(command.meetingId);
            if (
                !scope ||
                caller.channel !== "dsh_tool" ||
                caller.principalId !== scope.managerId ||
                caller.sessionBindingId !== scope.managerSessionId
            )
                return {
                    kind: "rejected",
                    error: {
                        code: "UNAUTHORIZED",
                        message: "Only the current Meeting Manager may recommend an identity"
                    }
                };
            if (!deps.catalog)
                return {
                    kind: "rejected",
                    error: { code: "PRECONDITION_FAILED", message: "Catalog is unavailable" }
                };
            const catalog = await readMeetingRoleCatalogV1(
                deps.catalog,
                command.meetingId,
                scope.captainParentSessionId,
                scope.managerSessionId
            );
            if (catalog.kind !== "available") return { kind: "rejected", error: catalog.error };
            const action = command.action as Extract<
                MeetingCommandV1["action"],
                { kind: "recommend_identity" }
            >;
            const candidate = catalog.snapshot.candidates.find(
                (item) => item.candidateId === action.candidateId
            );
            if (
                !candidate ||
                candidate.availability !== "available" ||
                candidate.definition.id !== action.definitionId ||
                candidate.definition.version !== action.definitionVersion ||
                catalog.snapshot.catalogId !== action.catalogId ||
                catalog.snapshot.catalogVersion !== action.catalogVersion
            )
                return {
                    kind: "rejected",
                    error: {
                        code: "PRECONDITION_FAILED",
                        message: "Catalog candidate does not match"
                    }
                };
            const recommendationId = deps.ids.nextId("identity_recommendation");
            const identityId =
                action.decision === "admit" ? deps.ids.nextId("meeting_identity") : undefined;
            const draft: IdentityRecommendationDraftV1 = {
                candidateId: action.candidateId,
                definitionId: action.definitionId,
                definitionVersion: action.definitionVersion,
                catalogId: action.catalogId,
                catalogVersion: action.catalogVersion,
                agendaId: action.agendaId,
                decision: action.decision,
                rationale: action.rationale,
                expectedContribution: action.expectedContribution,
                evidenceGap: action.evidenceGap
            };
            const repositoryCommand: RepositoryCommand<MeetingCommandResultV1, MeetingState> = {
                requestId: command.requestId,
                commandKind: action.kind,
                authorization: {
                    callerBinding: `${caller.channel}:${caller.principalId}`,
                    capabilityId: `manager:${scope.managerId}`
                },
                requestHash: JSON.stringify(action),
                expectedMeetingVersion: command.expectedMeetingVersion,
                transition: (snapshot) => {
                    const result = recommendIdentityV1(
                        snapshot.state,
                        draft,
                        scope.managerId,
                        {
                            recommendationId,
                            ...(identityId
                                ? {
                                      identityId,
                                      childSessionId: `${command.meetingId}-participant-${identityId}`
                                  }
                                : {})
                        },
                        deps.clock.now()
                    );
                    if (result.kind !== "accepted")
                        return {
                            state: snapshot.state,
                            result: {
                                kind: "rejected",
                                error: { code: result.errorCode, message: result.errorCode }
                            },
                            events: [],
                            outbox: []
                        };
                    return {
                        state: result.state,
                        result: {
                            kind: "accepted",
                            meetingId: command.meetingId,
                            committedVersion: snapshot.version + 1,
                            recommendationId,
                            status: draft.decision === "admit" ? "provisioning" : "rejected"
                        },
                        events: [
                            {
                                type: "meeting.replanned",
                                payload: { recommendationId, decision: draft.decision }
                            }
                        ],
                        outbox: result.effect
                            ? [
                                  {
                                      id: recommendationId,
                                      deliveryId: `identity-provision:${recommendationId}`,
                                      kind: "dispatch",
                                      payload: {
                                          effect: "identity_provision",
                                          recommendationId,
                                          admissionId: recommendationId
                                      }
                                  }
                              ]
                            : []
                    };
                }
            };
            return (await deps.repository.execute(repositoryCommand)).result;
        }
    };
}
