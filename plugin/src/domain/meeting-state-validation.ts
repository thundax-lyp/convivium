import type {
    AgentRoleDefinitionId,
    AgentEvidenceScope,
    MeetingAgentCatalogSnapshot,
    ManagerCatalogBindingV1,
    MeetingState,
    MeetingMinutesDraft
} from "./model.js";

const roleDefinitionIds: readonly AgentRoleDefinitionId[] = [
    "domain_architect",
    "runtime_engineer",
    "protocol_ui_engineer",
    "verification_reviewer",
    "github_research_analyst",
    "arxiv_research_analyst",
    "web_research_analyst",
    "meeting_scribe"
];
const evidenceScopes: readonly AgentEvidenceScope[] = ["repository", "github", "arxiv", "web"];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return (
        actual.length === expected.length && actual.every((key, index) => key === expected[index])
    );
}

function isStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRoleDefinition(value: unknown): boolean {
    if (
        !isRecord(value) ||
        !hasExactKeys(value, [
            "roleDefinitionId",
            "version",
            "displayName",
            "summary",
            "expertiseTags",
            "evidenceScopes",
            "responsibilities",
            "nonResponsibilities"
        ])
    )
        return false;
    return (
        roleDefinitionIds.includes(value.roleDefinitionId as AgentRoleDefinitionId) &&
        typeof value.version === "string" &&
        typeof value.displayName === "string" &&
        typeof value.summary === "string" &&
        isStringArray(value.expertiseTags) &&
        Array.isArray(value.evidenceScopes) &&
        value.evidenceScopes.every((scope) =>
            evidenceScopes.includes(scope as AgentEvidenceScope)
        ) &&
        isStringArray(value.responsibilities) &&
        isStringArray(value.nonResponsibilities)
    );
}

function isCatalogCandidate(value: unknown): boolean {
    if (
        !isRecord(value) ||
        !hasExactKeys(value, [
            "candidateId",
            "roleDefinitionId",
            "roleDefinitionVersion",
            "sourceMemberName",
            "agentDefinitionId",
            "availability"
        ])
    )
        return false;
    return (
        typeof value.candidateId === "string" &&
        roleDefinitionIds.includes(value.roleDefinitionId as AgentRoleDefinitionId) &&
        typeof value.roleDefinitionVersion === "string" &&
        typeof value.sourceMemberName === "string" &&
        typeof value.agentDefinitionId === "string" &&
        (value.availability === "available" || value.availability === "unavailable")
    );
}

function isCatalogSnapshot(value: unknown): value is MeetingAgentCatalogSnapshot {
    if (
        !isRecord(value) ||
        !hasExactKeys(value, [
            "protocolVersion",
            "catalogId",
            "catalogVersion",
            "teamId",
            "capturedAt",
            "roles",
            "candidates"
        ])
    )
        return false;
    return (
        value.protocolVersion === 1 &&
        typeof value.catalogId === "string" &&
        typeof value.catalogVersion === "string" &&
        typeof value.teamId === "string" &&
        typeof value.capturedAt === "number" &&
        Array.isArray(value.roles) &&
        value.roles.every(isRoleDefinition) &&
        Array.isArray(value.candidates) &&
        value.candidates.every(isCatalogCandidate)
    );
}

function isCatalogBinding(value: unknown): value is ManagerCatalogBindingV1 {
    if (!isRecord(value) || typeof value.kind !== "string") return false;
    if (value.kind === "none") return hasExactKeys(value, ["kind"]);
    return (
        value.kind === "verified" &&
        hasExactKeys(value, ["kind", "snapshot"]) &&
        isCatalogSnapshot(value.snapshot)
    );
}

