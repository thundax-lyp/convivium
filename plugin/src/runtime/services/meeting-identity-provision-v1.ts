import type { OutboxItem } from "@/repository/types.js";
import type { MeetingIdentityApplicationDepsV1 } from "@/runtime/application-service/meeting-identity-v1.js";
import { resolveDynamicMeetingDefinitionV1 } from "@/role-composition/resolve.js";
import {
    admitMeetingIdentityV1,
    type IdentityAdmissionPortV1
} from "@/dsh/meeting-identity-admission-v1.js";
export interface IdentityProvisionDependencies extends MeetingIdentityApplicationDepsV1 {
    owner: IdentityAdmissionPortV1;
    parent: unknown;
    teamId: string;
    recordIdentityAdmissionResult?: (recommendationId: string, result: unknown) => Promise<void>;
    markDelivered?: (effect: OutboxItem) => Promise<void>;
}
export async function deliverIdentityProvisionV1(
    effect: OutboxItem,
    deps: IdentityProvisionDependencies
): Promise<void> {
    const payload = effect.payload as { recommendationId?: string };
    if (effect.kind !== "dispatch" || typeof payload.recommendationId !== "string")
        throw new Error("INVALID_ARGUMENT");
    const snapshot = await deps.repository.read();
    const state = snapshot.state as {
        identityRecommendations?: readonly {
            id: string;
            decision: "admit" | "reject";
            status: string;
            definitionId: string;
            definitionVersion: string;
            definitionHash?: string;
            identityId?: string;
            childSessionId?: string;
        }[];
    };
    const intent = state.identityRecommendations?.find(
        (item) => item.id === payload.recommendationId
    );
    if (
        !intent ||
        intent.decision !== "admit" ||
        intent.status !== "provisioning" ||
        !intent.definitionHash ||
        !intent.identityId ||
        !intent.childSessionId
    )
        throw new Error("INVALID_STATE");
    const resolved = resolveDynamicMeetingDefinitionV1(
        deps.definitions,
        { id: intent.definitionId, version: intent.definitionVersion },
        intent.definitionHash
    );
    if (resolved.kind !== "resolved") {
        if (deps.recordIdentityAdmissionResult)
            await deps.recordIdentityAdmissionResult(intent.id, {
                kind: "rejected",
                failureCode: resolved.code
            });
        return;
    }
    if (deps.parent === undefined) throw new Error("CAPABILITY_MISSING");
    const admitted = await admitMeetingIdentityV1(
        intent as never,
        {
            descriptorId: `descriptor:${intent.id}`,
            meetingId: snapshot.meetingId,
            parentSessionId: "",
            definition: { id: intent.definitionId, version: intent.definitionVersion },
            definitionHash: intent.definitionHash,
            expiresAt: Date.now() + 300_000
        },
        deps.parent as never,
        resolved.definition,
        deps.owner
    );
    if (deps.recordIdentityAdmissionResult)
        await deps.recordIdentityAdmissionResult(
            intent.id,
            admitted.kind === "admitted"
                ? {
                      kind: "admitted",
                      admissionId: intent.id,
                      meetingId: snapshot.meetingId,
                      identityId: admitted.identityId,
                      childSessionId: intent.childSessionId,
                      ownershipId: admitted.ownership.id,
                      descriptorId: admitted.ownership.descriptorId,
                      displayName: resolved.definition.displayName,
                      definitionId: intent.definitionId,
                      definitionVersion: intent.definitionVersion,
                      definitionHash: intent.definitionHash
                  }
                : { kind: "rejected", failureCode: admitted.error.code }
        );
    if (deps.markDelivered) await deps.markDelivered(effect);
}
