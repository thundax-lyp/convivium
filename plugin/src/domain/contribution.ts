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

const phases: readonly ContributionPhase[] = [
    "preparing",
    "boundary_review",
    "returned",
    "captain_action",
    "published",
    "cancelled"
];
const reviewStatuses = ["not_required", "pending", "complete", "captain_action"] as const;
const evidenceVerdicts: readonly EvidenceVerdict[] = [
    "supports",
    "partially_supports",
    "does_not_support",
    "unverifiable"
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== "";
}

function isTimestamp(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every(isString) && new Set(value).size === value.length;
}

function hasOnlyKeys(
    value: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[] = []
): boolean {
    const allowed = new Set([...required, ...optional]);
    return (
        required.every((key) => Object.hasOwn(value, key)) &&
        Object.keys(value).every((key) => allowed.has(key))
    );
}

function isEvidenceMaterial(value: unknown, allowVersionFields = false): value is EvidenceMaterial {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(
            value,
            [
                "title",
                "kind",
                "source",
                "sourceDate",
                "collectedAt",
                "locator",
                "observation",
                "methodAndConditions",
                "limitations",
                "dependencies",
                "material"
            ],
            [
                "code",
                ...(allowVersionFields
                    ? ["evidenceId", "revision", "key", "submittedBy", "submittedAt"]
                    : [])
            ]
        ) ||
        !["web", "document", "data", "experiment", "code", "interview"].includes(
            value.kind as string
        ) ||
        ![
            value.title,
            value.source,
            value.sourceDate,
            value.collectedAt,
            value.locator,
            value.observation,
            value.methodAndConditions,
            value.limitations,
            value.dependencies
        ].every(isString) ||
        !isRecord(value.material) ||
        !(
            (value.material.kind === "text" &&
                isString(value.material.text) &&
                hasOnlyKeys(value.material, ["kind", "text"])) ||
            (value.material.kind === "reference" &&
                isString(value.material.uri) &&
                isString(value.material.sourceVersion) &&
                hasOnlyKeys(value.material, ["kind", "uri", "sourceVersion"]))
        )
    )
        return false;
    if (value.kind === "code") {
        if (
            !isRecord(value.code) ||
            !hasOnlyKeys(value.code, [
                "repository",
                "revision",
                "pathsAndSymbols",
                "patchEvidenceKeys",
                "validation",
                "reproduction",
                "expected",
                "observed",
                "notCovered"
            ])
        )
            return false;
        return (
            [
                value.code.repository,
                value.code.revision,
                value.code.pathsAndSymbols,
                value.code.reproduction,
                value.code.expected,
                value.code.observed,
                value.code.notCovered
            ].every(isString) &&
            isStringArray(value.code.patchEvidenceKeys) &&
            ["static_only", "executed"].includes(value.code.validation as string)
        );
    }
    return value.code === undefined;
}

function isEvidenceVersion(value: unknown, key: string): value is EvidenceVersion {
    return (
        isRecord(value) &&
        hasOnlyKeys(
            value,
            [
                "evidenceId",
                "revision",
                "key",
                "submittedBy",
                "submittedAt",
                "title",
                "kind",
                "source",
                "sourceDate",
                "collectedAt",
                "locator",
                "observation",
                "methodAndConditions",
                "limitations",
                "dependencies",
                "material"
            ],
            ["code"]
        ) &&
        isString(value.evidenceId) &&
        isNonNegativeInteger(value.revision) &&
        value.revision >= 1 &&
        value.key === key &&
        key === `${value.evidenceId}:${value.revision}` &&
        isString(value.submittedBy) &&
        isTimestamp(value.submittedAt) &&
        isEvidenceMaterial(value, true)
    );
}

function isCitation(value: unknown): value is EvidenceCitation {
    return (
        isRecord(value) &&
        hasOnlyKeys(value, ["evidenceKey", "claim", "locator", "inference"]) &&
        [value.evidenceKey, value.claim, value.locator, value.inference].every(isString)
    );
}

function isDraft(value: unknown, revision: number): value is ContributionDraft {
    return (
        isRecord(value) &&
        hasOnlyKeys(value, [
            "revision",
            "basedOnSeq",
            "submittedAt",
            "message",
            "claims",
            "citations"
        ]) &&
        value.revision === revision &&
        isNonNegativeInteger(value.basedOnSeq) &&
        isTimestamp(value.submittedAt) &&
        isRecord(value.message) &&
        isRecord(value.claims) &&
        Array.isArray(value.citations) &&
        value.citations.every(isCitation) &&
        new Set(value.citations.map((citation) => `${citation.evidenceKey}\0${citation.claim}`))
            .size === value.citations.length
    );
}

function isBoundaryReview(value: unknown): value is BoundaryReview {
    return (
        isRecord(value) &&
        hasOnlyKeys(value, [
            "draftRevision",
            "decision",
            "reason",
            "checkedThroughSeq",
            "actor",
            "reviewedAt"
        ]) &&
        isNonNegativeInteger(value.draftRevision) &&
        value.draftRevision >= 1 &&
        ["approve", "return"].includes(value.decision as string) &&
        isString(value.reason) &&
        isNonNegativeInteger(value.checkedThroughSeq) &&
        isString(value.actor) &&
        isTimestamp(value.reviewedAt)
    );
}

