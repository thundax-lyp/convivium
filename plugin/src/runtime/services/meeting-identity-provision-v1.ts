import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { MeetingAgentDefinitionV1 } from "@/role-composition/model.js";
import type { MeetingAgentModelOverrides } from "@/role-composition/model-options.js";
import {
    resolveDynamicMeetingDefinitionV1,
    resolveMeetingRoles,
    RoleCompositionError
} from "@/role-composition/resolve.js";
import { preflightDynamicMeetingIdentityV1 } from "@/role-composition/dsh-capabilities.js";
import { startMeetingIdentitySessionV1 } from "@/dsh/index.js";
import type { SessionOwnership } from "@/repository/types.js";

export type IdentityProvisionResultV1 =
    | {
          kind: "admitted";
          result: {
              kind: "admitted";
              admissionId: string;
              meetingId: string;
              identityId: string;
              childSessionId: string;
              ownershipId: string;
              descriptorId: string;
              displayName: string;
              definitionId: string;
              definitionVersion: string;
              definitionHash: string;
          };
      }
    | { kind: "rejected"; failureCode: string };

export interface MeetingIdentityProvisionDependenciesV1 {
    readonly definitions: readonly MeetingAgentDefinitionV1[];
    readonly agentModelOverrides?: MeetingAgentModelOverrides;
    readonly parent: Agent;
    readonly runtime: Pick<SubagentRuntime, "startContinuable">;
    readonly provider: string;
    readonly owner: {
        readOwnership(admissionId: string): Promise<SessionOwnership | undefined>;
        putProvisioning(
            owner: SessionOwnership
        ): Promise<{ kind: "created" | "same"; owner: SessionOwnership } | { kind: "conflict" }>;
        inspectOwnedChild(owner: SessionOwnership): Promise<"present" | "absent" | "unavailable">;
        markActive(owner: SessionOwnership): Promise<SessionOwnership>;
        revokeAndDrainOwned(owner: SessionOwnership): Promise<void>;
    };
    readonly now: () => number;
}

export async function provisionMeetingIdentityV1(
    input: {
        recommendation: {
            id: string;
            definitionId: string;
            definitionVersion: string;
            definitionHash?: string;
            identityId?: string;
            childSessionId?: string;
        };
        meetingId: string;
        signal: AbortSignal;
    },
    dependencies: MeetingIdentityProvisionDependenciesV1
): Promise<IdentityProvisionResultV1> {
    const recommendation = input.recommendation;
    if (
        !recommendation.definitionHash ||
        !recommendation.identityId ||
        !recommendation.childSessionId
    )
        return { kind: "rejected", failureCode: "INVALID_STATE" };
    const resolved = resolveDynamicMeetingDefinitionV1(
        dependencies.definitions,
        { id: recommendation.definitionId, version: recommendation.definitionVersion },
        recommendation.definitionHash
    );
    if (resolved.kind !== "resolved") return { kind: "rejected", failureCode: resolved.code };
    const preflight = await preflightDynamicMeetingIdentityV1(
        dependencies.parent,
        recommendation,
        resolved.definition,
        resolved.binding,
        input.signal
    );
    if (preflight.kind !== "ready") return { kind: "rejected", failureCode: preflight.error.code };
    let composition;
    try {
        const roles = await resolveMeetingRoles(
            {
                definitions: dependencies.definitions,
                agentModelOverrides: dependencies.agentModelOverrides,
                participants: [
                    {
                        participantKey: recommendation.identityId,
                        agentDefinitionId: recommendation.definitionId
                    }
                ]
            },
            async () => undefined
        );
        composition = roles.participants[recommendation.identityId];
        if (!composition) throw new RoleCompositionError();
    } catch {
        return { kind: "rejected", failureCode: "CAPABILITY_MISSING" };
    }
    const expectedOwner: SessionOwnership = {
        id: `session-ownership:${recommendation.id}`,
        meetingId: input.meetingId,
        identityId: recommendation.identityId,
        agentDefinition: {
            agentDefinitionId: recommendation.definitionId,
            definitionVersion: recommendation.definitionVersion,
            definitionHash: recommendation.definitionHash
        },
        sessionId: recommendation.childSessionId,
        parentSessionId: String(dependencies.parent.id),
        sessionLabel: `convivium:meeting-identity:participant:${input.meetingId}:${recommendation.identityId}`,
        provider: dependencies.provider,
        role: "participant",
        lifecycleStatus: "provisioning",
        capabilityStatus: "active",
        createdAt: dependencies.now(),
        updatedAt: dependencies.now()
    };
    const existing = await dependencies.owner.readOwnership(recommendation.id);
    if (
        existing !== undefined &&
        (existing.id !== expectedOwner.id ||
            existing.meetingId !== expectedOwner.meetingId ||
            existing.identityId !== expectedOwner.identityId ||
            existing.sessionId !== expectedOwner.sessionId ||
            existing.parentSessionId !== expectedOwner.parentSessionId ||
            existing.sessionLabel !== expectedOwner.sessionLabel ||
            existing.provider !== expectedOwner.provider ||
            existing.agentDefinition?.agentDefinitionId !== recommendation.definitionId ||
            existing.agentDefinition?.definitionVersion !== recommendation.definitionVersion ||
            existing.agentDefinition?.definitionHash !== recommendation.definitionHash)
    )
        return { kind: "rejected", failureCode: "OWNERSHIP_CONFLICT" };
    let owner = existing ?? expectedOwner;
    const stored = existing
        ? { kind: "same" as const, owner: existing }
        : await dependencies.owner.putProvisioning(owner);
    if (stored.kind === "conflict") return { kind: "rejected", failureCode: "OWNERSHIP_CONFLICT" };
    const child = await dependencies.owner.inspectOwnedChild(stored.owner);
    if (child === "unavailable") return { kind: "rejected", failureCode: "RECOVERY_UNAVAILABLE" };
    try {
        if (child === "absent") {
            const started = await startMeetingIdentitySessionV1({
                composition,
                runtime: dependencies.runtime,
                provider: dependencies.provider,
                parent: dependencies.parent,
                childId: recommendation.childSessionId as never,
                role: "participant",
                meetingId: input.meetingId,
                identityId: recommendation.identityId,
                signal: input.signal
            });
            if (started.childId !== recommendation.childSessionId)
                throw new Error("OWNERSHIP_CONFLICT");
            owner = { ...stored.owner, initialMessageId: String(started.messageId) };
        }
        const active = await dependencies.owner.markActive(owner);
        return {
            kind: "admitted",
            result: {
                kind: "admitted",
                admissionId: recommendation.id,
                meetingId: input.meetingId,
                identityId: recommendation.identityId,
                childSessionId: recommendation.childSessionId,
                ownershipId: active.id!,
                descriptorId: `descriptor:${recommendation.id}`,
                displayName: resolved.definition.displayName,
                definitionId: recommendation.definitionId,
                definitionVersion: recommendation.definitionVersion,
                definitionHash: recommendation.definitionHash
            }
        };
    } catch (error) {
        if (!existing) await dependencies.owner.revokeAndDrainOwned(stored.owner);
        return {
            kind: "rejected",
            failureCode: error instanceof Error ? error.message : "ADMISSION_FAILED"
        };
    }
}
