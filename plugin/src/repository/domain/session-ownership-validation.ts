import type { PreparedDescriptor } from "@/role-composition/model.js";
import type { JsonObject, SessionOwnership, SessionOwnershipInput } from "@/repository/types.js";
import { PreparedDescriptorSchema } from "./schemas.js";
import { encodeCanonicalJson, sha256Hex } from "./canonical-json.js";

export const same = (a: unknown, b: unknown): boolean =>
    Buffer.from(encodeCanonicalJson(a)).equals(Buffer.from(encodeCanonicalJson(b)));
export const immutableOwnership = (value: SessionOwnershipInput) => {
    const { lifecycleStatus: _lifecycle, capabilityStatus: _capability, ...rest } = value;
    return rest;
};
export const ownershipInput = (value: SessionOwnership): SessionOwnershipInput => {
    const { createdAt: _created, updatedAt: _updated, ...input } = value;
    return input;
};
export const matchesPendingAdmission = (
    state: JsonObject | undefined,
    input: SessionOwnershipInput
) => {
    const lifecycle = state?.lifecycle;
    const recommendations = state?.identityRecommendations;
    return (
        lifecycle &&
        typeof lifecycle === "object" &&
        !Array.isArray(lifecycle) &&
        lifecycle.status === "running" &&
        Array.isArray(recommendations) &&
        recommendations.some(
            (item) =>
                item &&
                typeof item === "object" &&
                !Array.isArray(item) &&
                item.id === input.admissionId &&
                item.status === "provisioning" &&
                item.identityId === input.identityId &&
                item.sessionId === input.sessionId &&
                item.definitionId === input.definition.agentDefinitionId &&
                item.definitionVersion === input.definition.definitionVersion &&
                item.definitionHash === input.definition.definitionHash
        )
    );
};

export const validateDescriptor = (
    ownership: SessionOwnershipInput,
    descriptor: PreparedDescriptor
): boolean => {
    const parsed = PreparedDescriptorSchema.safeParse(descriptor);
    if (!parsed.success) return false;
    const { descriptorHash, ...body } = parsed.data;
    return (
        descriptorHash === sha256Hex(encodeCanonicalJson(body)) &&
        ownership.descriptorHash === descriptorHash &&
        ownership.descriptorId === descriptor.descriptorId &&
        ownership.meetingId === descriptor.meetingId &&
        ownership.identityId === descriptor.identityId &&
        ownership.sessionId === descriptor.sessionId &&
        same(ownership.definition, descriptor.definition) &&
        same(ownership.resources, descriptor.resources) &&
        same(ownership.agentOptions, descriptor.agentOptions)
    );
};

export const isOwnershipUpdateAllowed = (
    previous: SessionOwnershipInput,
    input: SessionOwnershipInput,
    descriptor: PreparedDescriptor | undefined,
    proof: PreparedDescriptor | undefined
): boolean => {
    const lifecycleAllowed =
        previous.lifecycleStatus === input.lifecycleStatus ||
        (previous.lifecycleStatus === "provisioning" && input.lifecycleStatus === "active") ||
        (input.lifecycleStatus === "closed" && previous.capabilityStatus === "revoked");
    return !(
        !same(immutableOwnership(previous), immutableOwnership(input)) ||
        !lifecycleAllowed ||
        (previous.capabilityStatus === "revoked" && input.capabilityStatus !== "revoked") ||
        (input.lifecycleStatus === "closed" && input.capabilityStatus !== "revoked") ||
        (descriptor !== undefined && !same(descriptor, proof))
    );
};
