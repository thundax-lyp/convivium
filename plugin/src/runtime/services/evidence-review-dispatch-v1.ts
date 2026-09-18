import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type {
    EvidenceReviewV1,
    EvidenceVersionV1,
    MeetingIdentityV1,
    MeetingState,
    PublicationV1
} from "@/domain/index.js";
import { followupMeetingIdentitySessionV1 } from "@/dsh/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { OutboxItem, SessionOwnership } from "@/repository/types.js";
import {
    RUNTIME_RECOVERY_PRINCIPAL_ID,
    type MeetingCommandApplicationV1
} from "@/runtime/application-service/meeting-command-v1.js";

class EvidenceReviewDispatchError extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean
    ) {
        super(code);
    }
}

function fail(code: string): never {
    throw new EvidenceReviewDispatchError(code, false);
}

function retry(code: string): never {
    throw new EvidenceReviewDispatchError(code, true);
}

function stringField(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== "string" || value.trim() === "") fail("REVIEW_PAYLOAD_INVALID");
    return value;
}

function findIdentity(
    state: MeetingState,
    identityId: string,
    role: "evidence_reviewer" | "contributor"
): MeetingIdentityV1 {
    const identity = state.identities.find((candidate) => candidate.id === identityId);
    if (!identity || identity.roles.length !== 1 || identity.roles[0] !== role)
        fail("REVIEW_VISIBILITY_INVALID");
    return identity;
}

function findOwnership(
    ownerships: readonly SessionOwnership[],
    identity: MeetingIdentityV1,
    meetingId: string,
    role: "evidence_reviewer" | "participant",
    parent: Agent
): SessionOwnership {
    const matches = ownerships.filter(
        (candidate) =>
            candidate.id === identity.sessionOwnershipId &&
            candidate.meetingId === meetingId &&
            candidate.identityId === identity.id &&
            candidate.role === role &&
            candidate.lifecycleStatus === "active" &&
            candidate.capabilityStatus === "active" &&
            candidate.parentSessionId === String(parent.id)
    );
    if (matches.length !== 1) fail("REVIEW_OWNERSHIP_INVALID");
    return matches[0]!;
}

function publicationEvidence(
    state: MeetingState,
    publication: PublicationV1
): readonly { version: EvidenceVersionV1; review: EvidenceReviewV1 }[] {
    if (publication.finalVersionIds.length !== publication.finalReviewIds.length)
        fail("REVIEW_BASELINE_INVALID");
    return publication.finalVersionIds.map((versionId, index) => {
        const version = state.evidencePackages
            .flatMap((evidencePackage) => evidencePackage.versions)
            .find((candidate) => candidate.id === versionId);
        const review = state.reviews.find(
            (candidate) => candidate.id === publication.finalReviewIds[index]
        );
        if (!version || !review || review.versionId !== versionId) fail("REVIEW_BASELINE_INVALID");
        return { version, review };
    });
}

function pendingReviews(state: MeetingState) {
    return state.evidencePackages.flatMap((evidencePackage) => {
        const version = evidencePackage.versions.find(
            (candidate) => candidate.id === evidencePackage.currentVersionId
        );
        const registered = state.registrations.some(
            (registration) =>
                registration.versionId === evidencePackage.currentVersionId &&
                registration.status === "complete"
        );
        const reviewed = state.reviews.some(
            (review) => review.versionId === evidencePackage.currentVersionId
        );
        if (!version || !registered || reviewed) return [];
        const round = state.rounds.find((candidate) => candidate.id === evidencePackage.roundId);
        if (!round || round.agendaId !== evidencePackage.agendaId) fail("REVIEW_PENDING_INVALID");
        const baseline = round.publicBaselinePublicationIds.map((publicationId) => {
            const publication = state.publications.find(
                (candidate) => candidate.id === publicationId
            );
            if (!publication) fail("REVIEW_BASELINE_INVALID");
            return {
                publicationId,
                evidence: publicationEvidence(state, publication)
            };
        });
        return [{ version, baseline }];
    });
}

interface DispatchEvidenceReviewBatchInputV1 {
    readonly outboxItem: OutboxItem;
    readonly parent: Agent;
    readonly signal: AbortSignal;
}

interface EvidenceReviewDispatcherDependenciesV1 {
    readonly sessions: Pick<SubagentRuntime, "sendMessage">;
    readonly repository: Pick<MeetingRepositoryPort<MeetingState>, "recover">;
}

