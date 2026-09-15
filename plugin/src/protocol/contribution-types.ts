import type {
    ContributionDraft,
    BoundaryReview,
    EvidenceReview,
    EvidenceVersion
} from "@/domain/index.js";
import type { TurnSubmissionV1 } from "./types.js";

export type ContributionPhaseV1 =
    "preparing" | "boundary_review" | "returned" | "captain_action" | "published" | "cancelled";

export type EvidenceVerdictV1 =
    "supports" | "partially_supports" | "does_not_support" | "unverifiable";

export interface EvidenceMaterialV1 {
    title: string;
    kind: "web" | "document" | "data" | "experiment" | "code" | "interview";
    source: string;
    sourceDate: string;
    collectedAt: string;
    locator: string;
    observation: string;
    methodAndConditions: string;
    limitations: string;
    dependencies: string;
    material:
        { kind: "text"; text: string } | { kind: "reference"; uri: string; sourceVersion: string };
    code?: {
        repository: string;
        revision: string;
        pathsAndSymbols: string;
        patchEvidenceKeys: readonly string[];
        validation: "static_only" | "executed";
        reproduction: string;
        expected: string;
        observed: string;
        notCovered: string;
    };
}

export interface EvidenceCitationV1 {
    evidenceKey: string;
    claim: string;
    locator: string;
    inference: string;
}

export type ContributionBodyV1 = Omit<
    TurnSubmissionV1,
    | "protocolVersion"
    | "meetingId"
    | "turnId"
    | "stepId"
    | "attemptId"
    | "deliveryId"
    | "agendaItemId"
>;

export type ContributionCommandV1 =
    | (ContributionWriteBaseV1 & {
          action: "assign";
          participantId: string;
          agendaItemId: string;
          instruction: string;
          targetIds: readonly string[];
          requiredForCompletion: boolean;
          requiresEvidenceReview: boolean;
      })
    | (ContributionWriteBaseV1 & {
          action: "save_evidence";
          contributionId: string;
          generation: number;
          evidenceId?: string;
          expectedEvidenceRevision: number;
          material: EvidenceMaterialV1;
      })
    | (ContributionWriteBaseV1 & {
          action: "submit";
          contributionId: string;
          generation: number;
          expectedDraftRevision: number;
          basedOnSeq: number;
          body: ContributionBodyV1;
          citations: readonly EvidenceCitationV1[];
      })
    | (ContributionWriteBaseV1 & {
          action: "boundary_review";
          contributionId: string;
          generation: number;
          draftRevision: number;
          decision: "approve" | "return";
          reason: string;
          checkedThroughSeq: number;
      })
    | (ContributionWriteBaseV1 & {
          action: "evidence_review";
          contributionId: string;
          generation: number;
          draftRevision: number;
          reviews: readonly {
              evidenceKey: string;
              claim: string;
              verdict: EvidenceVerdictV1;
              method: string;
              result: string;
              limitations: string;
          }[];
      })
    | (ContributionWriteBaseV1 & {
          action: "retry" | "cancel";
          contributionId: string;
          generation: number;
          reason: string;
      })
    | (ContributionWriteBaseV1 & { action: "notify_manager"; reason: string });

export interface ContributionWriteBaseV1 {
    protocolVersion: 1;
    meetingId: string;
    requestId: string;
    expectedMeetingVersion: number;
}

export interface ReadContributionInputV1 {
    protocolVersion: 1;
    meetingId: string;
    contributionId: string;
    evidenceKey?: string;
    draftRevision?: number;
}

export interface ContributionSummaryV1 {
    id: string;
    participantId: string;
    agendaItemId: string;
    phase: ContributionPhaseV1;
    generation: number;
    currentDraftRevision: number;
    requiredForCompletion: boolean;
    requiresEvidenceReview: boolean;
    reviewStatus: "not_required" | "pending" | "complete" | "captain_action";
    deadlineAt: number;
    messageId?: string;
}
export interface ReadContributionResultV1 {
    task: ContributionSummaryV1;
    drafts: readonly ContributionDraftV1[];
    boundaryReviews: readonly BoundaryReviewV1[];
    evidenceReviews: readonly EvidenceReviewV1[];
    evidence?: EvidenceVersionV1;
}

export type ContributionDraftV1 = ContributionDraft;
export type BoundaryReviewV1 = BoundaryReview;
export type EvidenceReviewV1 = EvidenceReview;
export type EvidenceVersionV1 = EvidenceVersion;

export type ContributionResultV1 =
    | { contributionId: string; generation: number; phase: ContributionPhaseV1 }
    | {
          contributionId: string;
          generation: number;
          phase: ContributionPhaseV1;
          evidenceKey: string;
      }
    | {
          contributionId: string;
          generation: number;
          phase: ContributionPhaseV1;
          draftRevision: number;
      }
    | {
          contributionId: string;
          generation: number;
          phase: ContributionPhaseV1;
          draftRevision: number;
          messageId: string;
      }
    | { managerNoticeSeq: number };
