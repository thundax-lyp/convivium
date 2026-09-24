import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { createEvidenceReviewDispatcher } from "@/runtime/services/evidence-review-dispatch.js";

const outboxItem = (payload: Record<string, unknown>) => ({
    id: "effect-review-1",
    deliveryId: "effect-review-1",
    kind: "dispatch" as const,
    priority: 1,
    payload,
    attempts: 1,
    leaseOwner: "worker",
    leaseToken: "token",
    leaseDeadline: 2
});

function stateWithPendingReview() {
    const state = makeRunningMeetingStateV1();
    state.identities = state.identities.map((identity) => ({
        ...identity,
        sessionOwnershipId: `owner:${identity.id}`
    }));
    state.rounds = [
        {
            id: "round-baseline",
            agendaId: "agenda-v1",
            publicBaselinePublicationIds: [],
            openedAt: 1,
            status: "published",
            contributionIds: ["contribution-baseline"],
            publicationId: "publication-baseline"
        },
        {
            id: "round-current",
            agendaId: "agenda-v1",
            publicBaselinePublicationIds: ["publication-baseline"],
            openedAt: 4,
            status: "open",
            contributionIds: ["contribution-current"]
        }
    ];
    const version = (id: string, submittedAt: number) => ({
        id,
        ordinal: 1,
        observation: `observation:${id}`,
        interpretation: "interpretation",
        method: "method",
        falsifiers: [{ value: "falsifier", reason: "reason" }],
        uncertainties: [{ value: "uncertainty", reason: "reason" }],
        limitations: [{ value: "limitation", reason: "reason" }],
        claims: [
            {
                id: `claim:${id}`,
                statement: "claim",
                materialIds: [`material:${id}`],
                qualification: "qualification"
            }
        ],
        materials: [
            {
                id: `material:${id}`,
                kind: "document" as const,
                originator: "originator",
                originalSource: "source",
                sourcePublishedAt: "2026",
                acquiredAt: "2026",
                version: "1",
                locator: "locator",
                location: "location",
                verificationConditions: "conditions",
                limitations: "limitations",
                sharedDependencies: []
            }
        ],
        submittedAt
    });
    const baselineVersion = version("version-baseline", 2);
    const pendingVersion = version("version-pending", 5);
    const dimension = {
        score: 3 as const,
        scope: "baseline",
        reason: "verified",
        baselineEvidenceIds: []
    };
    state.evidencePackages = [
        {
            id: "package-baseline",
            roundId: "round-baseline",
            contributionId: "contribution-baseline",
            authorId: "contributor-v1",
            agendaId: "agenda-v1",
            currentVersionId: baselineVersion.id,
            versions: [baselineVersion]
        },
        {
            id: "package-pending",
            roundId: "round-current",
            contributionId: "contribution-current",
            authorId: "contributor-v1",
            agendaId: "agenda-v1",
            currentVersionId: pendingVersion.id,
            versions: [pendingVersion]
        }
    ];
    state.registrations = [
        {
            id: "registration-baseline",
            versionId: baselineVersion.id,
            status: "complete",
            createdAt: 2
        },
        {
            id: "registration-pending",
            versionId: pendingVersion.id,
            status: "complete",
            createdAt: 5
        }
    ];
    state.reviews = [
        {
            id: "review-baseline",
            versionId: baselineVersion.id,
            reviewerId: "reviewer-v1",
            baselinePublicationIds: [],
            scope: "baseline",
            dimensions: {
                source: dimension,
                credibility: dimension,
                completeness: dimension,
                support: dimension
            },
            createdAt: 3
        }
    ];
    state.publications = [
        {
            id: "publication-baseline",
            roundId: "round-baseline",
            seq: 1,
            finalVersionIds: [baselineVersion.id],
            finalReviewIds: ["review-baseline"],
            publishedAt: 3,
            exitReasons: []
        }
    ];
    const ownership = [
        {
            id: "owner:reviewer-v1",
            meetingId: state.id,
            identityId: "reviewer-v1",
            sessionId: "session:reviewer-v1",
            parentSessionId: "captain-1",
            sessionLabel: "convivium:meeting-identity:evidence_reviewer:meeting-v1:reviewer-v1",
            provider: "spawn",
            role: "evidence_reviewer" as const,
            lifecycleStatus: "active" as const,
            capabilityStatus: "active" as const,
            createdAt: 1,
            updatedAt: 1
        }
    ];
    return { state, ownership, pendingVersion, baselineVersion };
}

