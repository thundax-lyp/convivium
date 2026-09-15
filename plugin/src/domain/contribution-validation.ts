import type {
    ContributionDraft,
    ContributionPhase,
    ContributionState,
    ContributionTask,
    EvidenceCitation,
    EvidenceMaterial,
    EvidenceVerdict,
    EvidenceVersion,
    BoundaryReview,
    EvidenceReview
} from "./contribution.js";

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
        isString(value.evidenceKey) &&
        value.evidenceKey.length <= 256 &&
        [value.claim, value.locator, value.inference].every(
            (text) => isString(text) && text.length <= 1024
        )
    );
}

function isClaimRecord(
    value: unknown,
    required: readonly string[],
    optional: readonly string[] = [],
    numbers: readonly string[] = [],
    arrays: readonly string[] = [],
    booleans: readonly string[] = []
): boolean {
    return (
        isRecord(value) &&
        hasOnlyKeys(value, required, optional) &&
        Object.entries(value).every(([key, field]) =>
            numbers.includes(key)
                ? isNonNegativeInteger(field)
                : arrays.includes(key)
                  ? isStringArray(field) && new Set(field).size === field.length
                  : booleans.includes(key)
                    ? typeof field === "boolean"
                    : isString(field) && field.length <= 4096
        )
    );
}

function isCompletionClaims(value: unknown): boolean {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(
            value,
            [],
            [
                "outputClaims",
                "criterionClaims",
                "agendaResolution",
                "review",
                "questionResolutions",
                "riskAcceptance"
            ]
        )
    )
        return false;
    for (const key of ["outputClaims", "criterionClaims"]) {
        const items = value[key];
        if (
            items !== undefined &&
            (!Array.isArray(items) ||
                !items.every((v) =>
                    isClaimRecord(
                        v,
                        ["subjectId", "evidenceMessageIds", "taskIds"],
                        [],
                        [],
                        ["evidenceMessageIds", "taskIds"]
                    )
                ))
        )
            return false;
    }
    if (
        value.agendaResolution !== undefined &&
        !isClaimRecord(
            value.agendaResolution,
            ["agendaItemId", "resolution", "evidenceMessageIds"],
            [],
            [],
            ["evidenceMessageIds"]
        )
    )
        return false;
    if (
        value.review !== undefined &&
        (!isClaimRecord(
            value.review,
            ["outputId", "result", "reason", "evidenceMessageIds"],
            [],
            [],
            ["evidenceMessageIds"]
        ) ||
            !isRecord(value.review) ||
            !["approved", "changes_required"].includes(value.review.result as string))
    )
        return false;
    if (
        value.riskAcceptance !== undefined &&
        (!isClaimRecord(
            value.riskAcceptance,
            ["issueId", "decision", "reason", "evidenceMessageIds"],
            [],
            [],
            ["evidenceMessageIds"]
        ) ||
            !isRecord(value.riskAcceptance) ||
            !["accept", "reject"].includes(value.riskAcceptance.decision as string))
    )
        return false;
    return (
        value.questionResolutions === undefined ||
        (Array.isArray(value.questionResolutions) &&
            value.questionResolutions.every((v) =>
                isClaimRecord(v, ["questionId", "answerMessageId"])
            ))
    );
}

