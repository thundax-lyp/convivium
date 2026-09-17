import type { MeetingState, OpaqueId } from "@/domain/index.js";

export type MeetingDomainErrorCodeV1 =
    | "INVALID_ARGUMENT"
    | "UNAUTHORIZED"
    | "MEETING_TERMINAL"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "PRECONDITION_FAILED"
    | "REVIEWER_CONFLICT"
    | "ROUND_NOT_CLOSABLE"
    | "LIMIT_EXCEEDED";

export interface AgentNoticeEffectBaseV1 {
    kind: "agent_notice";
    recipientId: OpaqueId;
    agendaId: OpaqueId;
}

export type AgentNoticeEffectRequestV1 =
    | (AgentNoticeEffectBaseV1 & { noticeKind: "opportunity_request"; requestId: OpaqueId })
    | (AgentNoticeEffectBaseV1 & {
          noticeKind: "opportunity_disposition";
          requestId: OpaqueId;
          disposition: "rejected" | "deferred";
          reason: string;
      })
    | (AgentNoticeEffectBaseV1 & {
          noticeKind: "hand_request";
          requestKind: "initial";
          roundId: OpaqueId;
          contributorId: OpaqueId;
      })
    | (AgentNoticeEffectBaseV1 & {
          noticeKind: "hand_request";
          requestKind: "supplement";
          contributionId: OpaqueId;
      })
    | (AgentNoticeEffectBaseV1 & {
          noticeKind: "hand_disposition";
          requestKind: "initial";
          roundId: OpaqueId;
          contributorId: OpaqueId;
          disposition: "accepted";
          reason: string;
          contributionId: OpaqueId;
      })
    | (AgentNoticeEffectBaseV1 & {
          noticeKind: "hand_disposition";
          requestKind: "initial";
          roundId: OpaqueId;
          contributorId: OpaqueId;
          disposition: "rejected" | "deferred";
          reason: string;
      })
    | (AgentNoticeEffectBaseV1 & {
          noticeKind: "hand_disposition";
          requestKind: "supplement";
          contributionId: OpaqueId;
          disposition: "accepted" | "rejected" | "deferred";
          reason: string;
      })
    | (AgentNoticeEffectBaseV1 & { noticeKind: "review_request"; versionId: OpaqueId })
    | (AgentNoticeEffectBaseV1 & {
          noticeKind: "transcript_update";
          publicMessageId: OpaqueId;
      });

export type MeetingDomainEffectRequestV1 =
    | AgentNoticeEffectRequestV1
    | { kind: "review_delivery"; reviewId: OpaqueId; authorId: OpaqueId }
    | { kind: "materialize_archive"; terminationId: OpaqueId }
    | {
          kind: "session_mail";
          mailId: OpaqueId;
          recipientId: OpaqueId;
          contextPublicationUpperBound: readonly OpaqueId[];
      };

export type MeetingTransitionResultV1 =
    | {
          kind: "accepted";
          state: MeetingState;
          relatedIds: readonly OpaqueId[];
          effectRequests: readonly MeetingDomainEffectRequestV1[];
      }
    | {
          kind: "rejected";
          state: MeetingState;
          relatedIds: readonly [];
          effectRequests: readonly [];
          error: {
              code: MeetingDomainErrorCodeV1;
              message: string;
              targetKind?: string;
              targetId?: OpaqueId;
          };
      };

export function rejectedTransitionV1(
    state: MeetingState,
    code: MeetingDomainErrorCodeV1,
    message: string,
    targetId?: OpaqueId
): MeetingTransitionResultV1 {
    return {
        kind: "rejected",
        state,
        relatedIds: [],
        effectRequests: [],
        error: { code, message, ...(targetId === undefined ? {} : { targetId }) }
    };
}