function claimApplication(state: ReturnType<typeof stateWithPendingReview>["state"]) {
    const execute = vi.fn(
        async (command: {
            action:
                | {
                      kind: "claim_review_batch";
                      sourceEffectId: string;
                      roundId: string;
                      versionIds: string[];
                  }
                | {
                      kind: "release_review_batch_claim";
                      roundId: string;
                      claimId: string;
                      reason: string;
                  };
        }) => {
            if (command.action.kind === "release_review_batch_claim") {
                const found = state.reviewClaims.some(
                    (claim) =>
                        claim.id === command.action.claimId &&
                        claim.roundId === command.action.roundId
                );
                if (!found)
                    return {
                        kind: "rejected" as const,
                        error: { code: "NOT_FOUND", message: "missing", retryable: false }
                    };
                state.reviewClaims = state.reviewClaims.filter(
                    (claim) => claim.id !== command.action.claimId
                );
                return {
                    kind: "accepted" as const,
                    meetingId: state.id,
                    committedVersion: 8,
                    receiptId: "receipt-release",
                    relatedIds: [command.action.claimId],
                    effects: []
                };
            }
            state.reviewClaims = state.reviewClaims.filter((claim) => claim.expiresAt > 6);
            if (state.reviewClaims.some((claim) => claim.roundId === command.action.roundId))
                return {
                    kind: "rejected" as const,
                    error: { code: "REVIEWER_CONFLICT", message: "claimed", retryable: true }
                };
            state.reviewClaims.push({
                id: "review-claim-v1",
                sourceEffectId: command.action.sourceEffectId,
                roundId: command.action.roundId,
                reviewerId: state.evidenceReviewerId,
                versionIds: command.action.versionIds,
                claimedAt: 6,
                expiresAt: 100
            });
            return {
                kind: "accepted" as const,
                meetingId: state.id,
                committedVersion: 7,
                receiptId: "receipt-claim",
                relatedIds: ["review-claim-v1", ...command.action.versionIds],
                effects: []
            };
        }
    );
    return { execute };
}

