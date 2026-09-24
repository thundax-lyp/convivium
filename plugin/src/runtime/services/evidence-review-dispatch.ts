import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type {
    EvidenceReview,
    EvidenceVersion,
    MeetingIdentity,
    MeetingState,
    Publication
} from "@/domain/index.js";
import { MAX_EVIDENCE_VALIDATION_FAILURES } from "@/domain/index.js";
import { followupMeetingIdentitySession } from "@/dsh/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { OutboxItem, SessionOwnership } from "@/repository/types.js";
import { ReviewWorkerOutputSchema } from "@/protocol/index.js";
import {
    RUNTIME_RECOVERY_PRINCIPAL_ID,
    type MeetingCommandApplication
} from "@/runtime/application-service/meeting-command.js";

class EvidenceReviewDispatchError extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean,
        readonly terminalOnAttemptLimit = true,
        readonly retryAt?: number
    ) {
        super(code);
    }
}

function fail(code: string): never {
    throw new EvidenceReviewDispatchError(code, false);
}

function retry(code: string, terminalOnAttemptLimit = true, retryAt?: number): never {
    throw new EvidenceReviewDispatchError(code, true, terminalOnAttemptLimit, retryAt);
}

function stringField(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== "string" || value.trim() === "") fail("REVIEW_PAYLOAD_INVALID");
    return value;
}

function claimReleaseReason(
    error: unknown,
    signal: AbortSignal
): "review_timeout" | "review_interrupted" | "dispatch_failed" {
    if (signal.aborted) return "review_interrupted";
    const detail =
        error instanceof Error
            ? `${error.name} ${error.message}`.toLowerCase()
            : String(error).toLowerCase();
    return detail.includes("timeout") || detail.includes("timed out") || detail.includes("deadline")
        ? "review_timeout"
        : "dispatch_failed";
}

function findIdentity(
    state: MeetingState,
    identityId: string,
    role: "evidence_reviewer" | "contributor"
): MeetingIdentity {
    const identity = state.identities.find((candidate) => candidate.id === identityId);
    if (!identity || identity.roles.length !== 1 || identity.roles[0] !== role)
        fail("REVIEW_VISIBILITY_INVALID");
    return identity;
}

function findOwnership(
    ownerships: readonly SessionOwnership[],
    identity: MeetingIdentity,
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
    publication: Publication
): readonly { version: EvidenceVersion; review: EvidenceReview }[] {
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
        if (
            !version ||
            !registered ||
            !["submitted", "validation_failed", "validation_cancelled"].includes(version.status) ||
            version.failureCount >= MAX_EVIDENCE_VALIDATION_FAILURES
        )
            return [];
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
        return [{ version, baseline, roundId: round.id }];
    });
}

interface DispatchEvidenceReviewInput {
    readonly outboxItem: OutboxItem;
    readonly parent: Agent;
    readonly signal: AbortSignal;
}

interface EvidenceReviewDispatcherDependencies {
    readonly sessions: Pick<SubagentRuntime, "sendMessage">;
    readonly repository: Pick<MeetingRepositoryPort<MeetingState>, "recover">;
    readonly application: MeetingCommandApplication;
    readonly clock: { now(): number };
}

