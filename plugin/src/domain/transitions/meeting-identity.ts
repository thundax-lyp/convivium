import type { EpochMs, IdentityRecommendation, MeetingState } from "@/domain/meeting-state.js";
import { validateMeetingState } from "@/domain/meeting-state-validation.js";

export type IdentityRecommendationDraft = {
    candidateId: string;
    definitionId: string;
    definitionVersion: string;
    catalogId: string;
    catalogVersion: string;
    agendaId: string;
    decision: "admit" | "reject";
    rationale: string;
    expectedContribution: string;
    evidenceGap: string;
};
export type IdentityAdmissionResultContext =
    | {
          kind: "admitted";
          admissionId: string;
          meetingId: string;
          identityId: string;
          sessionId: string;
          ownershipId: string;
          descriptorId: string;
          displayName: string;
          definitionId: string;
          definitionVersion: string;
          definitionHash: string;
      }
    | { kind: "rejected"; failureCode: string };
export type IdentityTransitionResult =
    | {
          kind: "accepted";
          state: MeetingState;
          fact: { kind: string; actorId: string; occurredAt: number; relatedIds: string[] };
          facts: readonly [
              { kind: string; actorId: string; occurredAt: number; relatedIds: string[] }
          ];
          effect?: { kind: "identity_provision"; recommendationId: string; admissionId: string };
      }
    | {
          kind: "rejected";
          errorCode: "INVALID_ARGUMENT" | "NOT_FOUND" | "INVALID_STATE" | "PRECONDITION_FAILED";
          state: MeetingState;
          facts: readonly [];
      };

type IdentityRejectionCode =
    "INVALID_ARGUMENT" | "NOT_FOUND" | "INVALID_STATE" | "PRECONDITION_FAILED";
const reject = (
    state: MeetingState,
    errorCode: IdentityRejectionCode
): IdentityTransitionResult => ({ kind: "rejected", state, errorCode, facts: [] });
const valid = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;

function validRecommendationDraft(action: IdentityRecommendationDraft): boolean {
    return (
        !!action &&
        valid(action.candidateId) &&
        valid(action.definitionId) &&
        valid(action.definitionVersion) &&
        valid(action.catalogId) &&
        valid(action.catalogVersion) &&
        valid(action.agendaId) &&
        valid(action.rationale) &&
        valid(action.expectedContribution) &&
        valid(action.evidenceGap)
    );
}

export function recommendIdentity(
    state: MeetingState,
    action: IdentityRecommendationDraft,
    managerId: string,
    ids: {
        recommendationId: string;
        identityId?: string;
        sessionId?: string;
        definitionHash?: string;
    },
    now: EpochMs
): IdentityTransitionResult {
    if (
        validateMeetingState(state).kind !== "valid" ||
        !valid(managerId) ||
        !Number.isSafeInteger(now) ||
        !valid(ids.recommendationId)
    )
        return reject(state, "INVALID_ARGUMENT");
    if (!validRecommendationDraft(action)) return reject(state, "INVALID_ARGUMENT");
    if (state.lifecycle.status !== "running") return reject(state, "INVALID_STATE");
    if (
        !state.identities.some(
            (identity) => identity.id === managerId && identity.roles.includes("manager")
        )
    )
        return reject(state, "PRECONDITION_FAILED");
    if (!state.agenda.some((agenda) => agenda.id === action.agendaId))
        return reject(state, "NOT_FOUND");
    const candidateRecommendations = state.identityRecommendations.filter(
        (item) => item.candidateId === action.candidateId
    );
    if (candidateRecommendations.some((item) => item.status === "provisioning"))
        return reject(state, "INVALID_STATE");
    const active = candidateRecommendations.find((item) => item.status === "active");
    if (active?.agendaId === action.agendaId) return reject(state, "INVALID_STATE");
    if (
        active !== undefined &&
        (action.decision !== "admit" ||
            active.definitionId !== action.definitionId ||
            active.definitionVersion !== action.definitionVersion ||
            active.definitionHash === undefined ||
            active.definitionHash !== ids.definitionHash)
    )
        return reject(state, "PRECONDITION_FAILED");
    const recommendation: IdentityRecommendation =
        action.decision === "reject"
            ? {
                  ...action,
                  decision: "reject",
                  id: ids.recommendationId,
                  managerId,
                  createdAt: now,
                  status: "rejected",
                  resolvedAt: now
              }
            : active === undefined
              ? {
                    ...action,
                    decision: "admit",
                    id: ids.recommendationId,
                    managerId,
                    createdAt: now,
                    status: "provisioning",
                    identityId: ids.identityId ?? "",
                    sessionId: ids.sessionId ?? "",
                    definitionHash: ids.definitionHash ?? ""
                }
              : {
                    ...action,
                    decision: "admit",
                    id: ids.recommendationId,
                    managerId,
                    createdAt: now,
                    status: "active",
                    identityId: active.identityId,
                    sessionId: active.sessionId,
                    definitionHash: active.definitionHash,
                    resolvedAt: now
                };
    if (action.decision === "admit" && !/^[a-f0-9]{64}$/.test(ids.definitionHash ?? ""))
        return reject(state, "INVALID_ARGUMENT");
    if (action.decision === "admit" && (!valid(ids.identityId) || !valid(ids.sessionId)))
        if (active === undefined) return reject(state, "INVALID_ARGUMENT");
    const nextState = {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        identityRecommendations: [...state.identityRecommendations, recommendation]
    };
    const fact = {
        kind: "recommend_identity",
        actorId: managerId,
        occurredAt: now,
        relatedIds: [recommendation.id, action.candidateId, action.agendaId]
    };
    return {
        kind: "accepted",
        state: nextState,
        fact,
        facts: [fact],
        ...(action.decision === "admit" && active === undefined
            ? {
                  effect: {
                      kind: "identity_provision" as const,
                      recommendationId: recommendation.id,
                      admissionId: recommendation.id
                  }
              }
            : {})
    };
}