describe("evidence review request dispatcher v1", () => {
    it("delivers immutable pending versions and ordered publication baselines to the coordinator", async () => {
        const { state, ownership, pendingVersion, baselineVersion } = stateWithPendingReview();
        const application = claimApplication(state);
        const sendMessage = vi.fn(async () => {
            state.reviews.push({
                ...state.reviews[0]!,
                id: "review-pending",
                versionId: pendingVersion.id,
                baselinePublicationIds: ["publication-baseline"]
            });
            state.reviewClaims = [];
            return "message-1";
        });
        const dispatcher = createEvidenceReviewDispatcher({
            sessions: { sendMessage },
            application: application as never,
            clock: { now: () => 6 },
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: 6,
                        state,
                        createdAt: 0,
                        updatedAt: 5
                    },
                    sessionOwnership: ownership
                })
            } as never
        });

        await dispatcher.dispatch({
            outboxItem: outboxItem({
                kind: "agent_notice",
                noticeKind: "review_request",
                recipientId: "reviewer-v1",
                agendaId: "agenda-v1",
                versionId: "version-pending"
            }),
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        });
        await dispatcher.dispatch({
            outboxItem: outboxItem({
                kind: "agent_notice",
                noticeKind: "review_request",
                recipientId: "reviewer-v1",
                agendaId: "agenda-v1",
                versionId: "version-pending"
            }),
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        });

        expect(sendMessage).toHaveBeenCalledOnce();
        expect(application.execute).toHaveBeenCalledOnce();
        expect(application.execute.mock.calls[0]?.[0]).toMatchObject({
            expectedMeetingVersion: 6,
            requestId: "review-claim:effect-review-1:1",
            action: {
                kind: "claim_review_batch",
                sourceEffectId: "effect-review-1",
                roundId: "round-current",
                versionIds: ["version-pending"]
            }
        });
        const prompt = sendMessage.mock.calls[0]?.[2] as Array<{ text: string }>;
        const envelope = JSON.parse(prompt[0]!.text);
        expect(envelope).toMatchObject({
            effectId: "effect-review-1",
            meetingId: "meeting-v1",
            expectedMeetingVersion: 6,
            pending: [
                {
                    version: pendingVersion,
                    baseline: [
                        {
                            publicationId: "publication-baseline",
                            evidence: [{ version: baselineVersion, review: state.reviews[0] }]
                        }
                    ]
                }
            ]
        });
        expect(envelope.instructions).toContain("convivium_submit_review_batch");
        expect(envelope.instructions).toContain(
            "每个 pending item 只调用一次 convivium_run_review_worker"
        );
        expect(envelope.instructions).toContain("不调用通用 subagent");
        expect(envelope.instructions).toContain("reviews 必须逐项覆盖全部 pending");
        expect(envelope.instructions).toContain(
            "任一 pending item 未得到 completed 结果时直接结束"
        );
        expect(envelope.instructions).not.toContain("只保留 completed 且可规范化");
        expect(envelope.instructions).toContain(
            "convivium_run_review_worker 的 arguments 仍只有顶层 input"
        );
        expect(envelope.instructions).toContain(
            "只有 convivium_submit_review_batch 的 arguments 根对象直接使用 MeetingCommand 字段"
        );
        expect(envelope.instructions).toContain("提交工具都只允许调用一次");
        expect(envelope.instructions).toContain("与 reviewConstraints 取交集");
        expect(envelope.instructions).toContain("首轮没有 baseline 时必须保留 []");
        expect(envelope.instructions).not.toContain("fallback");
        expect(envelope.reviewConstraints).toEqual([
            {
                versionId: "version-pending",
                allowedBaselineEvidenceIds: ["version-baseline"]
            }
        ]);
        expect(envelope.reviewItemRules).toMatchObject({
            requiredDimensions: ["source", "credibility", "completeness", "support"],
            allowedScores: [0, 1, 2, 3, "unable_to_assess"],
            itemTemplate: {
                versionId: "copy-pending-version-id",
                scope: "填写非空审核范围",
                dimensions: {
                    source: {
                        score: "unable_to_assess",
                        scope: "填写非空维度范围",
                        reason: "填写非空判断理由",
                        baselineEvidenceIds: []
                    },
                    credibility: {
                        score: "unable_to_assess",
                        scope: "填写非空维度范围",
                        reason: "填写非空判断理由",
                        baselineEvidenceIds: []
                    },
                    completeness: {
                        score: "unable_to_assess",
                        scope: "填写非空维度范围",
                        reason: "填写非空判断理由",
                        baselineEvidenceIds: []
                    },
                    support: {
                        score: "unable_to_assess",
                        scope: "填写非空维度范围",
                        reason: "填写非空判断理由",
                        baselineEvidenceIds: []
                    }
                }
            },
            scoringRubric: {
                0: expect.any(String),
                1: expect.any(String),
                2: expect.any(String),
                3: expect.any(String),
                unable_to_assess: expect.any(String)
            },
            dimensionCriteria: {
                source: expect.any(String),
                credibility: expect.any(String),
                completeness: expect.any(String),
                support: expect.any(String)
            },
            workerOutputSchema: {
                type: "object",
                required: ["versionId", "scope", "dimensions"],
                additionalProperties: false
            }
        });
        expect(envelope.instructions).toContain("不得使用数组或 0、1、2、3 等数字键");
        expect(envelope.instructions).toContain("workerOutputSchema");
        expect(envelope.instructions).toContain("reviewItemRules.itemTemplate");
        expect(envelope.instructions).toContain("机器校验的 workerOutputSchema");
        expect(envelope.instructions).toContain("工具参数直接使用结构化 object");
        expect(envelope.instructions).not.toContain("replacement one-shot worker");
        expect(envelope.submit).toEqual({
            tool: "convivium_submit_review_batch",
            toolArguments: {
                protocolVersion: 1,
                meetingId: "meeting-v1",
                requestId: "review-batch:review-claim-v1",
                action: {
                    kind: "submit_review_batch",
                    roundId: "round-current",
                    claimId: "review-claim-v1",
                    reviews: []
                }
            }
        });
        expect(envelope).not.toHaveProperty("sessionId");
    });
});