function isClaims(value: Record<string, unknown>): boolean {
    const fields = [
        "questions",
        "issues",
        "proposals",
        "positions",
        "agendaCandidates",
        "decisionCandidates"
    ];
    if (
        !hasOnlyKeys(value, fields, ["completion"]) ||
        !fields.every((key) => Array.isArray(value[key]))
    )
        return false;
    const every = (key: string, validate: (v: unknown) => boolean) => {
        const items = value[key];
        return Array.isArray(items) && items.every(validate);
    };
    return (
        every("questions", (v) =>
            isClaimRecord(
                v,
                ["id", "text", "blocking", "createdAt"],
                [
                    "directedTo",
                    "affectedOutputIds",
                    "affectedCriterionIds",
                    "violatedConstraintIds"
                ],
                ["createdAt"],
                ["affectedOutputIds", "affectedCriterionIds", "violatedConstraintIds"],
                ["blocking"]
            )
        ) &&
        every(
            "issues",
            (v) =>
                isClaimRecord(
                    v,
                    [
                        "id",
                        "title",
                        "description",
                        "affectedOutputIds",
                        "affectedCriterionIds",
                        "violatedConstraintIds",
                        "impact",
                        "urgency",
                        "safeDefaultAvailable"
                    ],
                    ["riskLevel"],
                    [],
                    ["affectedOutputIds", "affectedCriterionIds", "violatedConstraintIds"],
                    ["safeDefaultAvailable"]
                ) &&
                isRecord(v) &&
                ["now", "before_release", "later"].includes(v.urgency as string) &&
                (v.riskLevel === undefined ||
                    ["low", "medium", "high"].includes(v.riskLevel as string))
        ) &&
        every("proposals", (v) =>
            isClaimRecord(
                v,
                ["id", "title", "description", "now"],
                ["proposalId", "expectedRevision"],
                ["now", "expectedRevision"]
            )
        ) &&
        every(
            "positions",
            (v) =>
                isClaimRecord(
                    v,
                    ["id", "proposalId", "proposalRevision", "position", "blocking", "now"],
                    ["reason"],
                    ["proposalRevision", "now"],
                    [],
                    ["blocking"]
                ) &&
                isRecord(v) &&
                ["support", "accept", "object", "needs_revision", "abstain"].includes(
                    v.position as string
                )
        ) &&
        every(
            "agendaCandidates",
            (v) =>
                isClaimRecord(
                    v,
                    [
                        "id",
                        "title",
                        "reason",
                        "relationToActiveAgenda",
                        "urgency",
                        "suggestedParticipants",
                        "now"
                    ],
                    [],
                    ["now"],
                    ["suggestedParticipants"]
                ) &&
                isRecord(v) &&
                ["related", "adjacent", "unrelated"].includes(v.relationToActiveAgenda as string) &&
                ["now", "before_release", "later"].includes(v.urgency as string)
        ) &&
        every("decisionCandidates", (v) =>
            isClaimRecord(
                v,
                [
                    "id",
                    "proposalId",
                    "proposalRevision",
                    "statement",
                    "rationale",
                    "sourceMessageId",
                    "agendaItemId",
                    "createdAt"
                ],
                [],
                ["proposalRevision", "createdAt"]
            )
        ) &&
        (value.completion === undefined || isCompletionClaims(value.completion))
    );
}

function isDraftMinutes(value: unknown): boolean {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, ["status", "coverage", "referencedMessageIds"]) ||
        value.status !== "draft" ||
        !isRecord(value.coverage)
    )
        return false;
    return (
        hasOnlyKeys(value.coverage, ["fromSeq", "throughSeq"]) &&
        isNonNegativeInteger(value.coverage.fromSeq) &&
        value.coverage.fromSeq >= 1 &&
        isNonNegativeInteger(value.coverage.throughSeq) &&
        value.coverage.throughSeq >= value.coverage.fromSeq &&
        isStringArray(value.referencedMessageIds) &&
        value.referencedMessageIds.length >= 1 &&
        value.referencedMessageIds.length <= 64 &&
        new Set(value.referencedMessageIds).size === value.referencedMessageIds.length
    );
}

function isDraft(value: unknown, revision: number): value is ContributionDraft {
    if (!isRecord(value) || !isRecord(value.claims)) return false;
    const claims = value.claims;
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
        hasOnlyKeys(
            value.message,
            ["id", "kind", "content", "mentions", "taskIds", "agendaRelation", "createdAt"],
            ["replyTo", "minutesDraft"]
        ) &&
        isString(value.message.id) &&
        isString(value.message.content) &&
        value.message.content.length <= 4096 &&
        [
            "statement",
            "question",
            "proposal",
            "answer",
            "objection",
            "evidence",
            "review",
            "summary",
            "decision"
        ].includes(value.message.kind as string) &&
        ["on_topic", "supporting_context", "new_topic_candidate", "blocking_interrupt"].includes(
            value.message.agendaRelation as string
        ) &&
        isStringArray(value.message.mentions) &&
        isStringArray(value.message.taskIds) &&
        isTimestamp(value.message.createdAt) &&
        (value.message.replyTo === undefined || isString(value.message.replyTo)) &&
        (value.message.minutesDraft === undefined || isDraftMinutes(value.message.minutesDraft)) &&
        isRecord(value.claims) &&
        hasOnlyKeys(
            value.claims,
            [
                "questions",
                "issues",
                "proposals",
                "positions",
                "agendaCandidates",
                "decisionCandidates"
            ],
            ["completion"]
        ) &&
        isClaims(claims) &&
        Array.isArray(value.citations) &&
        value.citations.length <= 8 &&
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
    const evidenceById = new Map<string, { owner: string; revisions: number[] }>();
    for (const [key, evidence] of Object.entries(value.evidence)) {
        if (!isEvidenceVersion(evidence, key)) return false;
        const previous = evidenceById.get(evidence.evidenceId);
        if (previous !== undefined && previous.owner !== evidence.submittedBy) return false;
        evidenceById.set(evidence.evidenceId, {
            owner: evidence.submittedBy,
            revisions: [...(previous?.revisions ?? []), evidence.revision]
        });
    }
    const tasks: ContributionTask[] = [];
    for (const [key, task] of Object.entries(value.tasks)) {
        if (!isTask(task, key)) return false;
        tasks.push(task);
    }
    if (
        [...evidenceById.values()].some(({ revisions }) =>
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