export function recordIdentityAdmissionResult(
    state: MeetingState,
    recommendationId: string,
    result: IdentityAdmissionResultContext,
    now: number
): IdentityTransitionResult {
    if (
        validateMeetingState(state).kind !== "valid" ||
        !valid(recommendationId) ||
        !Number.isSafeInteger(now)
    )
        return reject(state, "INVALID_ARGUMENT");
    const intent = state.identityRecommendations.find((item) => item.id === recommendationId);
    if (!intent || intent.decision !== "admit" || intent.status !== "provisioning")
        return reject(state, "NOT_FOUND");
    if (
        result.kind === "admitted" &&
        (result.admissionId !== intent.id ||
            result.meetingId !== state.id ||
            result.identityId !== intent.identityId ||
            result.sessionId !== intent.sessionId ||
            result.definitionId !== intent.definitionId ||
            result.definitionVersion !== intent.definitionVersion ||
            result.definitionHash !== intent.definitionHash ||
            !valid(result.ownershipId) ||
            !valid(result.descriptorId) ||
            !valid(result.displayName) ||
            !valid(result.definitionHash))
    )
        return reject(state, "PRECONDITION_FAILED");
    const updated =
        result.kind === "admitted"
            ? {
                  ...intent,
                  status: "active" as const,
                  resolvedAt: now,
                  definitionHash: result.definitionHash
              }
            : {
                  ...intent,
                  status: "failed" as const,
                  resolvedAt: now,
                  failureCode: result.failureCode
              };
    const nextState = {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        identityRecommendations: state.identityRecommendations.map((item) =>
            item.id === intent.id ? updated : item
        ),
        identities:
            result.kind === "admitted"
                ? [
                      ...state.identities,
                      {
                          id: result.identityId,
                          displayName: result.displayName,
                          roles: ["contributor" as const],
                          agendaResponsibilityIds: [],
                          riskAuthority: false,
                          required: false,
                          definitionId: result.definitionId,
                          definitionVersion: result.definitionVersion,
                          definitionHash: result.definitionHash,
                          sessionOwnershipId: result.ownershipId
                      }
                  ]
                : state.identities
    };
    const fact = {
        kind: "record_identity_admission_result",
        actorId: "runtime:identity-provision",
        occurredAt: now,
        relatedIds: [recommendationId]
    };
    return { kind: "accepted", state: nextState, fact, facts: [fact] };
}