describe("evidence review request dispatcher claim lifecycle", () => {
    it("releases the claim and uses bounded retry when the coordinator returns without committing", async () => {
        const { state, ownership } = stateWithPendingReview();
        const application = claimApplication(state);
        const dispatcher = createEvidenceReviewDispatcher({
            sessions: { sendMessage: vi.fn().mockResolvedValue("message-1") },
            application: application as never,
            clock: { now: () => 6 },
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: 6,
                        state,
                        createdAt: 0,
                        updatedAt: 5
                    },
                    sessionOwnership: ownership
                })
            } as never
        });

        await expect(
            dispatcher.dispatch({
                outboxItem: outboxItem({
                    kind: "agent_notice",
                    noticeKind: "review_request",
                    recipientId: "reviewer-v1",
                    agendaId: "agenda-v1",
                    versionId: "version-pending"
                }),
                parent: { id: "captain-1" } as never,
                signal: new AbortController().signal
            })
        ).rejects.toMatchObject({
            code: "REVIEW_NOT_COMPLETED",
            retryable: true,
            terminalOnAttemptLimit: true
        });
        expect(state.reviewClaims).toEqual([]);
        expect(application.execute).toHaveBeenCalledTimes(2);
        expect(application.execute.mock.calls[1]?.[0]).toMatchObject({
            requestId: "review-claim-release:review-claim-v1:dispatch_failed",
            action: {
                kind: "release_review_batch_claim",
                roundId: "round-current",
                claimId: "review-claim-v1",
                reason: "dispatch_failed"
            }
        });
    });

    it("releases the claim when the reviewer turn times out", async () => {
        const { state, ownership } = stateWithPendingReview();
        const application = claimApplication(state);
        const dispatcher = createEvidenceReviewDispatcher({
            sessions: {
                sendMessage: vi.fn().mockRejectedValue(new Error("review turn timed out"))
            },
            application: application as never,
            clock: { now: () => 6 },
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: state.version,
                        state,
                        createdAt: 0,
                        updatedAt: 5
                    },
                    sessionOwnership: ownership
                })
            } as never
        });

        await expect(
            dispatcher.dispatch({
                outboxItem: outboxItem({
                    kind: "agent_notice",
                    noticeKind: "review_request",
                    recipientId: "reviewer-v1",
                    agendaId: "agenda-v1",
                    versionId: "version-pending"
                }),
                parent: { id: "captain-1" } as never,
                signal: new AbortController().signal
            })
        ).rejects.toThrow("review turn timed out");
        expect(state.reviewClaims).toEqual([]);
        expect(application.execute).toHaveBeenCalledTimes(2);
        expect(application.execute.mock.calls[1]?.[0]).toMatchObject({
            requestId: "review-claim-release:review-claim-v1:turn_timed_out",
            action: {
                kind: "release_review_batch_claim",
                roundId: "round-current",
                claimId: "review-claim-v1",
                reason: "turn_timed_out"
            }
        });
    });

    it("allows only one dispatcher instance to wake the reviewer for an active claim", async () => {
        const { state, ownership, pendingVersion } = stateWithPendingReview();
        const application = claimApplication(state);
        let releaseFirst: (() => void) | undefined;
        const firstSend = vi.fn(
            () =>
                new Promise<string>((resolve) => {
                    releaseFirst = () => {
                        state.reviews.push({
                            ...state.reviews[0]!,
                            id: "review-pending",
                            versionId: pendingVersion.id,
                            baselinePublicationIds: ["publication-baseline"]
                        });
                        state.reviewClaims = [];
                        resolve("message-1");
                    };
                })
        );
        const secondSend = vi.fn();
        const repository = {
            recover: async () => ({
                snapshot: {
                    meetingId: state.id,
                    version: 6,
                    state,
                    createdAt: 0,
                    updatedAt: 5
                },
                sessionOwnership: ownership
            })
        } as never;
        const first = createEvidenceReviewDispatcher({
            sessions: { sendMessage: firstSend },
            application: application as never,
            clock: { now: () => 6 },
            repository
        });
        const second = createEvidenceReviewDispatcher({
            sessions: { sendMessage: secondSend },
            application: application as never,
            clock: { now: () => 6 },
            repository
        });
        const input = {
            outboxItem: outboxItem({
                kind: "agent_notice",
                noticeKind: "review_request",
                recipientId: "reviewer-v1",
                agendaId: "agenda-v1",
                versionId: "version-pending"
            }),
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        };

        const firstDispatch = first.dispatch(input);
        await vi.waitFor(() => expect(firstSend).toHaveBeenCalledOnce());
        await expect(
            second.dispatch({
                ...input,
                outboxItem: {
                    ...input.outboxItem,
                    id: "effect-review-2",
                    deliveryId: "effect-review-2"
                }
            })
        ).resolves.toBeUndefined();
        expect(secondSend).not.toHaveBeenCalled();
        await expect(second.dispatch(input)).rejects.toMatchObject({
            code: "REVIEW_CLAIM_IN_PROGRESS",
            retryable: true,
            terminalOnAttemptLimit: false,
            retryAt: 100
        });
        releaseFirst?.();
        await firstDispatch;
    });

    it("lets the source effect reclaim the batch after its claim expires", async () => {
        const { state, ownership, pendingVersion } = stateWithPendingReview();
        state.reviewClaims = [
            {
                id: "review-claim-expired",
                sourceEffectId: "effect-review-1",
                roundId: "round-current",
                reviewerId: "reviewer-v1",
                versionIds: [pendingVersion.id],
                claimedAt: 1,
                expiresAt: 5
            }
        ];
        const application = claimApplication(state);
        const sendMessage = vi.fn(async () => {
            state.reviews.push({
                ...state.reviews[0]!,
                id: "review-pending",
                versionId: pendingVersion.id,
                baselinePublicationIds: ["publication-baseline"]
            });
            state.reviewClaims = [];
            return "message-1";
        });
        const dispatcher = createEvidenceReviewDispatcher({
            sessions: { sendMessage },
            application: application as never,
            clock: { now: () => 6 },
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: 6,
                        state,
                        createdAt: 0,
                        updatedAt: 5
                    },
                    sessionOwnership: ownership
                })
            } as never
        });

        await dispatcher.dispatch({
            outboxItem: outboxItem({
                kind: "agent_notice",
                noticeKind: "review_request",
                recipientId: "reviewer-v1",
                agendaId: "agenda-v1",
                versionId: pendingVersion.id
            }),
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        });

        expect(sendMessage).toHaveBeenCalledOnce();
        expect(application.execute).toHaveBeenCalledOnce();
        expect(application.execute.mock.calls[0]?.[0]).toMatchObject({
            action: {
                kind: "claim_review_batch",
                sourceEffectId: "effect-review-1",
                versionIds: [pendingVersion.id]
            }
        });
    });

    it("does not notify when no current complete version is pending", async () => {
        const { state, ownership } = stateWithPendingReview();
        state.reviews = [
            ...state.reviews,
            { ...state.reviews[0]!, id: "review-pending", versionId: "version-pending" }
        ];
        const sendMessage = vi.fn();
        const application = claimApplication(state);
        const dispatcher = createEvidenceReviewDispatcher({
            sessions: { sendMessage },
            application: application as never,
            clock: { now: () => 6 },
            repository: {
                recover: async () => ({
                    snapshot: {
                        meetingId: state.id,
                        version: 7,
                        state,
                        createdAt: 0,
                        updatedAt: 6
                    },
                    sessionOwnership: ownership
                })
            } as never
        });
        await dispatcher.dispatch({
            outboxItem: outboxItem({
                kind: "agent_notice",
                noticeKind: "review_request",
                recipientId: "reviewer-v1",
                agendaId: "agenda-v1",
                versionId: "version-pending"
            }),
            parent: { id: "captain-1" } as never,
            signal: new AbortController().signal
        });
        expect(sendMessage).not.toHaveBeenCalled();
        expect(application.execute).not.toHaveBeenCalled();
    });
});
