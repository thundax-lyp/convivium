import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import type { EvidenceVersion } from "@/domain/index.js";
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
    const version = (id: string, submittedAt: number): EvidenceVersion => ({
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
        submittedAt,
        status: "submitted" as const,
        failureCount: 0
    });
    const baselineVersion = version("version-baseline", 2);
    baselineVersion.status = "validated";
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
            definition: { agentDefinitionId: "fixture", definitionVersion: "1" },
            sessionLabel: "convivium:meeting-identity:evidence_reviewer:meeting-v1:reviewer-v1",
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
                      kind: "claim_evidence_review";
                      sourceEffectId: string;
                      roundId: string;
                      versionId: string;
                  }
                | {
                      kind: "fail_evidence_validation";
                      roundId: string;
                      claimId: string;
                      reason: string;
                  };
        }) => {
            if (command.action.kind === "fail_evidence_validation") {
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
                for (const pkg of state.evidencePackages)
                    for (const version of pkg.versions)
                        if (version.id === "version-pending") {
                            version.status = "validation_failed";
                            version.failureCount += 1;
                            version.lastFailureReason = command.action.reason as "review_timeout";
                        }
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
            if (state.reviewClaims.some((claim) => claim.versionId === command.action.versionId))
                return {
                    kind: "rejected" as const,
                    error: { code: "REVIEWER_CONFLICT", message: "claimed", retryable: true }
                };
            state.reviewClaims.push({
                id: "review-claim-v1",
                sourceEffectId: command.action.sourceEffectId,
                roundId: command.action.roundId,
                reviewerId: state.evidenceReviewerId,
                versionId: command.action.versionId,
                claimedAt: 6,
                expiresAt: 100
            });
            for (const pkg of state.evidencePackages)
                for (const version of pkg.versions)
                    if (version.id === command.action.versionId) version.status = "validating";
            return {
                kind: "accepted" as const,
                meetingId: state.id,
                committedVersion: 7,
                receiptId: "receipt-claim",
                relatedIds: ["review-claim-v1", command.action.versionId],
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
        const deliver = vi.fn(async () => {
            state.reviews.push({
                ...state.reviews[0]!,
                id: "review-pending",
                versionId: pendingVersion.id,
                baselinePublicationIds: ["publication-baseline"]
            });
            pendingVersion.status = "validated";
            state.reviewClaims = [];
            return true;
        });
        const dispatcher = createEvidenceReviewDispatcher({
            definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
            owner: { resume: vi.fn(async () => {}), deliver },
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
            signal: new AbortController().signal
        });

        expect(deliver).toHaveBeenCalledOnce();
        expect(application.execute).toHaveBeenCalledOnce();
        expect(application.execute.mock.calls[0]?.[0]).toMatchObject({
            expectedMeetingVersion: 6,
            requestId: "review-claim:effect-review-1:1",
            action: {
                kind: "claim_evidence_review",
                sourceEffectId: "effect-review-1",
                roundId: "round-current",
                versionId: "version-pending"
            }
        });
        const prompt = [{ text: deliver.mock.calls[0]?.[0].text }];
        const envelope = JSON.parse(prompt[0]!.text);
        expect(envelope).toMatchObject({
            effectId: "effect-review-1",
            meetingId: "meeting-v1",
            expectedMeetingVersion: 6,
            pending: {
                version: { ...pendingVersion, status: "validating" },
                baseline: [
                    {
                        publicationId: "publication-baseline",
                        evidence: [{ version: baselineVersion, review: state.reviews[0] }]
                    }
                ]
            }
        });
        expect(envelope.instructions).toContain("convivium_submit_evidence_review");
        expect(envelope.instructions).toContain("只调用一次 convivium_run_review_worker");
        expect(envelope.instructions).toContain("不调用通用 subagent");
        expect(envelope.instructions).toContain("未得到 completed 结果时直接结束");
        expect(envelope.instructions).not.toContain("只保留 completed 且可规范化");
        expect(envelope.instructions).toContain(
            "convivium_run_review_worker 的 arguments 仍只有顶层 input"
        );
        expect(envelope.instructions).toContain(
            "工具 arguments 根对象直接使用 MeetingCommand 字段"
        );
        expect(envelope.instructions).toContain("提交工具都只允许调用一次");
        expect(envelope.instructions).toContain("与 reviewConstraint 取交集");
        expect(envelope.instructions).toContain("首轮没有 baseline 时必须保留 []");
        expect(envelope.instructions).not.toContain("fallback");
        expect(envelope.reviewConstraint).toEqual({
            versionId: "version-pending",
            allowedBaselineEvidenceIds: ["version-baseline"]
        });
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
        expect(envelope.instructions).toContain(
            "dimensions 只能是 source、credibility、completeness、support 四个键"
        );
        expect(envelope.instructions).toContain("workerOutputSchema");
        expect(envelope.instructions).toContain("reviewItemRules.itemTemplate");
        expect(envelope.instructions).toContain("机器校验的 workerOutputSchema");
        expect(envelope.instructions).toContain("工具参数直接使用结构化 object");
        expect(envelope.instructions).not.toContain("replacement one-shot worker");
        expect(envelope.submit).toEqual({
            tool: "convivium_submit_evidence_review",
            toolArguments: {
                protocolVersion: 1,
                meetingId: "meeting-v1",
                requestId: "evidence-review:review-claim-v1",
                action: {
                    kind: "submit_evidence_review",
                    roundId: "round-current",
                    claimId: "review-claim-v1",
                    versionId: "version-pending",
                    dimensions: {},
                    scope: ""
                }
            }
        });
        expect(envelope).not.toHaveProperty("sessionId");
    });
});

