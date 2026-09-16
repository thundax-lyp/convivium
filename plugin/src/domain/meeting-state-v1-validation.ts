import type { MeetingState, OpaqueId } from "./meeting-state-v1.js";

export type MeetingStateValidationResultV1 =
    | { kind: "valid"; state: MeetingState }
    | { kind: "invalid"; code: "INVALID_ARGUMENT"; path: string };

type RecordValue = Record<string, unknown>;

const lifecycleStatuses = [
    "preparing",
    "running",
    "paused",
    "converging",
    "ending",
    "terminal",
    "archiving",
    "archived"
] as const;
const roles = ["captain", "manager", "contributor", "evidence_reviewer"] as const;
const targetStatuses = ["pending", "satisfied", "unsatisfied", "violated"] as const;
const agendaStatuses = ["pending", "active", "blocked", "completed", "deferred", "closed"] as const;
const riskLevels = ["low", "medium", "high"] as const;
const issueClassifications = [
    "blocking",
    "follow_up",
    "pending_discussion",
    "accepted_risk",
    "out_of_scope"
] as const;
const issueStatuses = ["open", "resolved", "deferred", "out_of_scope"] as const;
const outcomes = ["completed", "partial", "no_consensus", "cancelled", "failed"] as const;

function record(value: unknown): value is RecordValue {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function own(value: RecordValue, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}
function fail(path: string): MeetingStateValidationResultV1 {
    return { kind: "invalid", code: "INVALID_ARGUMENT", path };
}
function id(value: unknown): value is OpaqueId {
    return typeof value === "string" && value.trim().length > 0;
}
function text(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
function epoch(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function integer(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
    return typeof value === "string" && values.includes(value as T);
}
function array(value: unknown): value is readonly unknown[] {
    return Array.isArray(value);
}
function ids(value: unknown, path: string): string | undefined {
    if (!array(value)) return path;
    for (let i = 0; i < value.length; i++) if (!id(value[i])) return `${path}[${i}]`;
    return undefined;
}
function required(value: RecordValue, key: string, path: string): string | undefined {
    return own(value, key) && value[key] !== null && value[key] !== undefined ? undefined : path;
}
function optional(
    value: RecordValue,
    key: string,
    path: string,
    check: (v: unknown) => boolean
): string | undefined {
    if (!own(value, key)) return undefined;
    return value[key] === null || value[key] === undefined || !check(value[key]) ? path : undefined;
}
function checkObjective(value: unknown, path: string): string | undefined {
    if (!record(value)) return path;
    for (const key of ["id", "text", "status"] as const) {
        const p = required(value, key, `${path}.${key}`);
        if (p) return p;
    }
    if (!id(value.id)) return `${path}.id`;
    if (!text(value.text)) return `${path}.text`;
    if (!oneOf(value.status, targetStatuses)) return `${path}.status`;
    return undefined;
}

export function validateMeetingStateV1(value: unknown): MeetingStateValidationResultV1 {
    if (!record(value)) return fail("$");
    const rootRequired = [
        "id",
        "version",
        "createdAt",
        "updatedAt",
        "objective",
        "lifecycle",
        "identities",
        "agenda",
        "agendaCandidates",
        "rounds",
        "contributions",
        "completionDeclarations",
        "evidencePackages",
        "registrations",
        "reviews",
        "reviewDeliveries",
        "publications",
        "messages",
        "proposals",
        "positions",
        "decisionCandidates",
        "decisions",
        "questions",
        "issues",
        "riskDispositions",
        "tasks",
        "managerPlans",
        "privateMails",
        "completionFacts",
        "limits"
    ] as const;
    for (const key of rootRequired) {
        const p = required(value, key, `$.${key}`);
        if (p) return fail(p);
    }
    if (!id(value.id)) return fail("$.id");
    if (!integer(value.version)) return fail("$.version");
    if (!epoch(value.createdAt)) return fail("$.createdAt");
    if (!epoch(value.updatedAt)) return fail("$.updatedAt");
    if (optional(value, "continuation", "$.continuation", record)) return fail("$.continuation");
    const objective = value.objective;
    if (!record(objective)) return fail("$.objective");
    for (const key of [
        "statement",
        "requiredOutputs",
        "acceptanceCriteria",
        "hardConstraints",
        "acceptableRiskLevel"
    ] as const) {
        const p = required(objective, key, `$.objective.${key}`);
        if (p) return fail(p);
    }
    if (!text(objective.statement)) return fail("$.objective.statement");
    if (!oneOf(objective.acceptableRiskLevel, riskLevels))
        return fail("$.objective.acceptableRiskLevel");
    for (const key of ["requiredOutputs", "acceptanceCriteria", "hardConstraints"] as const) {
        if (!array(objective[key])) return fail(`$.objective.${key}`);
        for (let i = 0; i < objective[key].length; i++) {
            const p = checkObjective(objective[key][i], `$.objective.${key}[${i}]`);
            if (p) return fail(p);
        }
    }
    const lifecycle = value.lifecycle;
    if (!record(lifecycle)) return fail("$.lifecycle");
    for (const key of ["status", "changedAt", "changedBy"] as const) {
        const p = required(lifecycle, key, `$.lifecycle.${key}`);
        if (p) return fail(p);
    }
    if (!oneOf(lifecycle.status, lifecycleStatuses)) return fail("$.lifecycle.status");
    if (!epoch(lifecycle.changedAt)) return fail("$.lifecycle.changedAt");
    if (!id(lifecycle.changedBy)) return fail("$.lifecycle.changedBy");
    if (optional(lifecycle, "reason", "$.lifecycle.reason", text))
        return fail("$.lifecycle.reason");
    if (!array(value.identities)) return fail("$.identities");
    for (let i = 0; i < value.identities.length; i++) {
        const item = value.identities[i];
        const path = `$.identities[${i}]`;
        if (!record(item)) return fail(path);
        for (const key of [
            "id",
            "displayName",
            "roles",
            "agendaResponsibilityIds",
            "reviewResponsibilityIds",
            "riskAuthority",
            "required"
        ] as const) {
            const p = required(item, key, `${path}.${key}`);
            if (p) return fail(p);
        }
        if (!id(item.id)) return fail(`${path}.id`);
        if (!text(item.displayName)) return fail(`${path}.displayName`);
        if (!array(item.roles)) return fail(`${path}.roles`);
        for (let j = 0; j < item.roles.length; j++)
            if (!oneOf(item.roles[j], roles)) return fail(`${path}.roles[${j}]`);
        const ap = ids(item.agendaResponsibilityIds, `${path}.agendaResponsibilityIds`);
        if (ap) return fail(ap);
        const rp = ids(item.reviewResponsibilityIds, `${path}.reviewResponsibilityIds`);
        if (rp) return fail(rp);
        if (typeof item.riskAuthority !== "boolean") return fail(`${path}.riskAuthority`);
        if (typeof item.required !== "boolean") return fail(`${path}.required`);
        if (optional(item, "definitionId", `${path}.definitionId`, id))
            return fail(`${path}.definitionId`);
        if (
            optional(
                item,
                "definitionVersion",
                `${path}.definitionVersion`,
                (v) => typeof v === "string"
            )
        )
            return fail(`${path}.definitionVersion`);
    }
    if (!array(value.agenda)) return fail("$.agenda");
    for (let i = 0; i < value.agenda.length; i++) {
        const item = value.agenda[i];
        const path = `$.agenda[${i}]`;
        if (!record(item)) return fail(path);
        for (const key of [
            "id",
            "title",
            "question",
            "status",
            "requiredOutputIds",
            "requiredReviewerIds"
        ] as const) {
            const p = required(item, key, `${path}.${key}`);
            if (p) return fail(p);
        }
        if (!id(item.id)) return fail(`${path}.id`);
        if (!text(item.title)) return fail(`${path}.title`);
        if (!text(item.question)) return fail(`${path}.question`);
        if (!oneOf(item.status, agendaStatuses)) return fail(`${path}.status`);
        const op = ids(item.requiredOutputIds, `${path}.requiredOutputIds`);
        if (op) return fail(op);
        const rp = ids(item.requiredReviewerIds, `${path}.requiredReviewerIds`);
        if (rp) return fail(rp);
        if (optional(item, "ownerId", `${path}.ownerId`, id)) return fail(`${path}.ownerId`);
    }
    const rootArrays = [
        "agendaCandidates",
        "rounds",
        "contributions",
        "completionDeclarations",
        "evidencePackages",
        "registrations",
        "reviews",
        "reviewDeliveries",
        "publications",
        "messages",
        "proposals",
        "positions",
        "decisionCandidates",
        "decisions",
        "questions",
        "issues",
        "riskDispositions",
        "tasks",
        "managerPlans",
        "privateMails",
        "completionFacts"
    ] as const;
    for (const key of rootArrays) if (!array(value[key])) return fail(`$.${key}`);
    if (!record(value.limits)) return fail("$.limits");
    for (const key of [
        "maxFormalMessages",
        "maxDurationMs",
        "taskDeadlineMs",
        "reviewDeadlineMs",
        "responseDeadlineMs"
    ] as const) {
        const p = required(value.limits, key, `$.limits.${key}`);
        if (p) return fail(p);
        if (!integer(value.limits[key])) return fail(`$.limits.${key}`);
    }
    if (value.limits.responseDeadlineMs !== 60000) return fail("$.limits.responseDeadlineMs");
    const issues = value.issues as readonly unknown[];
    for (let i = 0; i < issues.length; i++) {
        const item = issues[i];
        const path = `$.issues[${i}]`;
        if (!record(item)) return fail(path);
        for (const key of [
            "id",
            "agendaId",
            "description",
            "riskLevel",
            "classification",
            "affectedOutputIds",
            "affectedCriterionIds",
            "affectedConstraintIds",
            "requiredReviewerIds",
            "blocking",
            "status",
            "rationale"
        ] as const) {
            const p = required(item, key, `${path}.${key}`);
            if (p) return fail(p);
        }
        if (!id(item.id) || !id(item.agendaId))
            return fail(!id(item.id) ? `${path}.id` : `${path}.agendaId`);
        if (!text(item.description)) return fail(`${path}.description`);
        if (!oneOf(item.riskLevel, riskLevels)) return fail(`${path}.riskLevel`);
        if (!oneOf(item.classification, issueClassifications))
            return fail(`${path}.classification`);
        for (const key of [
            "affectedOutputIds",
            "affectedCriterionIds",
            "affectedConstraintIds",
            "requiredReviewerIds"
        ] as const) {
            const p = ids(item[key], `${path}.${key}`);
            if (p) return fail(p);
        }
        if (typeof item.blocking !== "boolean") return fail(`${path}.blocking`);
        if (!oneOf(item.status, issueStatuses)) return fail(`${path}.status`);
        if (!text(item.rationale)) return fail(`${path}.rationale`);
    }
    if (own(value, "termination")) {
        const item = value.termination;
        const path = "$.termination";
        if (!record(item)) return fail(path);
        for (const key of [
            "id",
            "outcome",
            "reason",
            "endedAt",
            "decisionIds",
            "completionFactIds",
            "unresolvedQuestionIds",
            "unresolvedIssueIds",
            "unclosedContributionIds"
        ] as const) {
            const p = required(item, key, `${path}.${key}`);
            if (p) return fail(p);
        }
        if (!id(item.id)) return fail(`${path}.id`);
        if (!oneOf(item.outcome, outcomes)) return fail(`${path}.outcome`);
        if (!text(item.reason)) return fail(`${path}.reason`);
        if (!epoch(item.endedAt)) return fail(`${path}.endedAt`);
        for (const key of [
            "decisionIds",
            "completionFactIds",
            "unresolvedQuestionIds",
            "unresolvedIssueIds",
            "unclosedContributionIds"
        ] as const) {
            const p = ids(item[key], `${path}.${key}`);
            if (p) return fail(p);
        }
    }
    return { kind: "valid", state: value as unknown as MeetingState };
}
