import type { ManagerCatalogBindingV1, MeetingAgentCatalogSnapshot } from "../../domain/model.js";
import {
    MeetingAgentCatalogSnapshotSchema,
    type MeetingAgentCatalogSnapshotV1
} from "../../protocol/index.js";
import { encodeCanonicalJson } from "../../repository/domain/canonical-json.js";

export const AGENT_CATALOG_SERVICE_KEY = "convivium.agentCatalog";

export type AgentCatalogReadFailure = "unavailable" | "invalid" | "unsupported" | "oversize";

export type AgentCatalogReadResult =
    | { readonly ok: true; readonly snapshot: MeetingAgentCatalogSnapshotV1 }
    | { readonly ok: false; readonly failure: AgentCatalogReadFailure };

export interface AgentCatalogPort {
    readSnapshot(request: {
        readonly teamId: string;
        readonly meetingId: string;
        readonly captainSessionId: string;
    }): Promise<AgentCatalogReadResult>;
}

declare module "@deepseek-ai/cordis" {
    interface Context {
        "convivium.agentCatalog": AgentCatalogPort;
    }
}

type CatalogRequest = Parameters<AgentCatalogPort["readSnapshot"]>[0];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const actual = Object.keys(value).sort();
    const keys = [...expected].sort();
    return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function copySnapshot(snapshot: MeetingAgentCatalogSnapshotV1): MeetingAgentCatalogSnapshot {
    return {
        protocolVersion: snapshot.protocolVersion,
        catalogId: snapshot.catalogId,
        catalogVersion: snapshot.catalogVersion,
        teamId: snapshot.teamId,
        capturedAt: snapshot.capturedAt,
        roles: snapshot.roles.map((role) => ({
            roleDefinitionId: role.roleDefinitionId,
            version: role.version,
            displayName: role.displayName,
            summary: role.summary,
            expertiseTags: [...role.expertiseTags],
            evidenceScopes: [...role.evidenceScopes],
            responsibilities: [...role.responsibilities],
            nonResponsibilities: [...role.nonResponsibilities]
        })),
        candidates: snapshot.candidates.map((candidate) => ({ ...candidate }))
    };
}

export async function captureManagerCatalogBinding(
    port: AgentCatalogPort | undefined,
    request: CatalogRequest
): Promise<ManagerCatalogBindingV1> {
    if (port === undefined) return { kind: "none" };
    try {
        const result: unknown = await port.readSnapshot(request);
        if (!isRecord(result) || typeof result.ok !== "boolean") return { kind: "none" };
        if (result.ok === false) {
            if (
                !hasExactKeys(result, ["ok", "failure"]) ||
                !["unavailable", "invalid", "unsupported", "oversize"].includes(
                    result.failure as string
                )
            ) {
                return { kind: "none" };
            }
            return { kind: "none" };
        }
        if (!hasExactKeys(result, ["ok", "snapshot"])) return { kind: "none" };
        const snapshot = MeetingAgentCatalogSnapshotSchema(result.snapshot);
        if (snapshot.teamId !== request.teamId) return { kind: "none" };
        if (encodeCanonicalJson(snapshot).byteLength > 16 * 1024) return { kind: "none" };

        const candidateIds = new Set<string>();
        for (const candidate of snapshot.candidates) {
            if (candidateIds.has(candidate.candidateId)) return { kind: "none" };
            candidateIds.add(candidate.candidateId);
        }
        const roleVersions = new Set<string>();
        for (const role of snapshot.roles) {
            const key = `${role.roleDefinitionId}\u0000${role.version}`;
            if (roleVersions.has(key)) return { kind: "none" };
            roleVersions.add(key);
        }
        for (const candidate of snapshot.candidates) {
            const matches = snapshot.roles.filter(
                (role) =>
                    role.roleDefinitionId === candidate.roleDefinitionId &&
                    role.version === candidate.roleDefinitionVersion
            );
            if (matches.length !== 1) return { kind: "none" };
        }
        return { kind: "verified", snapshot: copySnapshot(snapshot) };
    } catch {
        return { kind: "none" };
    }
}
