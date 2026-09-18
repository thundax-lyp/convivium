import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { createEvidenceReviewDispatcherV1 } from "@/runtime/services/evidence-review-dispatch-v1.js";

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

describe("evidence review request dispatcher v1", () => {
    it("delivers immutable pending versions and ordered publication baselines to the coordinator", async () => {
        const { state, ownership, pendingVersion, baselineVersion } = stateWithPendingReview();
        const sendMessage = vi.fn().mockResolvedValue("message-1");
        const dispatcher = createEvidenceReviewDispatcherV1({
            sessions: { sendMessage },
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
        expect(envelope.instructions).toContain("call subagent once for every pending item");
        expect(envelope.instructions).toContain("intersection with reviewConstraints");
        expect(envelope.reviewConstraints).toEqual([
            {
                versionId: "version-pending",
                allowedBaselineEvidenceIds: ["version-baseline"]
            }
        ]);
        expect(envelope.reviewItemRules).toEqual({
            requiredDimensions: ["source", "credibility", "completeness", "support"],
            allowedScores: [0, 1, 2, 3, "unable_to_assess"],
            itemTemplate: {
                versionId: "copy-pending-version-id",
                scope: "non-empty-review-scope",
                dimensions: {
                    source: {
                        score: "unable_to_assess",
                        scope: "non-empty-dimension-scope",
                        reason: "non-empty-reason",
                        baselineEvidenceIds: []
                    },
                    credibility: {
                        score: "unable_to_assess",
                        scope: "non-empty-dimension-scope",
                        reason: "non-empty-reason",
                        baselineEvidenceIds: []
                    },
                    completeness: {
                        score: "unable_to_assess",
                        scope: "non-empty-dimension-scope",
                        reason: "non-empty-reason",
                        baselineEvidenceIds: []
                    },
                    support: {
                        score: "unable_to_assess",
                        scope: "non-empty-dimension-scope",
                        reason: "non-empty-reason",
                        baselineEvidenceIds: []
                    }
                }
            }
        });
        expect(envelope.instructions).toContain("Never use an array or numeric keys");
        expect(envelope.submit).toEqual({
            tool: "convivium_submit_review_batch",
            input: {
                protocolVersion: 1,
                meetingId: "meeting-v1",
                expectedMeetingVersion: 6,
                requestId: "review-batch:effect-review-1",
                action: {
                    kind: "submit_review_batch",
                    reviews: "replace-with-valid-completed-review-items"
                }
            }
        });
        expect(envelope).not.toHaveProperty("sessionId");
    });

    it("does not notify when no current complete version is pending", async () => {
        const { state, ownership } = stateWithPendingReview();
        state.reviews = [
            ...state.reviews,
            { ...state.reviews[0]!, id: "review-pending", versionId: "version-pending" }
        ];
        const sendMessage = vi.fn();
        const dispatcher = createEvidenceReviewDispatcherV1({
            sessions: { sendMessage },
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
    });
});