function isEvidenceReview(value: unknown): value is EvidenceReview {
    return (
        isRecord(value) &&
        hasOnlyKeys(value, [
            "draftRevision",
            "evidenceKey",
            "claim",
            "verdict",
            "method",
            "result",
            "limitations",
            "actor",
            "reviewedAt"
        ]) &&
        isNonNegativeInteger(value.draftRevision) &&
        value.draftRevision >= 1 &&
        isString(value.evidenceKey) &&
        isString(value.claim) &&
        evidenceVerdicts.includes(value.verdict as EvidenceVerdict) &&
        isString(value.method) &&
        isString(value.result) &&
        isString(value.limitations) &&
        isString(value.actor) &&
        isTimestamp(value.reviewedAt)
    );
}

function isTask(value: unknown, key: string): value is ContributionTask {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(
            value,
            [
                "id",
                "participantId",
                "agendaItemId",
                "instruction",
                "targetIds",
                "requiredForCompletion",
                "requiresEvidenceReview",
                "generation",
                "phase",
                "basedOnSeq",
                "deadlineAt",
                "createdAt",
                "updatedAt",
                "currentDraftRevision",
                "returnCount",
                "drafts",
                "boundaryReviews",
                "evidenceReviews",
                "reviewStatus"
            ],
            ["pausedRemainingMs", "messageId", "reason"]
        )
    )
        return false;
    if (!(
        value.id === key &&
        isString(value.id) &&
        isString(value.participantId) &&
        isString(value.agendaItemId) &&
        isString(value.instruction) &&
        isStringArray(value.targetIds) &&
        typeof value.requiredForCompletion === "boolean" &&
        typeof value.requiresEvidenceReview === "boolean" &&
        isNonNegativeInteger(value.generation) &&
        value.generation >= 1 &&
        phases.includes(value.phase as ContributionPhase) &&
        isNonNegativeInteger(value.basedOnSeq) &&
        isTimestamp(value.deadlineAt) &&
        isTimestamp(value.createdAt) &&
        isTimestamp(value.updatedAt) &&
        isNonNegativeInteger(value.currentDraftRevision) &&
        isNonNegativeInteger(value.returnCount) &&
        isRecord(value.drafts) &&
        Array.isArray(value.boundaryReviews) &&
        Array.isArray(value.evidenceReviews) &&
        reviewStatuses.includes(value.reviewStatus as ContributionTask["reviewStatus"])
    ))
        return false;
    if (value.pausedRemainingMs !== undefined && !isNonNegativeInteger(value.pausedRemainingMs))
        return false;
    if (value.messageId !== undefined && !isString(value.messageId)) return false;
    if (value.reason !== undefined && !isString(value.reason)) return false;
    const drafts = value.drafts as Record<string, unknown>;
    const revisions = Object.keys(drafts)
        .map(Number)
        .sort((left, right) => left - right);
    return (
        revisions.length === value.currentDraftRevision &&
        revisions.every(
            (revision, index) =>
                Number.isSafeInteger(revision) &&
                revision === index + 1 &&
                isDraft(drafts[String(revision)], revision)
        ) &&
        value.boundaryReviews.every(isBoundaryReview) &&
        value.evidenceReviews.every(isEvidenceReview)
    );
}

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

export function isContributionState(value: unknown): value is ContributionState {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(
            value,
            [
                "schemaVersion",
                "reviewerId",
                "managerNoticeSeq",
                "managerDeadlineAt",
                "tasks",
                "evidence"
            ],
            ["managerPausedRemainingMs"]
        )
    )
        return false;
    if (!(
        value.schemaVersion === 1 &&
        isString(value.reviewerId) &&
        isNonNegativeInteger(value.managerNoticeSeq) &&
        isTimestamp(value.managerDeadlineAt) &&
        isRecord(value.tasks) &&
        isRecord(value.evidence)
    ))
        return false;
    if (
        value.managerPausedRemainingMs !== undefined &&
        !isNonNegativeInteger(value.managerPausedRemainingMs)
    )
        return false;
    const evidenceById = new Map<string, number[]>();
    for (const [key, evidence] of Object.entries(value.evidence)) {
        if (!isEvidenceVersion(evidence, key)) return false;
        evidenceById.set(evidence.evidenceId, [
            ...(evidenceById.get(evidence.evidenceId) ?? []),
            evidence.revision
        ]);
    }
    const tasks: ContributionTask[] = [];
    for (const [key, task] of Object.entries(value.tasks)) {
        if (!isTask(task, key)) return false;
        tasks.push(task);
    }
    if (
        [...evidenceById.values()].some((revisions) =>
            revisions
                .sort((left, right) => left - right)
                .some((revision, index) => revision !== index + 1)
        ) ||
        Object.keys(value.evidence).length > 128 ||
        tasks.length > 64 ||
        tasks.reduce((count, task) => count + Object.keys(task.drafts).length, 0) > 128
    )
        return false;
    return true;
}

export function contributionReferencesBelongToMeeting(state: MeetingState): boolean {
    const contribution = state.contributions;
    if (contribution === undefined) return true;
    if (!isContributionState(contribution)) return false;
    const participants = new Set(state.participants.map((participant) => participant.id));
    const agenda = new Set(state.agenda.map((item) => item.id));
    if (!participants.has(contribution.reviewerId)) return false;
    for (const evidence of Object.values(contribution.evidence)) {
        if (!participants.has(evidence.submittedBy)) return false;
    }
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
    if (
        Object.keys(contribution.tasks).length > 64 ||
        Object.keys(contribution.evidence).length > 128 ||
        Object.values(contribution.tasks).reduce(
            (count, task) => count + Object.keys(task.drafts).length,
            0
        ) > 128 ||
        Buffer.byteLength(JSON.stringify(contribution), "utf8") > 2_097_152
    ) {
        throw new DomainError("INVALID_ARGUMENT", "Contribution state exceeds its fixed capacity.");
    }
}
