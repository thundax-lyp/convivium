import { z } from "zod";

const id = z.string().trim().min(1);
const text = z.string().trim().min(1);
const role = z.enum(["captain", "manager", "contributor", "evidence_reviewer"]);
export const MeetingRoleV1Schema = role;
export type MeetingRoleV1 = z.infer<typeof role>;

export const RoleErrorCodeV1Schema = z.enum([
    "INVALID_ARGUMENT",
    "DEFINITION_NOT_FOUND",
    "DEFINITION_VERSION_MISMATCH",
    "CATALOG_NOT_FOUND",
    "CATALOG_STALE",
    "CATALOG_CANDIDATE_MISMATCH",
    "ROLE_NOT_ALLOWED",
    "CAPABILITY_MISSING",
    "PREFLIGHT_EXPIRED",
    "ADMISSION_CONFLICT",
    "SESSION_CREATION_FAILED",
    "OWNERSHIP_CONFLICT",
    "RECOVERY_UNAVAILABLE",
    "INCOMPATIBLE_VERSION"
]);
export type RoleErrorCodeV1 = z.infer<typeof RoleErrorCodeV1Schema>;

const identityFields = {
    candidateId: id,
    definitionId: id,
    definitionVersion: text,
    catalogId: id,
    catalogVersion: text,
    agendaId: id,
    rationale: text,
    expectedContribution: text,
    evidenceGap: text
};
export const RecommendIdentityActionV1Schema = z
    .object({
        kind: z.literal("recommend_identity"),
        ...identityFields,
        decision: z.enum(["admit", "reject"])
    })
    .passthrough();
export const RecordIdentityAdmissionResultActionV1Schema = z
    .object({ kind: z.literal("record_identity_admission_result"), recommendationId: id })
    .passthrough();

export const ManagerCatalogViewV1Schema = z.object({
    catalogId: id,
    catalogVersion: text,
    candidates: z.array(
        z.object({
            candidateId: id,
            definitionId: id,
            definitionVersion: text,
            displayName: text,
            availability: z.enum(["available", "unavailable"]),
            meetingRoles: z.array(role),
            responsibilitySummary: text,
            capabilitySummary: z.array(
                z.object({ kind: z.enum(["preset", "skill", "tool", "mcp"]), label: text })
            ),
            suitability: z.array(z.object({ scope: text, rationale: text }))
        })
    )
});
export const IdentityRecommendationViewV1Schema = z.object({
    id,
    candidateId: id,
    definitionId: id,
    definitionVersion: text,
    agendaId: id,
    decision: z.enum(["admit", "reject"]),
    status: z.enum(["provisioning", "rejected", "active", "failed"]),
    rationale: text,
    expectedContribution: text,
    evidenceGap: text,
    createdAt: z.number().int().nonnegative(),
    resolvedAt: z.number().int().nonnegative().optional(),
    failureCode: RoleErrorCodeV1Schema.optional()
});
export const IdentityViewV1Schema = z.object({
    id,
    displayName: text,
    roles: z.array(role),
    agendaResponsibilityIds: z.array(id),
    reviewResponsibilityIds: z.array(id),
    riskAuthority: z.boolean(),
    required: z.boolean(),
    definitionId: id.optional(),
    definitionVersion: text.optional()
});
