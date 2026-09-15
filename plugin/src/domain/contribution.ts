import { DomainError } from "./errors.js";
import type { MeetingState, SpeakerSubmissionContext } from "./model.js";
import type { DomainCompletionClaims } from "./completion.js";
import type {
    SubmittedAgendaCandidateInput,
    SubmittedDecisionCandidateInput,
    SubmittedIssueInput,
    SubmittedPositionInput,
    SubmittedProposalInput,
    SubmittedQuestionInput
} from "./transitions/types.js";

import { isContributionState } from "./contribution-validation.js";
export { isContributionState } from "./contribution-validation.js";

export type ContributionPhase =
    "preparing" | "boundary_review" | "returned" | "captain_action" | "published" | "cancelled";

export type EvidenceVerdict =
    "supports" | "partially_supports" | "does_not_support" | "unverifiable";

export interface EvidenceMaterial {
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

export interface EvidenceCitation {
    evidenceKey: string;
    claim: string;
    locator: string;
    inference: string;
}

export interface EvidenceVersion extends EvidenceMaterial {
    evidenceId: string;
    revision: number;
    key: string;
    submittedBy: string;
    submittedAt: number;
}

export interface ContributionClaims {
    questions: readonly SubmittedQuestionInput[];
    issues: readonly SubmittedIssueInput[];
    proposals: readonly SubmittedProposalInput[];
    positions: readonly SubmittedPositionInput[];
    agendaCandidates: readonly SubmittedAgendaCandidateInput[];
    decisionCandidates: readonly SubmittedDecisionCandidateInput[];
    completion?: DomainCompletionClaims;
}

export interface ContributionDraft {
    revision: number;
    basedOnSeq: number;
    submittedAt: number;
    message: SpeakerSubmissionContext["message"];
    claims: ContributionClaims;
    citations: readonly EvidenceCitation[];
}

export interface BoundaryReview {
    draftRevision: number;
    decision: "approve" | "return";
    reason: string;
    checkedThroughSeq: number;
    actor: string;
    reviewedAt: number;
}

export interface EvidenceReview {
    draftRevision: number;
    evidenceKey: string;
    claim: string;
    verdict: EvidenceVerdict;
    method: string;
    result: string;
    limitations: string;
    actor: string;
    reviewedAt: number;
}

export interface ContributionTask {
    id: string;
    participantId: string;
    agendaItemId: string;
    instruction: string;
    targetIds: readonly string[];
    requiredForCompletion: boolean;
    requiresEvidenceReview: boolean;
    generation: number;
    phase: ContributionPhase;
    basedOnSeq: number;
    deadlineAt: number;
    pausedRemainingMs?: number;
    createdAt: number;
    updatedAt: number;
    currentDraftRevision: number;
    returnCount: number;
    drafts: Readonly<Record<string, ContributionDraft>>;
    boundaryReviews: readonly BoundaryReview[];
    evidenceReviews: readonly EvidenceReview[];
    reviewStatus: "not_required" | "pending" | "complete" | "captain_action";
    messageId?: string;
    reason?: string;
}

export interface ContributionState {
    schemaVersion: 1;
    reviewerId: string;
    managerNoticeSeq: number;
    managerDeadlineAt: number;
    managerPausedRemainingMs?: number;
    tasks: Readonly<Record<string, ContributionTask>>;
    evidence: Readonly<Record<string, EvidenceVersion>>;
}

export type ContributionActor =
    | { kind: "manager" | "captain" | "local_host" | "runtime" }
    | { kind: "participant"; participantId: string };
export type DomainContributionCommand =
    | {
          action: "assign";
          participantId: string;
          agendaItemId: string;
          instruction: string;
          targetIds: readonly string[];
          requiredForCompletion: boolean;
          requiresEvidenceReview: boolean;
      }
    | {
          action: "save_evidence";
          contributionId: string;
          generation: number;
          evidenceId?: string;
          expectedEvidenceRevision: number;
          material: EvidenceMaterial;
      }
    | {
          action: "submit";
          contributionId: string;
          generation: number;
          expectedDraftRevision: number;
          draft: ContributionDraft;
      }
    | {
          action: "boundary_review";
          contributionId: string;
          generation: number;
          draftRevision: number;
          decision: "approve" | "return";
          reason: string;
          checkedThroughSeq: number;
      }
    | {
          action: "evidence_review";
          contributionId: string;
          generation: number;
          draftRevision: number;
          reviews: readonly {
              evidenceKey: string;
              claim: string;
              verdict: EvidenceVerdict;
              method: string;
              result: string;
              limitations: string;
          }[];
      }
    | {
          action: "retry" | "cancel";
          contributionId: string;
          generation: number;
          reason: string;
      }
    | {
          action: "notify_manager";
          reason: string;
      };

export function createContributionState(reviewerId: string, now: number): ContributionState {
    return {
        schemaVersion: 1,
        reviewerId,
        managerNoticeSeq: 0,
        managerDeadlineAt: now + 600_000,
        tasks: {},
        evidence: {}
    };
}

export function assertContributionEvidenceMessages(
    state: MeetingState,
    messageIds: readonly string[]
): void {
    if (state.contributions === undefined) return;
    if (messageIds.length === 0)
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "Contribution completion claims require supported evidence messages."
        );
    for (const messageId of messageIds) {
        const message = state.transcript.find((candidate) => candidate.id === messageId);
        const task =
            message?.contributionId === undefined
                ? undefined
                : state.contributions.tasks[message.contributionId];
        const draft =
            task === undefined || message?.contributionRevision === undefined
                ? undefined
                : task.drafts[String(message.contributionRevision)];
        if (
            message === undefined ||
            task === undefined ||
            draft === undefined ||
            draft.citations.length === 0 ||
            !draft.citations.every((citation) =>
                task.evidenceReviews.some(
                    (review) =>
                        review.draftRevision === draft.revision &&
                        review.evidenceKey === citation.evidenceKey &&
                        review.claim === citation.claim &&
                        review.verdict === "supports"
                )
            )
        )
            throw new DomainError(
                "INVALID_STATE_TRANSITION",
                "Contribution completion claims require supported evidence messages."
            );
    }
}

