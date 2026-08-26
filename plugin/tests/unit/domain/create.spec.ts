import { describe, expect, it } from "vitest";

import {
    DomainError,
    createMeetingState,
    type CanonicalIdAllocator,
    type CreateMeetingSpec
} from "../../../src/domain/index.js";

const ids: CanonicalIdAllocator = {
    allocate: (kind, key) => `${kind}:${key}`
};

function input(overrides: Partial<CreateMeetingSpec> = {}): CreateMeetingSpec {
    return {
        meetingId: "meeting-1",
        teamId: "team-1",
        topic: "Topic",
        objective: "Objective",
        promptVersion: "v1",
        objectiveContract: {
            requiredOutputs: [{ key: "output-1", description: "Output" }],
            acceptanceCriteria: [{ key: "criterion-1", description: "Criterion" }],
            hardConstraints: [{ key: "constraint-1", description: "Constraint" }],
            requiredReviewerKeys: ["participant-1"],
            riskAcceptanceAuthorityKeys: ["participant-2"],
            acceptableRiskLevel: "medium"
        },
        agenda: [
            {
                key: "agenda-1",
                title: "Agenda",
                objective: "Resolve it",
                inScope: ["scope"],
                outOfScope: ["outside"],
                completionCriteria: ["done"],
                ownerKey: "participant-1",
                requiredParticipantKeys: ["participant-1", "participant-2"]
            }
        ],
        participants: [
            { key: "participant-1", displayName: "One" },
            { key: "participant-2", displayName: "Two", role: "Reviewer" }
        ],
        limits: {
            maxTurns: 3,
            maxSpeakersPerTurn: 2,
            maxTotalMessages: 10,
            maxConsecutiveSpeechesPerSpeaker: 1,
            maxConsecutiveAttemptFailuresPerParticipant: 1,
            maxDeliveryRetries: 1,
            maxStalls: 1,
            maxReplans: 1
        },
        createdAt: 100,
        ...overrides
    };
}

describe("canonical meeting creation", () => {
    it("maps create specs to one complete initial MeetingState", () => {
        const state = createMeetingState(input(), ids);

        expect(state).toMatchObject({
            id: "meeting-1",
            status: "created",
            version: 0,
            selectionMode: "hybrid",
            manager: { promptVersion: "v1", status: "creating" },
            participants: [
                { id: "participant:participant-1", status: "available" },
                { id: "participant:participant-2", role: "Reviewer" }
            ],
            objectiveContract: {
                requiredOutputs: [{ id: "output:output-1", status: "pending" }],
                acceptanceCriteria: [{ id: "criterion:criterion-1", satisfied: false }],
                requiredReviewers: ["participant:participant-1"],
                riskAcceptanceAuthority: ["participant:participant-2"]
            },
            agenda: [
                {
                    id: "agenda:agenda-1",
                    owner: "participant:participant-1",
                    requiredParticipants: [
                        "participant:participant-1",
                        "participant:participant-2"
                    ],
                    status: "pending"
                }
            ],
            turnSeq: 0,
            messageSeq: 0,
            eventSeq: 0,
            transcript: []
        });
    });

    it("rejects duplicate keys and unresolved participant references before state exists", () => {
        expect(() =>
            createMeetingState(
                input({
                    participants: [
                        { key: "participant-1", displayName: "One" },
                        { key: "participant-1", displayName: "Duplicate" }
                    ]
                }),
                ids
            )
        ).toThrowError(
            expect.objectContaining<Partial<DomainError>>({ code: "INVALID_CREATE_INPUT" })
        );
        expect(() =>
            createMeetingState(
                input({
                    objectiveContract: {
                        ...input().objectiveContract,
                        requiredReviewerKeys: ["unknown"]
                    }
                }),
                ids
            )
        ).toThrowError(
            expect.objectContaining<Partial<DomainError>>({ code: "INVALID_CREATE_INPUT" })
        );
    });
});
