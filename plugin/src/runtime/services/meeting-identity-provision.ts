import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-agent-default-model";
import type { MeetingAgentDefinition, PreparedDescriptor } from "@/role-composition/model.js";
import {
    resolveEffectiveAgentOptions,
    type MeetingAgentModelOverrides
} from "@/role-composition/model-options.js";
import { resolveDynamicMeetingDefinition } from "@/role-composition/resolve.js";
import { preflightMeetingIdentity } from "@/role-composition/dsh-capabilities.js";
import { encodeMeetingIdentitySessionLabel, type MeetingAgentOwner } from "@/dsh/index.js";
import type { SessionOwnership, SessionOwnershipInput } from "@/repository/types.js";
import { encodeCanonicalJson, sha256Hex } from "@/repository/domain/canonical-json.js";
import type { IdentityAdmissionResultContext } from "@/domain/index.js";

export type IdentityProvisionResult =
    | { kind: "admitted"; result: Extract<IdentityAdmissionResultContext, { kind: "admitted" }> }
    | { kind: "rejected"; failureCode: string };
export interface MeetingIdentityProvisionDependencies {
    readonly definitions: readonly MeetingAgentDefinition[];
    readonly agentModelOverrides?: MeetingAgentModelOverrides;
    readonly ctx: Context;
    readonly packageRoot: string;
    readonly cwd: string;
    readonly agents: MeetingAgentOwner;
    readonly owner: {
        readOwnership(admissionId: string): Promise<SessionOwnership | undefined>;
        readDescriptor(descriptorId: string): Promise<PreparedDescriptor | undefined>;
        putProvisioning(
            owner: SessionOwnershipInput,
            descriptor: PreparedDescriptor
        ): Promise<SessionOwnership>;
        markActive(
            owner: SessionOwnership,
            descriptor: PreparedDescriptor
        ): Promise<SessionOwnership>;
        revokeAndDrainOwned(owner: SessionOwnership): Promise<void>;
    };
    readonly now: () => number;
}
export const provisionMeetingIdentity = async (
    input: {
        recommendation: {
            id: string;
            definitionId: string;
            definitionVersion: string;
            definitionHash?: string;
            identityId?: string;
            sessionId?: string;
        };
        meetingId: string;
        signal: AbortSignal;
    },
    dependencies: MeetingIdentityProvisionDependencies
): Promise<IdentityProvisionResult> => {
    const { recommendation, meetingId, signal } = input;
    if (!recommendation.definitionHash || !recommendation.identityId || !recommendation.sessionId)
        return { kind: "rejected", failureCode: "INVALID_STATE" };
    const resolved = resolveDynamicMeetingDefinition(
        dependencies.definitions,
        { id: recommendation.definitionId, version: recommendation.definitionVersion },
        recommendation.definitionHash
    );
    if (resolved.kind !== "resolved") return { kind: "rejected", failureCode: resolved.code };
    const existing = await dependencies.owner.readOwnership(recommendation.id);
    const ownershipId = `session_ownership-${sha256Hex(encodeCanonicalJson([meetingId, "session_ownership", recommendation.identityId])).slice(0, 32)}`;
    if (
        existing &&
        (existing.id !== ownershipId ||
            existing.meetingId !== meetingId ||
            existing.identityId !== recommendation.identityId ||
            existing.sessionId !== recommendation.sessionId ||
            existing.admissionId !== recommendation.id ||
            existing.definition.definitionHash !== recommendation.definitionHash)
    )
        return { kind: "rejected", failureCode: "OWNERSHIP_CONFLICT" };
    if (
        existing &&
        (existing.capabilityStatus !== "active" || existing.lifecycleStatus === "closed")
    )
        return { kind: "rejected", failureCode: "INVALID_STATE" };
    let descriptor = existing
        ? await dependencies.owner.readDescriptor(existing.descriptorId)
        : undefined;
    if (existing && !descriptor) return { kind: "rejected", failureCode: "RECOVERY_UNAVAILABLE" };
    if (!existing) {
        const preflight = await preflightMeetingIdentity({
            ctx: dependencies.ctx,
            packageRoot: dependencies.packageRoot,
            cwd: dependencies.cwd,
            meetingId,
            identityId: recommendation.identityId,
            sessionId: recommendation.sessionId,
            definition: resolved.definition,
            binding: resolved.binding,
            agentOptions: resolveEffectiveAgentOptions(
                dependencies.ctx.agentDefaultModel.currentSelection(),
                dependencies.agentModelOverrides?.[recommendation.definitionId]
            ),
            now: dependencies.now(),
            signal
        });
        if (preflight.kind !== "ready")
            return { kind: "rejected", failureCode: preflight.error.code };
        descriptor = preflight.descriptor;
    }
    if (!descriptor) return { kind: "rejected", failureCode: "RECOVERY_UNAVAILABLE" };
    let ownership = existing;
    try {
        if (!ownership)
            ownership = await dependencies.owner.putProvisioning(
                {
                    id: ownershipId,
                    meetingId,
                    identityId: recommendation.identityId,
                    sessionId: recommendation.sessionId,
                    admissionId: recommendation.id,
                    definition: descriptor.definition,
                    resources: descriptor.resources,
                    agentOptions: descriptor.agentOptions,
                    descriptorId: descriptor.descriptorId,
                    descriptorHash: descriptor.descriptorHash,
                    sessionLabel: encodeMeetingIdentitySessionLabel({
                        role: "participant",
                        meetingId,
                        identityId: recommendation.identityId
                    }),
                    role: "participant",
                    lifecycleStatus: "provisioning",
                    capabilityStatus: "active"
                },
                descriptor
            );
        if (ownership.lifecycleStatus === "provisioning") {
            if (dependencies.now() >= descriptor.expiresAt) {
                await dependencies.owner.revokeAndDrainOwned(ownership);
                return { kind: "rejected", failureCode: "PREFLIGHT_EXPIRED" };
            }
            if (existing)
                await dependencies.agents.resume({
                    ownership,
                    definition: resolved.definition,
                    purpose: "provisioning",
                    signal
                });
            else
                await dependencies.agents.create({
                    ownership,
                    descriptor,
                    definition: resolved.definition,
                    signal
                });
            ownership = await dependencies.owner.markActive(ownership, descriptor);
        }
        return {
            kind: "admitted",
            result: {
                kind: "admitted",
                admissionId: recommendation.id,
                meetingId,
                identityId: recommendation.identityId,
                sessionId: recommendation.sessionId,
                ownershipId: ownership.id,
                descriptorId: descriptor.descriptorId,
                displayName: resolved.definition.displayName,
                definitionId: recommendation.definitionId,
                definitionVersion: recommendation.definitionVersion,
                definitionHash: recommendation.definitionHash
            }
        };
    } catch {
        // Recovery never creates a replacement or refreshes the original capability proof.
        if (existing) return { kind: "rejected", failureCode: "RECOVERY_UNAVAILABLE" };
        if (ownership) await dependencies.owner.revokeAndDrainOwned(ownership);
        return { kind: "rejected", failureCode: "ADMISSION_FAILED" };
    }
};
