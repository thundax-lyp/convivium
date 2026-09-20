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
} from "@/runtime/application-service/meeting-command.js";

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
                                    0: "没有可用支持，或现有证据直接反驳该判断标准。",
                                    1: "支持较弱，存在实质缺口、歧义或未经验证的假设。",
                                    2: "对限定范围内的主张有充分支持，剩余限制明确且不会推翻结论。",
                                    3: "存在强、直接且可独立核验的支持，没有实质性未解决缺口。",
                                    unable_to_assess:
                                        "给定 immutable version 与允许使用的 baseline 不足以判断该标准。"
                                },
                                dimensionCriteria: {
                                    source: "评估来源身份、出处、可检索性与保管链。",
                                    credibility: "评估可信度、方法质量、交叉印证与已披露不确定性。",
                                    completeness:
                                        "评估材料是否包含判断限定主张及其限制所需的信息。",
                                    support:
                                        "评估引用材料是否无需未声明推断即可直接支持主张及其限定条件。"
                                },
                                workerOutputSchema: workerReviewOutputSchema,
                                itemTemplate: {
                                    versionId: "copy-pending-version-id",
                                    scope: "填写非空审核范围",
                                    dimensions: Object.fromEntries(
                                        ["source", "credibility", "completeness", "support"].map(
                                            (dimension) => [
                                                dimension,
                                                {
                                                    score: "unable_to_assess",
                                                    scope: "填写非空维度范围",
                                                    reason: "填写非空判断理由",
                                                    baselineEvidenceIds: []
                                                }
                                            ]
                                        )
                                    )
                                }
                            },
                            submit: {
                                tool: "convivium_submit_review_batch",
                                toolArguments: {
                                    input: {
                                        protocolVersion: 1,
                                        meetingId: recovered.snapshot.meetingId,
                                        expectedMeetingVersion: recovered.snapshot.version,
                                        requestId: `review-batch:${outboxItem.id}`,
                                        action: {
                                            kind: "submit_review_batch",
                                            reviews: []
                                        }
                                    }
                                }
                            },
                            instructions:
                                "按顺序执行，不要解释。第一步：对每个 pending item 只调用一次 subagent，不创建 replacement worker；worker prompt 必须包含该 item、允许使用的 baseline、reviewItemRules.workerOutputSchema、scoringRubric 和 dimensionCriteria，并要求只返回一个 JSON Review item。第二步：只保留 completed 且可规范化的结果；失败、取消或不可规范化项保持待审。规范化时 dimensions 只能是 source、credibility、completeness、support 四个键，不得使用数组或 0、1、2、3 等数字键；非法 score 改为 unable_to_assess；baselineEvidenceIds 与 reviewConstraints 取交集。第三步：没有合法结果时直接结束，不调用提交工具；有合法结果时复制 submit.toolArguments，只替换 submit.toolArguments.input.action.reviews，然后调用 convivium_submit_review_batch。现在直接以 object 作为函数调用参数，不要先生成 JSON 文本；最外层参数必须直接等于 submit.toolArguments，即只有 input 一个键。input 必须是 object，不得序列化为字符串，不得添加 arguments 包装层、submit 包装层或其他键。只允许调用一次提交工具。"
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