function isAttendanceRecommendation(value: unknown): boolean {
    if (
        !isRecord(value) ||
        !hasExactKeys(value, [
            "id",
            "candidateId",
            "roleDefinitionId",
            "roleDefinitionVersion",
            "displayName",
            "agentDefinitionId",
            "agendaItemId",
            "rationale",
            "expectedContribution",
            "evidenceGapIds",
            "urgency",
            "recommendedByManagerSessionId",
            "catalogId",
            "catalogVersion",
            "planningAttemptId",
            "status",
            "createdAt",
            ...(value.status === "rejected" ? ["rejection"] : [])
        ])
    )
        return false;
    return (
        typeof value.id === "string" &&
        typeof value.candidateId === "string" &&
        roleDefinitionIds.includes(value.roleDefinitionId as AgentRoleDefinitionId) &&
        typeof value.roleDefinitionVersion === "string" &&
        typeof value.displayName === "string" &&
        typeof value.agentDefinitionId === "string" &&
        typeof value.agendaItemId === "string" &&
        typeof value.rationale === "string" &&
        typeof value.expectedContribution === "string" &&
        isStringArray(value.evidenceGapIds) &&
        (value.urgency === "current_agenda" ||
            value.urgency === "later_agenda" ||
            value.urgency === "follow_up") &&
        typeof value.recommendedByManagerSessionId === "string" &&
        typeof value.catalogId === "string" &&
        typeof value.catalogVersion === "string" &&
        typeof value.planningAttemptId === "string" &&
        (value.status === "pending" ||
            (value.status === "rejected" &&
                isRecord(value.rejection) &&
                hasExactKeys(value.rejection, [
                    "requestId",
                    "actorBinding",
                    "reason",
                    "rejectedAt"
                ]) &&
                typeof value.rejection.requestId === "string" &&
                value.rejection.requestId.trim() !== "" &&
                typeof value.rejection.actorBinding === "string" &&
                value.rejection.actorBinding.startsWith("captain:") &&
                value.rejection.actorBinding.slice(8).trim() !== "" &&
                typeof value.rejection.reason === "string" &&
                value.rejection.reason.trim() !== "" &&
                value.rejection.reason.trim() === value.rejection.reason &&
                typeof value.rejection.rejectedAt === "number" &&
                Number.isFinite(value.rejection.rejectedAt) &&
                value.rejection.rejectedAt >= 0)) &&
        typeof value.createdAt === "number"
    );
}

export function isMeetingMinutesDraft(value: unknown): value is MeetingMinutesDraft {
    if (
        !isRecord(value) ||
        !hasExactKeys(value, ["status", "coverage", "referencedMessageIds"]) ||
        value.status !== "draft" ||
        !isRecord(value.coverage) ||
        !hasExactKeys(value.coverage, ["fromSeq", "throughSeq"])
    )
        return false;
    const { fromSeq, throughSeq } = value.coverage;
    const ids = value.referencedMessageIds;
    return (
        typeof fromSeq === "number" &&
        typeof throughSeq === "number" &&
        Number.isSafeInteger(fromSeq) &&
        Number.isSafeInteger(throughSeq) &&
        fromSeq >= 1 &&
        throughSeq >= fromSeq &&
        isStringArray(ids) &&
        ids.length >= 1 &&
        ids.length <= 64 &&
        new Set(ids).size === ids.length &&
        ids.every((id) => id.length <= 256 && /\S/.test(id))
    );
}

export function isMeetingStateV2(value: unknown): value is MeetingState {
    if (
        !isRecord(value) ||
        value.formatVersion !== 2 ||
        !Array.isArray(value.attendanceRecommendations) ||
        !value.attendanceRecommendations.every(isAttendanceRecommendation)
    )
        return false;
    const archive =
        isRecord(value.archive) && isRecord(value.archive.package)
            ? value.archive.package
            : undefined;
    for (const messages of [value.transcript, archive?.formalTranscript]) {
        if (
            Array.isArray(messages) &&
            messages.some(
                (message) =>
                    isRecord(message) &&
                    Object.prototype.hasOwnProperty.call(message, "minutesDraft") &&
                    !isMeetingMinutesDraft(message.minutesDraft)
            )
        )
            return false;
    }
    if (!isRecord(value.manager)) return false;
    const attempt = value.manager.currentPlanningAttempt;
    return attempt === undefined || (isRecord(attempt) && isCatalogBinding(attempt.catalogBinding));
}
