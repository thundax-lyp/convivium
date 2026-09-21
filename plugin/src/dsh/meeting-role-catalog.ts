import { z } from "zod";

const id = z.string().trim().min(1);
const version = z.string().trim().min(1);
const role = z.enum(["captain", "manager", "contributor", "evidence_reviewer"]);
const versionedRef = z.object({ id, version });
const capability = z.object({
    kind: z.enum(["preset", "skill", "tool", "mcp", "model", "sandbox", "approval"]),
    label: z.string().trim().min(1)
});
const candidate = z.object({
    candidateId: id,
    definition: versionedRef,
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    displayName: z.string().trim().min(1),
    availability: z.enum(["available", "unavailable"]),
    meetingRoles: z.array(role),
    responsibilitySummary: z.string().trim().min(1),
    capabilitySummary: z.array(capability),
    suitability: z.array(
        z.object({ scope: z.string().trim().min(1), rationale: z.string().trim().min(1) })
    )
});
export type VersionedRef = z.infer<typeof versionedRef>;
export type RoleErrorV1 = { code: string; message: string; targetId?: string };
export type CapabilityKind = z.infer<typeof capability>["kind"];
export type CapabilitySummary = z.infer<typeof capability>;
export type SuitabilityV1 = { scope: string; rationale: string };
export type CatalogCandidate = z.infer<typeof candidate>;
export interface MeetingAgentCatalog {
    protocolVersion: 1;
    meetingId: string;
    catalogId: string;
    catalogVersion: string;
    generatedAt: number;
    candidates: CatalogCandidate[];
}
export interface ReadCatalogRequest {
    protocolVersion: 1;
    meetingId: string;
    captainSessionId: string;
    managerSessionId: string;
}
export type ReadCatalogResultV1 =
    { kind: "available"; snapshot: MeetingAgentCatalog } | { kind: "rejected"; error: RoleErrorV1 };
export interface RoleCatalogPortV1 {
    readSnapshot(request: ReadCatalogRequest): Promise<ReadCatalogResultV1>;
}
const snapshotSchema = z.object({
    protocolVersion: z.literal(1),
    meetingId: id,
    catalogId: id,
    catalogVersion: version,
    generatedAt: z.number().int().nonnegative(),
    candidates: z.array(candidate)
});
export async function readMeetingRoleCatalogV1(
    port: RoleCatalogPortV1,
    meetingId: string,
    captainSessionId: string,
    managerSessionId: string
): Promise<ReadCatalogResultV1> {
    if (
        ![meetingId, captainSessionId, managerSessionId].every(
            (value) => id.safeParse(value).success
        )
    )
        return {
            kind: "rejected",
            error: { code: "INVALID_ARGUMENT", message: "Catalog request is invalid" }
        };
    const result = await port.readSnapshot({
        protocolVersion: 1,
        meetingId,
        captainSessionId,
        managerSessionId
    });
    if (result.kind !== "available") return result;
    const parsed = snapshotSchema.safeParse(result.snapshot);
    if (
        !parsed.success ||
        parsed.data.meetingId !== meetingId ||
        new Set(parsed.data.candidates.map((item) => item.candidateId)).size !==
            parsed.data.candidates.length ||
        parsed.data.candidates.some((item) => item.definition.id === "meeting_manager")
    )
        return {
            kind: "rejected",
            error: { code: "CATALOG_CANDIDATE_MISMATCH", message: "Catalog snapshot is invalid" }
        };
    return { kind: "available", snapshot: parsed.data };
}
