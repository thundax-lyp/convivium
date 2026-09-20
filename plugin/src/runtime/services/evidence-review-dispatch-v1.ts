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

const reviewDimensionOutputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["score", "scope", "reason", "baselineEvidenceIds"],
    properties: {
        score: { enum: [0, 1, 2, 3, "unable_to_assess"] },
        scope: { type: "string", minLength: 1 },
        reason: { type: "string", minLength: 1 },
        baselineEvidenceIds: { type: "array", items: { type: "string", minLength: 1 } }
    }
} as const;

const workerReviewOutputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["versionId", "scope", "dimensions"],
    properties: {
        versionId: { type: "string", minLength: 1 },
        scope: { type: "string", minLength: 1 },
        dimensions: {
            type: "object",
            additionalProperties: false,
            required: ["source", "credibility", "completeness", "support"],
            properties: {
                source: reviewDimensionOutputSchema,
                credibility: reviewDimensionOutputSchema,
                completeness: reviewDimensionOutputSchema,
                support: reviewDimensionOutputSchema
            }
        }
    }
} as const;

export function createEvidenceReviewDispatcherV1(
    dependencies: EvidenceReviewDispatcherDependenciesV1
): { dispatch(input: DispatchEvidenceReviewBatchInputV1): Promise<void> } {
    const notifiedVersionIds = new Set<string>();
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
            if (notifiedVersionIds.has(requestedVersionId)) return;
            const recovered = await dependencies.repository.recover();
            if (!recovered.snapshot) retry("REVIEW_STATE_UNAVAILABLE");
            const { state } = recovered.snapshot;
            if (recipientId !== state.evidenceReviewerId) fail("REVIEW_VISIBILITY_INVALID");
            const pending = pendingReviews(state);
            if (pending.length === 0) return;
            const reviewConstraints = pending.map((item) => ({
                versionId: item.version.id,
                allowedBaselineEvidenceIds: [
                    ...new Set(
                        item.baseline.flatMap((publication) =>
                            publication.evidence.map(({ version }) => version.id)
                        )
                    )
                ]
            }));
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
                            expectedMeetingVersion: recovered.snapshot.version,
                            pending,
                            reviewConstraints,
                            reviewItemRules: {
                                requiredDimensions: [
                                    "source",
                                    "credibility",
                                    "completeness",
                                    "support"
                                ],
                                allowedScores: [0, 1, 2, 3, "unable_to_assess"],
                                scoringRubric: {
                                    0: "No usable support, or the available evidence directly contradicts the criterion.",
                                    1: "Weak support with material gaps, ambiguity, or unverified assumptions.",
                                    2: "Adequate support for the scoped claim, with bounded limitations that do not overturn it.",
                                    3: "Strong, direct, independently checkable support with no material unresolved gap.",
                                    unable_to_assess:
                                        "The supplied immutable version and allowed baselines do not contain enough information to judge this criterion."
                                },
                                dimensionCriteria: {
                                    source: "Assess source identity, provenance, retrievability, and chain of custody.",
                                    credibility:
                                        "Assess trustworthiness, method quality, corroboration, and disclosed uncertainty.",
                                    completeness:
                                        "Assess whether the material includes the information needed to evaluate the scoped claim and its limitations.",
                                    support:
                                        "Assess whether the cited material directly supports the claim and qualification without an unstated inference."
                                },
                                workerOutputSchema: workerReviewOutputSchema,
                                itemTemplate: {
                                    versionId: "copy-pending-version-id",
                                    scope: "non-empty-review-scope",
                                    dimensions: Object.fromEntries(
                                        ["source", "credibility", "completeness", "support"].map(
                                            (dimension) => [
                                                dimension,
                                                {
                                                    score: "unable_to_assess",
                                                    scope: "non-empty-dimension-scope",
                                                    reason: "non-empty-reason",
                                                    baselineEvidenceIds: []
                                                }
                                            ]
                                        )
                                    )
                                }
                            },
                            submit: {
                                tool: "convivium_submit_review_batch",
                                input: {
                                    protocolVersion: 1,
                                    meetingId: recovered.snapshot.meetingId,
                                    expectedMeetingVersion: recovered.snapshot.version,
                                    requestId: `review-batch:${outboxItem.id}`,
                                    action: {
                                        kind: "submit_review_batch",
                                        reviews: "replace-with-valid-completed-review-items"
                                    }
                                }
                            },
                            instructions:
                                "This is an executable review request, not an informational notice. In one assistant turn, call subagent once for every pending item so the native one-shot workers run independently. Include reviewItemRules.workerOutputSchema, scoringRubric, dimensionCriteria, and the item's allowed baselines verbatim in each worker prompt; require the worker to return only one JSON review item matching that schema, with no Markdown or prose wrapper. If a worker fails or returns an invalid item, immediately call a replacement one-shot worker for that same pending version; do not submit while a pending version lacks one valid completed worker item. Build each submitted item by copying reviewItemRules.itemTemplate and replacing its placeholder values. The dimensions value must be an object with exactly the four literal property names source, credibility, completeness, and support. Never use an array or numeric keys such as 0, 1, 2, and 3 for dimensions. Before submission, replace every dimension's baselineEvidenceIds with its intersection with reviewConstraints.allowedBaselineEvidenceIds for that version; an empty allowed list requires []. Current version and material IDs are never baseline IDs. Every score must exactly equal one reviewItemRules.allowedScores value; replace fractions, decimals, percentages, or any other score with unable_to_assess. After every pending version has one valid worker item, call convivium_submit_review_batch exactly once with one argument named input: copy submit.input exactly and replace only submit.input.action.reviews with all valid completed review items. Do not answer in prose before attempting these tools."
                        })
                    }
                ],
                signal
            });
            const completed = await dependencies.repository.recover();
            if (!completed.snapshot) retry("REVIEW_STATE_UNAVAILABLE");
            if (
                pending.some(
                    ({ version }) =>
                        !completed.snapshot!.state.reviews.some(
                            (review) => review.versionId === version.id
                        )
                )
            )
                retry("REVIEW_NOT_COMPLETED");
            for (const item of pending) notifiedVersionIds.add(item.version.id);
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
        const requestId = `review-delivery:${input.outboxItem.id}:${input.outboxItem.attempts}:${status}`;
        for (let recordAttempt = 0; recordAttempt < 5; recordAttempt += 1) {
            const recovered = await dependencies.repository.recover();
            if (!recovered.snapshot) retry("REVIEW_STATE_UNAVAILABLE");
            if (alreadySent(recovered.snapshot.state, reviewId)) return;
            try {
                const result = await dependencies.application.execute(
                    {
                        protocolVersion: 1,
                        meetingId: recovered.snapshot.meetingId,
                        expectedMeetingVersion: recovered.snapshot.version,
                        requestId:
                            recordAttempt === 0 ? requestId : `${requestId}:retry-${recordAttempt}`,
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
                if (result.kind === "accepted") return;
                if (result.error.code !== "VERSION_CONFLICT") break;
            } catch {
                if (recordAttempt === 4) break;
            }
        }
        const latest = await dependencies.repository.recover();
        if (latest.snapshot && alreadySent(latest.snapshot.state, reviewId)) return;
        retry("REVIEW_DELIVERY_COMMIT_FAILED");
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
            try {
                const identity = findIdentity(state, authorId, "contributor");
                const ownership = findOwnership(
                    recovered.sessionOwnership,
                    identity,
                    recovered.snapshot.meetingId,
                    "participant",
                    parent
                );
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
            } catch (error) {
                const errorCode =
                    error instanceof EvidenceReviewDispatchError
                        ? error.code
                        : "REVIEW_DELIVERY_FAILED";
                await record(input, "failed", reviewId, errorCode);
                if (error instanceof EvidenceReviewDispatchError && !error.retryable) throw error;
                retry(errorCode);
            }
            await record(input, "sent", reviewId);
        }
    };
}