describe("evidence review request dispatcher claim lifecycle", () => {
    it("preserves the claim until expiry when inbox acceptance does not prove turn completion", async () => {
        const { state, ownership } = stateWithPendingReview();
        const application = claimApplication(state);
        const dispatcher = createEvidenceReviewDispatcher({
            definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
            owner: {
                resume: vi.fn(async () => {}),
                deliver: vi.fn().mockResolvedValue(true)
            },
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
                signal: new AbortController().signal
            })
        ).rejects.toMatchObject({
            code: "REVIEW_CLAIM_IN_PROGRESS",
            retryable: true,
            terminalOnAttemptLimit: false,
            retryAt: 100
        });
        expect(state.reviewClaims).toEqual([
            expect.objectContaining({
                id: "review-claim-v1",
                sourceEffectId: "effect-review-1",
                expiresAt: 100
            })
        ]);
        expect(application.execute).toHaveBeenCalledOnce();
    });

    it("releases the claim when the reviewer turn times out", async () => {
        const { state, ownership } = stateWithPendingReview();
        const application = claimApplication(state);
        const dispatcher = createEvidenceReviewDispatcher({
            definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
            owner: {
                resume: vi.fn(async () => {}),
                deliver: vi.fn().mockRejectedValue(new Error("review turn timed out"))
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
                signal: new AbortController().signal
            })
        ).rejects.toMatchObject({
            code: "REVIEW_VALIDATION_RETRY",
            retryable: true,
            terminalOnAttemptLimit: false
        });
        expect(state.reviewClaims).toEqual([]);
        expect(application.execute).toHaveBeenCalledTimes(2);
        expect(application.execute.mock.calls[1]?.[0]).toMatchObject({
            requestId: "review-claim-release:review-claim-v1:review_timeout",
            action: {
                kind: "fail_evidence_validation",
                roundId: "round-current",
                claimId: "review-claim-v1",
                reason: "review_timeout"
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
            definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
            owner: { resume: vi.fn(async () => {}), deliver: firstSend },
            application: application as never,
            clock: { now: () => 6 },
            repository
        });
        const second = createEvidenceReviewDispatcher({
            definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
            owner: { resume: vi.fn(async () => {}), deliver: secondSend },
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
});

describe("evidence review request dispatcher recovery", () => {
    it("records review_timeout when a claim expires before a later retry", async () => {
        const { state, ownership, pendingVersion } = stateWithPendingReview();
        state.reviewClaims = [
            {
                id: "review-claim-expired",
                sourceEffectId: "effect-review-1",
                roundId: "round-current",
                reviewerId: "reviewer-v1",
                versionId: pendingVersion.id,
                claimedAt: 1,
                expiresAt: 5
            }
        ];
        const application = claimApplication(state);
        const deliver = vi.fn(async () => {
            state.reviews.push({
                ...state.reviews[0]!,
                id: "review-pending",
                versionId: pendingVersion.id,
                baselinePublicationIds: ["publication-baseline"]
            });
            state.reviewClaims = [];
            return true;
        });
        const dispatcher = createEvidenceReviewDispatcher({
            definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
            owner: { resume: vi.fn(async () => {}), deliver },
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
                    versionId: pendingVersion.id
                }),
                signal: new AbortController().signal
            })
        ).rejects.toMatchObject({
            code: "REVIEW_VALIDATION_RETRY",
            retryable: true,
            terminalOnAttemptLimit: false
        });

        expect(deliver).not.toHaveBeenCalled();
        expect(application.execute).toHaveBeenCalledOnce();
        expect(application.execute.mock.calls[0]?.[0]).toMatchObject({
            requestId: "review-claim-release:review-claim-expired:review_timeout",
            action: {
                kind: "fail_evidence_validation",
                claimId: "review-claim-expired",
                reason: "review_timeout"
            }
        });
    });

    it("does not notify when no current complete version is pending", async () => {
        const { state, ownership } = stateWithPendingReview();
        state.reviews = [
            ...state.reviews,
            { ...state.reviews[0]!, id: "review-pending", versionId: "version-pending" }
        ];
        state.evidencePackages[1]!.versions[0]!.status = "validated";
        const deliver = vi.fn();
        const application = claimApplication(state);
        const dispatcher = createEvidenceReviewDispatcher({
            definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
            owner: { resume: vi.fn(async () => {}), deliver },
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
            signal: new AbortController().signal
        });
        expect(deliver).not.toHaveBeenCalled();
        expect(application.execute).not.toHaveBeenCalled();
    });

    it("parks a review request while the Meeting is paused", async () => {
        const { state, ownership } = stateWithPendingReview();
        state.lifecycle = { status: "paused", changedAt: 6, reason: "人工暂停" };
        const application = claimApplication(state);
        const deliver = vi.fn();
        const dispatcher = createEvidenceReviewDispatcher({
            definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
            owner: { resume: vi.fn(async () => {}), deliver },
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
                signal: new AbortController().signal
            })
        ).rejects.toMatchObject({
            code: "INVALID_STATE",
            retryable: true,
            terminalOnAttemptLimit: false
        });
        expect(application.execute).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
    });

    it.each(["terminal", "archiving", "archived"] as const)(
        "settles obsolete review requests in %s without blocking archive",
        async (status) => {
            const { state, ownership } = stateWithPendingReview();
            state.lifecycle = { status, changedAt: 6, reason: "会议已结束" };
            const application = claimApplication(state);
            const deliver = vi.fn();
            const dispatcher = createEvidenceReviewDispatcher({
                definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
                owner: { resume: vi.fn(async () => {}), deliver },
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
                    signal: new AbortController().signal
                })
            ).rejects.toMatchObject({
                code: "INVALID_STATE",
                retryable: false
            });
            expect(application.execute).not.toHaveBeenCalled();
            expect(deliver).not.toHaveBeenCalled();
        }
    );
});
