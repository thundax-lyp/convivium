import type { Agent } from "@deepseek-ai/dsh-agent";
import type { MeetingAgentDefinitionV1 } from "@/role-composition/model.js";
import type { IdentityRecommendation } from "@/domain/index.js";
export interface PreparedDescriptor {
    descriptorId: string;
    meetingId: string;
    parentSessionId: string;
    definition: { id: string; version: string };
    definitionHash: string;
    expiresAt: number;
}
export interface SessionOwnership {
    id: string;
    admissionId: string;
    meetingId: string;
    identityId: string;
    parentSessionId: string;
    descriptorId: string;
    descriptorHash: string;
    descriptorExpiresAt: number;
    definition: { id: string; version: string };
    definitionHash: string;
    sessionId: string;
    createdAt: number;
    status: "provisioning" | "active" | "interrupted" | "stopped" | "unrecoverable";
}
export type RoleError = { code: string; message: string; targetId?: string };
export interface IdentityAdmissionPort {
    readOwnership(admissionId: string): Promise<SessionOwnership | undefined>;
    putProvisioning(
        owner: SessionOwnership
    ): Promise<{ kind: "created" | "same"; owner: SessionOwnership } | { kind: "conflict" }>;
    inspectOwnedChild(owner: SessionOwnership): Promise<"present" | "absent" | "unavailable">;
    startOwnedChild(
        owner: SessionOwnership,
        parent: Agent,
        definition: MeetingAgentDefinitionV1,
        signal: AbortSignal
    ): Promise<{ kind: "ready"; sessionId: string } | { kind: "rejected"; error: RoleError }>;
    markActive(owner: SessionOwnership): Promise<SessionOwnership | RoleError>;
    revokeAndDrainOwned(owner: SessionOwnership): Promise<void>;
}
export type AdmitIdentityResult =
    | { kind: "admitted"; identityId: string; ownership: SessionOwnership }
    | { kind: "rejected"; error: RoleError };
export async function admitMeetingIdentity(
    intent: IdentityRecommendation,
    descriptor: PreparedDescriptor,
    parent: Agent,
    definition: MeetingAgentDefinitionV1,
    ownerPort: IdentityAdmissionPort
): Promise<AdmitIdentityResult> {
    if (intent.decision !== "admit" || intent.status !== "provisioning")
        return {
            kind: "rejected",
            error: { code: "INVALID_ARGUMENT", message: "Identity intent is not provisioning" }
        };
    if (descriptor.expiresAt <= Date.now())
        return {
            kind: "rejected",
            error: { code: "PREFLIGHT_EXPIRED", message: "Identity descriptor expired" }
        };
    const existing = await ownerPort.readOwnership(intent.id);
    if (existing)
        return existing.definitionHash === intent.definitionHash &&
            existing.identityId === intent.identityId
            ? { kind: "admitted", identityId: existing.identityId, ownership: existing }
            : {
                  kind: "rejected",
                  error: { code: "ADMISSION_CONFLICT", message: "Admission ownership conflicts" }
              };
    const owner: SessionOwnership = {
        id: `session-ownership:${intent.id}`,
        admissionId: intent.id,
        meetingId: descriptor.meetingId,
        identityId: intent.identityId,
        parentSessionId: descriptor.parentSessionId,
        descriptorId: descriptor.descriptorId,
        descriptorHash: descriptor.definitionHash,
        descriptorExpiresAt: descriptor.expiresAt,
        definition: descriptor.definition,
        definitionHash: intent.definitionHash,
        sessionId: intent.childSessionId,
        createdAt: Date.now(),
        status: "provisioning"
    };
    const stored = await ownerPort.putProvisioning(owner);
    if (stored.kind === "conflict")
        return {
            kind: "rejected",
            error: { code: "OWNERSHIP_CONFLICT", message: "Admission ownership conflicts" }
        };
    const child = await ownerPort.inspectOwnedChild(stored.owner);
    if (child === "unavailable")
        return {
            kind: "rejected",
            error: { code: "RECOVERY_UNAVAILABLE", message: "Owned child cannot be inspected" }
        };
    if (child === "absent") {
        const started = await ownerPort.startOwnedChild(
            stored.owner,
            parent,
            definition,
            new AbortController().signal
        );
        if (started.kind !== "ready") {
            await ownerPort.revokeAndDrainOwned(stored.owner);
            return { kind: "rejected", error: started.error };
        }
    }
    const active = await ownerPort.markActive(stored.owner);
    if ("code" in active) {
        await ownerPort.revokeAndDrainOwned(stored.owner);
        return { kind: "rejected", error: active };
    }
    return { kind: "admitted", identityId: active.identityId, ownership: active };
}
