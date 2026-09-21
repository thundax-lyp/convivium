import type { MeetingState, OpaqueId } from "@/domain/index.js";

export type MeetingDomainErrorCode =
    | "INVALID_ARGUMENT"
    | "UNAUTHORIZED"
    | "MEETING_TERMINAL"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "PRECONDITION_FAILED"
    | "REVIEWER_CONFLICT"
    | "ROUND_NOT_CLOSABLE"
    | "LIMIT_EXCEEDED";

export interface AgentNoticeEffectBase {
    kind: "agent_notice";
    recipientId: OpaqueId;
    agendaId: OpaqueId;
}

export type AgentNoticeEffectRequest =
    | (AgentNoticeEffectBase & { noticeKind: "meeting_started" })
    | (AgentNoticeEffectBase & { noticeKind: "opportunity_request"; requestId: OpaqueId })
    | (AgentNoticeEffectBase & {
          noticeKind: "opportunity_disposition";
          requestId: OpaqueId;
          disposition: "rejected" | "deferred";
          reason: string;
      })
    | (AgentNoticeEffectBase & {
          noticeKind: "hand_request";
          requestKind: "initial";
          roundId: OpaqueId;
          contributorId: OpaqueId;
      })
    | (AgentNoticeEffectBase & {
          noticeKind: "hand_request";
          requestKind: "supplement";
          contributionId: OpaqueId;
      })
    | (AgentNoticeEffectBase & {
          noticeKind: "hand_disposition";
          requestKind: "initial";
          roundId: OpaqueId;
          contributorId: OpaqueId;
          disposition: "accepted";
          reason: string;
          contributionId: OpaqueId;
      })
    | (AgentNoticeEffectBase & {
          noticeKind: "hand_disposition";
          requestKind: "initial";
          roundId: OpaqueId;
          contributorId: OpaqueId;
          disposition: "rejected" | "deferred";
          reason: string;
      })
    | (AgentNoticeEffectBase & {
          noticeKind: "hand_disposition";
          requestKind: "supplement";
          contributionId: OpaqueId;
          disposition: "accepted" | "rejected" | "deferred";
          reason: string;
      })
    | (AgentNoticeEffectBase & { noticeKind: "review_request"; versionId: OpaqueId })
    | (AgentNoticeEffectBase & {
          noticeKind: "transcript_update";
          publicMessageId: OpaqueId;
      });

export type MeetingDomainEffectRequest =
    | AgentNoticeEffectRequest
    | { kind: "review_delivery"; reviewId: OpaqueId; authorId: OpaqueId }
    | { kind: "materialize_archive"; terminationId: OpaqueId }
    | {
          kind: "session_mail";
          mailId: OpaqueId;
          recipientId: OpaqueId;
          contextPublicationUpperBound: readonly OpaqueId[];
      };

export type MeetingTransitionResult =
    | {
          kind: "accepted";
          state: MeetingState;
          relatedIds: readonly OpaqueId[];
          effectRequests: readonly MeetingDomainEffectRequest[];
      }
    | {
          kind: "rejected";
          state: MeetingState;
          relatedIds: readonly [];
          effectRequests: readonly [];
          error: {
              code: MeetingDomainErrorCode;
              message: string;
              targetKind?: string;
              targetId?: OpaqueId;
          };
      };

export function rejectedTransitionV1(
    state: MeetingState,
    code: MeetingDomainErrorCode,
    message: string,
    targetId?: OpaqueId
): MeetingTransitionResult {
    return {
        kind: "rejected",
        state,
        relatedIds: [],
        effectRequests: [],
        error: { code, message, ...(targetId === undefined ? {} : { targetId }) }
    };
}
