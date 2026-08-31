import { describe, expect, it } from "vitest";
import { applySubmittedProposalPositionClaims } from "../../../../src/domain/index.js";
import { now, questionState } from "./fixtures.js";

const proposal = {
    id: "delivery-1-proposal-1",
    title: "Use SQLite",
    description: "Persist facts locally.",
    now
};

describe("applySubmittedProposalPositionClaims", () => {
    it("creates a canonical proposal and binds its position to the caller", () => {
        const state = questionState();
        const result = applySubmittedProposalPositionClaims(
            state,
            "participant-1",
            "agenda-1",
            [proposal],
            [
                {
                    id: "delivery-1-position-1",
                    proposalId: proposal.id,
                    proposalRevision: 1,
                    position: "accept",
                    blocking: false,
                    now
                }
            ]
        );

        expect(result.state.proposals).toEqual([
            expect.objectContaining({
                id: proposal.id,
                proposedBy: "participant-1",
                revision: 1,
                status: "under_review",
                positions: [
                    expect.objectContaining({
                        id: "delivery-1-position-1",
                        participantId: "participant-1",
                        position: "accept",
                        proposalRevision: 1
                    })
                ]
            })
        ]);
        expect(result.effect.events.map(({ type }) => type)).toEqual([
            "proposal.added",
            "position.added"
        ]);
    });

    it("revises a proposal without inheriting its old positions", () => {
        const state = questionState();
        state.proposals = [
            {
                id: "proposal-1",
                title: "Old",
                description: "Old description",
                proposedBy: "participant-1",
                revision: 1,
                status: "under_review",
                agendaItemId: "agenda-1",
                positions: [
                    {
                        id: "position-1",
                        participantId: "participant-2",
                        position: "object",
                        blocking: true,
                        proposalRevision: 1
                    }
                ],
                createdAt: now - 1,
                updatedAt: now - 1
            }
        ];

        const result = applySubmittedProposalPositionClaims(
            state,
            "participant-2",
            "agenda-1",
            [
                {
                    id: "unused",
                    proposalId: "proposal-1",
                    expectedRevision: 1,
                    title: "New",
                    description: "New description",
                    now
                }
            ],
            []
        );

        expect(result.state.proposals).toEqual([
            expect.objectContaining({
                id: "proposal-1",
                title: "Old",
                description: "Old description",
                revision: 1,
                status: "superseded",
                positions: [expect.objectContaining({ id: "position-1", proposalRevision: 1 })]
            }),
            expect.objectContaining({
                id: "proposal-1",
                title: "New",
                description: "New description",
                proposedBy: "participant-1",
                revision: 2,
                status: "under_review",
                positions: []
            })
        ]);
        expect(result.effect.events[0]?.type).toBe("proposal.revised");
    });

    it("rejects invalid arrays without mutating the state", () => {
        const state = questionState();
        expect(() =>
            applySubmittedProposalPositionClaims(
                state,
                "participant-1",
                "agenda-1",
                [proposal],
                [
                    {
                        id: "position-1",
                        proposalId: proposal.id,
                        proposalRevision: 1,
                        position: "support",
                        blocking: false,
                        now
                    },
                    {
                        id: "position-2",
                        proposalId: proposal.id,
                        proposalRevision: 1,
                        position: "accept",
                        blocking: false,
                        now
                    }
                ]
            )
        ).toThrow();
        expect(state.proposals).toEqual([]);
        expect(state.eventSeq).toBe(0);
    });

    it("rejects a stale revision and a proposal creation with partial revision input", () => {
        const state = questionState();
        state.proposals = [
            {
                id: "proposal-1",
                title: "Existing",
                description: "Existing description",
                proposedBy: "participant-1",
                revision: 2,
                status: "under_review",
                agendaItemId: "agenda-1",
                positions: [],
                createdAt: now,
                updatedAt: now
            }
        ];
        expect(() =>
            applySubmittedProposalPositionClaims(
                state,
                "participant-1",
                "agenda-1",
                [{ ...proposal, proposalId: "proposal-1", expectedRevision: 1 }],
                []
            )
        ).toThrow();
        expect(() =>
            applySubmittedProposalPositionClaims(
                state,
                "participant-1",
                "agenda-1",
                [{ ...proposal, proposalId: "proposal-2" }],
                []
            )
        ).toThrow();
    });
});