export function createEvidenceReviewDispatcherV1(
    dependencies: EvidenceReviewDispatcherDependenciesV1
): { dispatch(input: DispatchEvidenceReviewBatchInputV1): Promise<void> } {
    return {
        async dispatch({ outboxItem, parent, signal }) {
            const payload = outboxItem.payload as Record<string, unknown>;
            if (
                outboxItem.kind !== "dispatch" ||
                payload.kind !== "agent_notice" ||
                payload.noticeKind !== "review_request"
            )
                fail("OUTBOX_ROUTE_UNAVAILABLE");
            const recipientId = stringField(payload, "recipientId");
            const agendaId = stringField(payload, "agendaId");
            const requestedVersionId = stringField(payload, "versionId");
            const recovered = await dependencies.repository.recover();
            if (!recovered.snapshot) retry("REVIEW_STATE_UNAVAILABLE");
            const { state } = recovered.snapshot;
            if (recipientId !== state.evidenceReviewerId) fail("REVIEW_VISIBILITY_INVALID");
            const pending = pendingReviews(state);
            if (pending.length === 0) return;
            if (
                !state.evidencePackages.some(
                    (evidencePackage) =>
                        evidencePackage.agendaId === agendaId &&
                        evidencePackage.versions.some(
                            (version) => version.id === requestedVersionId
                        )
                )
            )
                fail("REVIEW_VISIBILITY_INVALID");
            const identity = findIdentity(state, recipientId, "evidence_reviewer");
            const ownership = findOwnership(
                recovered.sessionOwnership,
                identity,
                recovered.snapshot.meetingId,
                "evidence_reviewer",
                parent
            );
            await followupMeetingIdentitySessionV1({
                runtime: dependencies.sessions,
                parent,
                ownership,
                meetingId: recovered.snapshot.meetingId,
                identityId: identity.id,
                prompt: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            effectId: outboxItem.id,
                            meetingId: recovered.snapshot.meetingId,
                            pending,
                            instructions:
                                "Create one native one-shot worker per pending version, then submit all completed reviews atomically with convivium_submit_review_batch."
                        })
                    }
                ],
                signal
            });
        }
    };
}

interface ReviewDeliveryDispatcherDependenciesV1 extends EvidenceReviewDispatcherDependenciesV1 {
    readonly application: MeetingCommandApplicationV1;
}

function alreadySent(state: MeetingState, reviewId: string): boolean {
    return state.reviewDeliveries.some(
        (delivery) => delivery.reviewId === reviewId && delivery.status === "sent"
    );
}

export function createReviewDeliveryDispatcherV1(
    dependencies: ReviewDeliveryDispatcherDependenciesV1
): { dispatch(input: DispatchEvidenceReviewBatchInputV1): Promise<void> } {
    async function record(
        input: DispatchEvidenceReviewBatchInputV1,
        status: "sent" | "failed",
        reviewId: string,
        failureReason?: string
    ): Promise<void> {
        const recovered = await dependencies.repository.recover();
        if (!recovered.snapshot) retry("REVIEW_STATE_UNAVAILABLE");
        if (alreadySent(recovered.snapshot.state, reviewId)) return;
        let result;
        try {
            result = await dependencies.application.execute(
                {
                    protocolVersion: 1,
                    meetingId: recovered.snapshot.meetingId,
                    expectedMeetingVersion: recovered.snapshot.version,
                    requestId: `review-delivery:${input.outboxItem.id}:${input.outboxItem.attempts}:${status}`,
                    action: {
                        kind: "record_review_delivery",
                        reviewId,
                        status,
                        ...(failureReason === undefined ? {} : { failureReason })
                    }
                },
                {
                    caller: {
                        channel: "runtime_recovery",
                        principalId: RUNTIME_RECOVERY_PRINCIPAL_ID
                    }
                },
                input.signal
            );
        } catch {
            const latest = await dependencies.repository.recover();
            if (latest.snapshot && alreadySent(latest.snapshot.state, reviewId)) return;
            retry("REVIEW_DELIVERY_COMMIT_FAILED");
        }
        if (result.kind === "rejected") {
            const latest = await dependencies.repository.recover();
            if (latest.snapshot && alreadySent(latest.snapshot.state, reviewId)) return;
            retry("REVIEW_DELIVERY_COMMIT_FAILED");
        }
    }

    return {
        async dispatch(input) {
            const { outboxItem, parent, signal } = input;
            const payload = outboxItem.payload as Record<string, unknown>;
            if (outboxItem.kind !== "dispatch" || payload.kind !== "review_delivery")
                fail("OUTBOX_ROUTE_UNAVAILABLE");
            const reviewId = stringField(payload, "reviewId");
            const authorId = stringField(payload, "authorId");
            const recovered = await dependencies.repository.recover();
            if (!recovered.snapshot) retry("REVIEW_STATE_UNAVAILABLE");
            const state = recovered.snapshot.state;
            if (alreadySent(state, reviewId)) return;
            const review = state.reviews.find((candidate) => candidate.id === reviewId);
            const evidencePackage = state.evidencePackages.find(
                (candidate) =>
                    candidate.authorId === authorId &&
                    candidate.versions.some((version) => version.id === review?.versionId)
            );
            if (!review || !evidencePackage) fail("REVIEW_VISIBILITY_INVALID");
            const identity = findIdentity(state, authorId, "contributor");
            const ownership = findOwnership(
                recovered.sessionOwnership,
                identity,
                recovered.snapshot.meetingId,
                "participant",
                parent
            );
            try {
                await followupMeetingIdentitySessionV1({
                    runtime: dependencies.sessions,
                    parent,
                    ownership,
                    meetingId: recovered.snapshot.meetingId,
                    identityId: authorId,
                    prompt: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                effectId: outboxItem.id,
                                meetingId: recovered.snapshot.meetingId,
                                review
                            })
                        }
                    ],
                    signal
                });
            } catch {
                await record(input, "failed", reviewId, "REVIEW_DELIVERY_FAILED");
                retry("REVIEW_DELIVERY_FAILED");
            }
            await record(input, "sent", reviewId);
        }
    };
}