export function createEvidenceReviewDispatcher(
    dependencies: EvidenceReviewDispatcherDependencies
): { dispatch(input: DispatchEvidenceReviewInput): Promise<void> } {
    async function failValidation(
        meetingId: string,
        roundId: string,
        claimId: string,
        reason: "review_timeout" | "review_interrupted" | "dispatch_failed"
    ): Promise<void> {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const recovered = await dependencies.repository.recover();
            if (!recovered.snapshot) retry("REVIEW_STATE_UNAVAILABLE");
            if (
                !recovered.snapshot.state.reviewClaims.some(
                    (claim) => claim.id === claimId && claim.roundId === roundId
                )
            )
                return;
            const released = await dependencies.application.execute(
                {
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: recovered.snapshot.version,
                    requestId: `review-claim-release:${claimId}:${reason}`,
                    action: { kind: "fail_evidence_validation", roundId, claimId, reason }
                },
                {
                    caller: {
                        channel: "runtime_recovery",
                        principalId: RUNTIME_RECOVERY_PRINCIPAL_ID
                    }
                },
                new AbortController().signal
            );
            if (released.kind === "accepted") return;
            if (["NOT_FOUND", "REVIEWER_CONFLICT"].includes(released.error.code)) return;
            if (released.error.code !== "VERSION_CONFLICT") retry("REVIEW_CLAIM_RELEASE_FAILED");
        }
        retry("REVIEW_CLAIM_RELEASE_FAILED");
    }

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
            if (state.lifecycle.status === "paused") return;
            const existingClaim = state.reviewClaims.find(
                (claim) => claim.versionId === requestedVersionId
            );
            if (existingClaim) {
                if (existingClaim.expiresAt <= dependencies.clock.now()) {
                    await failValidation(
                        recovered.snapshot.meetingId,
                        existingClaim.roundId,
                        existingClaim.id,
                        "review_timeout"
                    );
                    retry("REVIEW_VALIDATION_RETRY", false);
                }
                if (existingClaim.sourceEffectId !== outboxItem.id) return;
                retry("REVIEW_CLAIM_IN_PROGRESS", false, existingClaim.expiresAt);
            }
            const pending = pendingReviews(state);
            const requested = pending.find(({ version }) => version.id === requestedVersionId);
            if (!requested) return;
            const allowedBaselineEvidenceIds = [
                ...new Set(
                    requested.baseline.flatMap((publication) =>
                        publication.evidence.map(({ version }) => version.id)
                    )
                )
            ];
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
            const claim = await dependencies.application.execute(
                {
                    protocolVersion: 1,
                    meetingId: recovered.snapshot.meetingId,
                    expectedMeetingVersion: recovered.snapshot.version,
                    requestId: `review-claim:${outboxItem.id}:${outboxItem.attempts}`,
                    action: {
                        kind: "claim_evidence_review",
                        sourceEffectId: outboxItem.id,
                        roundId: requested.roundId,
                        versionId: requestedVersionId
                    }
                },
                {
                    caller: {
                        channel: "runtime_recovery",
                        principalId: RUNTIME_RECOVERY_PRINCIPAL_ID
                    }
                },
                signal
            );
            if (claim.kind === "rejected") {
                if (["VERSION_CONFLICT", "REVIEWER_CONFLICT"].includes(claim.error.code)) {
                    const current = await dependencies.repository.recover();
                    if (!current.snapshot) retry("REVIEW_STATE_UNAVAILABLE");
                    const activeClaim = current.snapshot.state.reviewClaims.find(
                        (candidate) =>
                            candidate.roundId === requested.roundId &&
                            candidate.reviewerId === recipientId &&
                            candidate.versionId === requestedVersionId &&
                            candidate.expiresAt > dependencies.clock.now()
                    );
                    if (activeClaim) {
                        if (activeClaim.sourceEffectId !== outboxItem.id) return;
                        retry("REVIEW_CLAIM_IN_PROGRESS", false, activeClaim.expiresAt);
                    }
                    retry("REVIEW_CLAIM_UNAVAILABLE");
                }
                fail(claim.error.code);
            }
            const claimId = claim.relatedIds?.[0];
            if (!claimId) retry("REVIEW_CLAIM_UNAVAILABLE");
            try {
                await followupMeetingIdentitySession({
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
                                pending: requested,
                                reviewConstraint: {
                                    versionId: requestedVersionId,
                                    allowedBaselineEvidenceIds
                                },
                                reviewItemRules: {
                                    requiredDimensions: [
                                        "source",
                                        "credibility",
                                        "completeness",
                                        "support"
                                    ],
                                    allowedScores: [0, 1, 2, 3, "unable_to_assess"],
                                    scoringRubric: {
                                        0: "没有可用支持，或现有证据直接反驳该判断标准。",
                                        1: "支持较弱，存在实质缺口、歧义或未经验证的假设。",
                                        2: "对限定范围内的主张有充分支持，剩余限制明确且不会推翻结论。",
                                        3: "存在强、直接且可独立核验的支持，没有实质性未解决缺口。",
                                        unable_to_assess:
                                            "给定 immutable version 与允许使用的 baseline 不足以判断该标准。"
                                    },
                                    dimensionCriteria: {
                                        source: "评估来源身份、出处、可检索性与保管链。",
                                        credibility:
                                            "评估可信度、方法质量、交叉印证与已披露不确定性。",
                                        completeness:
                                            "评估材料是否包含判断限定主张及其限制所需的信息。",
                                        support:
                                            "评估引用材料是否无需未声明推断即可直接支持主张及其限定条件。"
                                    },
                                    workerOutputSchema: ReviewWorkerOutputSchema,
                                    itemTemplate: {
                                        versionId: "copy-pending-version-id",
                                        scope: "填写非空审核范围",
                                        dimensions: Object.fromEntries(
                                            [
                                                "source",
                                                "credibility",
                                                "completeness",
                                                "support"
                                            ].map((dimension) => [
                                                dimension,
                                                {
                                                    score: "unable_to_assess",
                                                    scope: "填写非空维度范围",
                                                    reason: "填写非空判断理由",
                                                    baselineEvidenceIds: []
                                                }
                                            ])
                                        )
                                    }
                                },
                                submit: {
                                    tool: "convivium_submit_evidence_review",
                                    toolArguments: {
                                        protocolVersion: 1,
                                        meetingId: recovered.snapshot.meetingId,
                                        requestId: `evidence-review:${claimId}`,
                                        action: {
                                            kind: "submit_evidence_review",
                                            roundId: requested.roundId,
                                            claimId,
                                            versionId: requestedVersionId,
                                            dimensions: {},
                                            scope: ""
                                        }
                                    }
                                },
                                instructions:
                                    "按顺序执行，不要解释。第一步：只调用一次 convivium_run_review_worker，不调用通用 subagent，也不创建 replacement worker；convivium_run_review_worker 的 arguments 仍只有顶层 input，input 内的 meetingId 和 versionId 必须来自当前 request，prompt 必须包含 pending、允许使用的 baseline、reviewItemRules.itemTemplate、scoringRubric、dimensionCriteria 和 workerOutputSchema；worker 返回机器校验的 workerOutputSchema。第二步：只接受 kind=completed 的 review；dimensions 只能是 source、credibility、completeness、support 四个键；baselineEvidenceIds 与 reviewConstraint 取交集，首轮没有 baseline 时必须保留 []。未得到 completed 结果时直接结束，不调用提交工具。第三步：得到结果时复制 submit.toolArguments，把 worker 结果的 dimensions 和 scope 写入 action，然后调用 convivium_submit_evidence_review。工具参数直接使用结构化 object，不要生成 JSON 文本；工具 arguments 根对象直接使用 MeetingCommand 字段，不得添加 input、arguments、submit 或其他包装层。worker 工具和提交工具都只允许调用一次。"
                            })
                        }
                    ],
                    signal
                });
            } catch (error) {
                await failValidation(
                    recovered.snapshot.meetingId,
                    requested.roundId,
                    claimId,
                    claimReleaseReason(error, signal)
                );
                retry("REVIEW_VALIDATION_RETRY", false);
            }
            const completed = await dependencies.repository.recover();
            if (!completed.snapshot) retry("REVIEW_STATE_UNAVAILABLE");
            if (
                completed.snapshot.state.reviews.some(
                    (review) => review.versionId === requestedVersionId
                )
            )
                return;
            const retainedClaim = completed.snapshot.state.reviewClaims.find(
                (candidate) =>
                    candidate.id === claimId &&
                    candidate.roundId === requested.roundId &&
                    candidate.sourceEffectId === outboxItem.id &&
                    candidate.expiresAt > dependencies.clock.now()
            );
            if (!retainedClaim) retry("REVIEW_CLAIM_UNAVAILABLE");
            retry("REVIEW_CLAIM_IN_PROGRESS", false, retainedClaim.expiresAt);
        }
    };
}

interface ReviewDeliveryDispatcherDependencies extends Omit<
    EvidenceReviewDispatcherDependencies,
    "clock"
> {
    readonly application: MeetingCommandApplication;
}

function alreadySent(state: MeetingState, reviewId: string): boolean {
    return state.reviewDeliveries.some(
        (delivery) => delivery.reviewId === reviewId && delivery.status === "sent"
    );
}

export function createReviewDeliveryDispatcher(
    dependencies: ReviewDeliveryDispatcherDependencies
): { dispatch(input: DispatchEvidenceReviewInput): Promise<void> } {
    async function record(
        input: DispatchEvidenceReviewInput,
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
                await followupMeetingIdentitySession({
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
