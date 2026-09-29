import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { runDueContributionDeadline } from "@/runtime/services/contribution-deadline.ts";

const deliveredState = () => {
    const state = makeRunningMeetingStateV1();
    state.rounds = [
        {
            id: "round-v1",
            agendaId: "agenda-v1",
            publicBaselinePublicationIds: [],
            openedAt: 1,
            status: "open",
            contributionIds: ["contribution-v1"]
        }
    ];
    state.contributions = [
        {
            id: "contribution-v1",
            roundId: "round-v1",
            contributorId: "contributor-v1",
            handRaise: { purpose: "取证", raisedAt: 2 },
            acceptedAt: 3,
            status: "awaiting_response",
            packageId: "package-v1",
            substantiveSupplementCount: 0
        }
    ];
    state.evidencePackages = [
        {
            id: "package-v1",
            roundId: "round-v1",
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            agendaId: "agenda-v1",
            currentVersionId: "version-v1",
            versions: [
                {
                    id: "version-v1",
                    ordinal: 1,
                    submittedAt: 5,
                    status: "validated",
                    failureCount: 0,
                    observation: "观察",
                    interpretation: "解释",
                    method: "方法",
                    falsifiers: [],
                    uncertainties: [],
                    limitations: [],
                    claims: [],
                    materials: []
                }
            ]
        }
    ];
    state.reviews = [
        {
            id: "review-v1",
            versionId: "version-v1",
            reviewerId: "reviewer-v1",
            dimensions: {
                source: { score: 1, scope: "本轮", reason: "已核对", baselineEvidenceIds: [] },
                credibility: { score: 1, scope: "本轮", reason: "已核对", baselineEvidenceIds: [] },
                completeness: {
                    score: 1,
                    scope: "本轮",
                    reason: "已核对",
                    baselineEvidenceIds: []
                },
                support: { score: 1, scope: "本轮", reason: "已核对", baselineEvidenceIds: [] }
            },
            scope: "本轮",
            createdAt: 6
        }
    ];
    state.reviewDeliveries = [
        {
            id: "delivery-v1",
            reviewId: "review-v1",
            authorId: "contributor-v1",
            status: "sent",
            sentAt: 10
        }
    ];
    return state;
};

describe("contribution deadline recovery", () => {
    it("records an unanswered round invitation through the trusted deadline handler", async () => {
        const state = makeRunningMeetingStateV1();
        state.rounds = [
            {
                id: "round-v1",
                agendaId: "agenda-v1",
                publicBaselinePublicationIds: [],
                openedAt: 10,
                deadlineAt: 20,
                status: "open",
                contributionIds: [],
                invitedContributorIds: ["contributor-v1"],
                participationResponses: []
            }
        ];
        const recover = vi.fn(async () => ({
            snapshot: {
                meetingId: state.id,
                version: state.version,
                state
            }
        }));
        const execute = vi.fn(async () => ({ kind: "accepted" as const }));
        const application = { execute } as never;
        const repository = { recover } as never;
        const signal = new AbortController().signal;
        await runDueContributionDeadline(repository, application, 19, signal);
        expect(execute).not.toHaveBeenCalled();
        await runDueContributionDeadline(repository, application, 20, signal);
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                action: {
                    kind: "expire_round_participation",
                    roundId: "round-v1",
                    contributorId: "contributor-v1"
                }
            }),
            expect.objectContaining({
                caller: expect.objectContaining({ channel: "deadline_handler" })
            }),
            signal
        );
    });
    it("records timeout at the response deadline with the trusted caller", async () => {
        const state = deliveredState();
        const recover = vi.fn(async () => ({
            snapshot: { meetingId: state.id, version: state.version, state }
        }));
        const execute = vi.fn(async () => ({ kind: "accepted" as const }));
        const signal = new AbortController().signal;

        await runDueContributionDeadline({ recover } as never, { execute } as never, 60009, signal);
        expect(execute).not.toHaveBeenCalled();
        await runDueContributionDeadline({ recover } as never, { execute } as never, 60010, signal);
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                meetingId: state.id,
                expectedMeetingVersion: state.version,
                action: {
                    kind: "close_contribution",
                    contributionId: "contribution-v1",
                    exit: "timed_out",
                    reason: expect.any(String)
                }
            }),
            {
                caller: { channel: "deadline_handler", principalId: "deadline-handler" }
            },
            signal
        );
    });

    it("does not time out a paused meeting", async () => {
        const state = deliveredState();
        state.lifecycle = {
            status: "paused",
            changedAt: 20,
            changedBy: "manager-v1",
            reason: "暂停"
        };
        const execute = vi.fn();
        await runDueContributionDeadline(
            {
                recover: async () => ({
                    snapshot: { meetingId: state.id, version: state.version, state }
                })
            } as never,
            { execute } as never,
            60010,
            new AbortController().signal
        );
        expect(execute).not.toHaveBeenCalled();
    });

    it("records missing evidence at the preparation deadline but never times out undelivered review", async () => {
        const state = deliveredState();
        state.reviewDeliveries = [];
        const execute = vi.fn(async () => ({ kind: "accepted" as const }));
        const repository = {
            recover: async () => ({
                snapshot: { meetingId: state.id, version: state.version, state }
            })
        };
        const signal = new AbortController().signal;
        await runDueContributionDeadline(repository as never, { execute } as never, 700000, signal);
        expect(execute).not.toHaveBeenCalled();

        state.contributions[0] = {
            ...state.contributions[0]!,
            status: "preparing",
            packageId: undefined
        };
        await runDueContributionDeadline(repository as never, { execute } as never, 600002, signal);
        expect(execute).not.toHaveBeenCalled();
        await runDueContributionDeadline(repository as never, { execute } as never, 600003, signal);
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                action: {
                    kind: "close_contribution",
                    contributionId: "contribution-v1",
                    exit: "submission_missing",
                    reason: expect.any(String)
                }
            }),
            expect.anything(),
            signal
        );
    });
});
