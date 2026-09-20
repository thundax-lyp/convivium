import type { IdentityAdmissionResultContextV1, MeetingState } from "@/domain/index.js";
import type { MeetingAgentDefinitionV1 } from "@/role-composition/model.js";
import type { MeetingCommandApplicationV1 } from "@/runtime/application-service/meeting-command-v1.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { OutboxItem } from "@/repository/types.js";
import type { IdentityProvisionResultV1 } from "@/runtime/services/meeting-identity-provision-v1.js";

export interface MeetingIdentityEffectHandlerDependenciesV1 {
    readonly application: MeetingCommandApplicationV1;
    readonly repository: Pick<MeetingRepositoryPort<MeetingState>, "read">;
    readonly definitions: readonly MeetingAgentDefinitionV1[];
    readonly provision: (input: {
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
    }) => Promise<IdentityProvisionResultV1>;
}

export function createMeetingIdentityEffectHandlerV1(
    dependencies: MeetingIdentityEffectHandlerDependenciesV1
): { dispatch(outboxItem: OutboxItem, signal: AbortSignal): Promise<void> } {
    return {
        async dispatch(outboxItem, signal) {
            if (outboxItem.kind !== "dispatch" || outboxItem.payload.kind !== "identity_provision")
                throw new Error("INVALID_ARGUMENT");
            const recommendationId = outboxItem.payload.admissionId;
            if (
                typeof recommendationId !== "string" ||
                recommendationId !== outboxItem.payload.recommendationId
            )
                throw new Error("INVALID_ARGUMENT");
            const snapshot = await dependencies.repository.read();
            const recommendation = snapshot.state.identityRecommendations.find(
                (item) => item.id === recommendationId
            );
            if (
                !recommendation ||
                recommendation.decision !== "admit" ||
                recommendation.status !== "provisioning"
            )
                throw new Error("INVALID_STATE");
            const result = await dependencies.provision({
                recommendation,
                meetingId: snapshot.meetingId,
                signal
            });
            if (result.kind === "rejected" && result.failureCode === "RECOVERY_UNAVAILABLE")
                throw Object.assign(new Error(result.failureCode), {
                    code: result.failureCode,
                    retryable: true
                });
            const context: IdentityAdmissionResultContextV1 =
                result.kind === "admitted"
                    ? result.result
                    : { kind: "rejected", failureCode: result.failureCode };
            const committed = await dependencies.application.execute(
                {
                    protocolVersion: 1,
                    meetingId: snapshot.meetingId,
                    expectedMeetingVersion: snapshot.version,
                    requestId: `identity-admission:${outboxItem.id}`,
                    action: { kind: "record_identity_admission_result", recommendationId }
                },
                {
                    caller: { channel: "runtime_recovery", principalId: "runtime-recovery" },
                    identityAdmissionResult: context
                },
                signal
            );
            if (committed.kind !== "accepted" && committed.error.code !== "NOT_FOUND")
                throw new Error(committed.error.code);
        }
    };
}
