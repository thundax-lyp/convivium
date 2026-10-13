import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { runDueContributionDeadline } from "@/runtime/services/contribution-deadline.ts";

const workingState = () => {
    const state = makeRunningMeetingStateV1();
    state.rounds = [
        {
            id: "round-v1",
            agendaId: "agenda-v1",
            planId: "plan-v1",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            publicBaselinePublicationIds: [],
            openedAt: 1,
            status: "open",
            contributionIds: ["contribution-v1"],
            invitedContributorIds: ["contributor-v1"],
            participationResponses: [
                { contributorId: "contributor-v1", status: "raised", recordedAt: 2 }
            ]
        }
    ];
    state.contributions = [
        {
            id: "contribution-v1",
            roundId: "round-v1",
            contributorId: "contributor-v1",
            handRaise: { purpose: "取证", raisedAt: 2 },
            acceptedAt: 3,
            status: "preparing"
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
    it("does not expire a paused meeting", async () => {
        const state = workingState();
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

    it("records missing evidence at the preparation deadline", async () => {
        const state = workingState();
        const execute = vi.fn(async () => ({ kind: "accepted" as const }));
        const repository = {
            recover: async () => ({
                snapshot: { meetingId: state.id, version: state.version, state }
            })
        };
        const signal = new AbortController().signal;
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
