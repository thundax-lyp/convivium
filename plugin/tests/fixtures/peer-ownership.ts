import { encodeCanonicalJson, sha256Hex } from "@/repository/domain/canonical-json.js";
import type { PreparedDescriptor } from "@/role-composition/model.js";
import type { SessionOwnershipInput } from "@/repository/types.js";

export const peerBindings = (
    meetingId: string,
    identities: readonly { id: string; roles: readonly string[] }[]
) => {
    const preparedDescriptors: PreparedDescriptor[] = [];
    const initialOwnership: SessionOwnershipInput[] = identities.map((identity) => {
        const role = identity.roles.includes("manager")
            ? "manager"
            : identity.roles.includes("evidence_reviewer")
              ? "evidence_reviewer"
              : "participant";
        const definition = {
            agentDefinitionId: `definition-${identity.id}`,
            definitionVersion: "2.0.0",
            definitionHash: "a".repeat(64)
        };
        const resources = {
            instructions: {
                roleDefinitionId: "domain_architect" as const,
                version: "2.0.0",
                sha256: "b".repeat(64)
            },
            presetId: "convivium-domain-architect",
            presetSha256: "c".repeat(64),
            skills: [{ name: "repository-analysis" as const, sha256: "d".repeat(64) }],
            compositionHash: "e".repeat(64)
        };
        const descriptor = {
            descriptorId: `descriptor-${identity.id}`,
            meetingId,
            identityId: identity.id,
            sessionId: `session-${identity.id}`,
            definition,
            resources,
            agentOptions: { provider: "fixture", model: "model" },
            expiresAt: 300000
        };
        const descriptorHash = sha256Hex(encodeCanonicalJson(descriptor));
        preparedDescriptors.push({ ...descriptor, descriptorHash });
        return {
            id: `ownership-${identity.id}`,
            meetingId,
            identityId: identity.id,
            sessionId: descriptor.sessionId,
            definition,
            resources,
            agentOptions: descriptor.agentOptions,
            descriptorId: descriptor.descriptorId,
            descriptorHash,
            sessionLabel: `convivium:meeting-identity:${role}:${meetingId}:${identity.id}`,
            role,
            lifecycleStatus: "provisioning",
            capabilityStatus: "active"
        };
    });
    return {
        creator: { kind: "local_user" as const, principalId: "local-controller" as const },
        initialOwnership,
        preparedDescriptors
    };
};