export function contributionWorkComplete(state: MeetingState): boolean {
    if (state.contributions === undefined) return true;
    try {
        for (const fact of state.completionFacts) {
            const isPositiveFact =
                (fact.kind === "output_evidence" || fact.kind === "criterion_evidence") &&
                fact.result === "supported";
            const isSupportedResolution =
                fact.kind === "agenda_resolution" && fact.result === "resolved";
            const isApprovedReview = fact.kind === "review" && fact.result === "approved";
            const isAcceptedDecision =
                fact.kind === "decision_acceptance" && fact.result === "accepted";
            if (
                fact.status !== "active" ||
                !(isPositiveFact || isSupportedResolution || isApprovedReview || isAcceptedDecision)
            )
                continue;
            assertContributionEvidenceMessages(state, fact.evidenceMessageIds);
        }
        return Object.values(state.contributions.tasks).every(
            (task) =>
                !task.requiredForCompletion ||
                (task.phase === "published" &&
                    (!task.requiresEvidenceReview || task.reviewStatus === "complete"))
        );
    } catch {
        return false;
    }
}

export function contributionReferencesBelongToMeeting(state: MeetingState): boolean {
    const contribution = state.contributions;
    if (contribution === undefined) return true;
    if (!isContributionState(contribution)) return false;
    try {
        assertContributionCapacity(state);
    } catch (error) {
        if (error instanceof DomainError) return false;
        throw error;
    }
    const participants = new Set(state.participants.map((participant) => participant.id));
    const agenda = new Set(state.agenda.map((item) => item.id));
    if (!participants.has(contribution.reviewerId)) return false;
    for (const evidence of Object.values(contribution.evidence)) {
        if (!participants.has(evidence.submittedBy)) return false;
        if (
            evidence.code?.patchEvidenceKeys.some((key) => {
                const dependency = contribution.evidence[key];
                return (
                    dependency === undefined ||
                    key === evidence.key ||
                    dependency.submittedAt > evidence.submittedAt
                );
            })
        )
            return false;
    }
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const acyclic = (key: string): boolean => {
        if (visiting.has(key)) return false;
        if (visited.has(key)) return true;
        visiting.add(key);
        if (
            contribution.evidence[key]!.code?.patchEvidenceKeys.some(
                (dependency) => !acyclic(dependency)
            )
        )
            return false;
        visiting.delete(key);
        visited.add(key);
        return true;
    };
    if (Object.keys(contribution.evidence).some((key) => !acyclic(key))) return false;
    for (const task of Object.values(contribution.tasks)) {
        if (!participants.has(task.participantId) || !agenda.has(task.agendaItemId)) return false;
        if (
            task.targetIds.some(
                (targetId) =>
                    !state.objectiveContract.requiredOutputs.some(
                        (output) => output.id === targetId
                    ) &&
                    !state.objectiveContract.acceptanceCriteria.some(
                        (criterion) => criterion.id === targetId
                    )
            )
        )
            return false;
        if (
            Object.values(task.drafts).some((draft) =>
                draft.citations.some(
                    (citation) => contribution.evidence[citation.evidenceKey] === undefined
                )
            )
        )
            return false;
        if (
            task.boundaryReviews.some(
                (review) => review.draftRevision > task.currentDraftRevision
            ) ||
            task.evidenceReviews.some(
                (review) =>
                    review.draftRevision > task.currentDraftRevision ||
                    contribution.evidence[review.evidenceKey] === undefined
            )
        )
            return false;
    }
    return true;
}

export function assertContributionCapacity(state: MeetingState): void {
    const contribution = state.contributions;
    if (contribution === undefined) return;
    const {
        contributions: _contributions,
        archive: _archive,
        termination,
        pauseReason,
        pausedAt: _pausedAt,
        pausedBy: _pausedBy,
        pausedFromStatus: _pausedFromStatus,
        waitState,
        version: _version,
        updatedAt: _updatedAt,
        eventSeq: _eventSeq,
        status: _status,
        ...base
    } = state;
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
    if (
        bytes(base) > 24_576 ||
        (termination !== undefined && bytes(termination) > 4096) ||
        (waitState !== undefined && bytes(waitState) > 4096) ||
        (pauseReason !== undefined && pauseReason.length > 2048) ||
        Object.values(contribution.evidence).some((value) => {
            const {
                evidenceId: _id,
                revision: _revision,
                key: _key,
                submittedBy: _by,
                submittedAt: _at,
                ...material
            } = value;
            return bytes(material) > 8192;
        }) ||
        Object.keys(contribution.tasks).length > 64 ||
        Object.keys(contribution.evidence).length > 128 ||
        Object.values(contribution.tasks).reduce(
            (count, task) => count + Object.keys(task.drafts).length,
            0
        ) > 128 ||
        bytes(contribution) > 2_097_152
    ) {
        throw new DomainError("INVALID_ARGUMENT", "Contribution state exceeds its fixed capacity.");
    }
}
