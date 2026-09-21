import type { IdentityAdmissionResultContext, MeetingState } from "@/domain/index.js";
import type { MeetingAgentDefinition } from "@/role-composition/model.js";
import type { MeetingCommandApplication } from "@/runtime/application-service/meeting-command.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { OutboxItem } from "@/repository/types.js";
import type { IdentityProvisionResult } from "@/runtime/services/meeting-identity-provision.js";

export interface MeetingIdentityEffectHandlerDependencies {
    readonly application: MeetingCommandApplication;
    readonly repository: Pick<MeetingRepositoryPort<MeetingState>, "read">;
    readonly definitions: readonly MeetingAgentDefinition[];
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
    }) => Promise<IdentityProvisionResult>;
    readonly cleanupProvisioned: (recommendationId: string) => Promise<void>;
}

export function createMeetingIdentityEffectHandler(
    dependencies: MeetingIdentityEffectHandlerDependencies
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
            if (snapshot.state.lifecycle.status !== "running")
                throw Object.assign(new Error("INVALID_STATE"), {
                    code: "INVALID_STATE",
                    retryable: true
                });
            const result = await dependencies.provision({
                recommendation,
                meetingId: snapshot.meetingId,
                signal
            });
            if (result.kind === "rejected" && result.failureCode === "RECOVERY_UNAVAILABLE")
                throw Object.assign(new Error(result.failureCode), {
                    code: result.failureCode,
                    retryable: true,
                    terminalOnAttemptLimit: false
                });
            const context: IdentityAdmissionResultContext =
                result.kind === "admitted"
                    ? result.result
                    : { kind: "rejected", failureCode: result.failureCode };
            const latest = await dependencies.repository.read();
            const latestRecommendation = latest.state.identityRecommendations.find(
                (item) => item.id === recommendationId
            );
            if (
                latest.state.lifecycle.status !== "running" ||
                latestRecommendation?.decision !== "admit" ||
                latestRecommendation.status !== "provisioning"
            ) {
                if (result.kind === "admitted")
                    await dependencies.cleanupProvisioned(recommendationId);
                if (latestRecommendation?.status !== "provisioning") return;
                throw Object.assign(new Error("INVALID_STATE"), {
                    code: "INVALID_STATE",
                    retryable: true
                });
            }
            const committed = await dependencies.application.execute(
                {
                    protocolVersion: 1,
                    meetingId: latest.meetingId,
                    expectedMeetingVersion: latest.version,
                    requestId: `identity-admission:${outboxItem.id}`,
                    action: { kind: "record_identity_admission_result", recommendationId }
                },
                {
                    caller: { channel: "runtime_recovery", principalId: "runtime-recovery" },
                    identityAdmissionResult: context
                },
                signal
            );
            if (committed.kind === "accepted") return;
            const afterCommit = await dependencies.repository.read();
            const afterRecommendation = afterCommit.state.identityRecommendations.find(
                (item) => item.id === recommendationId
            );
            if (
                result.kind === "admitted" &&
                (afterCommit.state.lifecycle.status !== "running" ||
                    afterRecommendation?.decision !== "admit" ||
                    afterRecommendation.status !== "provisioning")
            ) {
                await dependencies.cleanupProvisioned(recommendationId);
                return;
            }
            if (committed.error.code !== "NOT_FOUND") throw new Error(committed.error.code);
        }
    };
}
