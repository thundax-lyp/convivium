import { describe, expect, it } from "vitest";

import {
    DomainError,
    createMeetingState,
    planRoundRobinTurn,
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
            acceptanceCriteria: [{ key: "criterion-1", description: "done" }],
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
                completionCriteria: ["criterion-1"],
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
    it("rejects an empty agenda before any meeting state exists", () => {
        expect(() => createMeetingState(input({ agenda: [] }), ids)).toThrowError(
            expect.objectContaining<Partial<DomainError>>({ code: "INVALID_CREATE_INPUT" })
        );
    });

    it("maps create specs to one complete initial MeetingState", () => {
        const state = createMeetingState(input(), ids);

        expect(state).toMatchObject({
            id: "meeting-1",
            status: "created",
            version: 0,
            selectionMode: "round_robin",
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
            managerPlanningSeq: 0,
            transcript: []
        });
        expect(state.agenda[0]?.completionCriteria).toEqual(["criterion:criterion-1"]);
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

    it("accepts every confirmed selection mode while preserving the default", () => {
        expect(createMeetingState(input(), ids).selectionMode).toBe("round_robin");
        expect(createMeetingState(input({ selectionMode: "round_robin" }), ids).selectionMode).toBe(
            "round_robin"
        );
        expect(createMeetingState(input({ selectionMode: "manager" }), ids).selectionMode).toBe(
            "manager"
        );
        expect(createMeetingState(input({ selectionMode: "rule_based" }), ids).selectionMode).toBe(
            "rule_based"
        );
        expect(createMeetingState(input({ selectionMode: "hybrid" }), ids).selectionMode).toBe(
            "hybrid"
        );
    });

    it("copies resolved continuation materials without mutating the source", () => {
        const source = {
            sourceMeetingId: "source-1",
            materials: [
                {
                    sourceMeetingId: "source-1",
                    sourceKind: "artifact" as const,
                    sourceObjectId: "artifact-1",
                    summary: "Release notes",
                    checksum: "sha256:source"
                }
            ]
        };
        const state = createMeetingState(input({ continuation: source }), ids);
        source.materials[0]!.summary = "mutated outside domain";

        expect(state.sourceMeetingId).toBe("source-1");
        expect(state.continuationMaterials).toEqual([
            {
                sourceMeetingId: "source-1",
                sourceKind: "artifact",
                sourceObjectId: "artifact-1",
                summary: "Release notes",
                checksum: "sha256:source"
            }
        ]);

        let allocations = 0;
        const recordingIds: CanonicalIdAllocator = {
            allocate: (kind, key) => {
                allocations += 1;
                return `${kind}:${key}`;
            }
        };

        const overCapacity = createMeetingState(
            input({ limits: { ...input().limits, maxSpeakersPerTurn: 1 } }),
            recordingIds
        );
        expect(overCapacity.agenda[0]?.requiredParticipants).toHaveLength(2);
        expect(allocations).toBeGreaterThan(0);
    });

    it("rejects malformed resolved continuation materials", () => {
        expect(() =>
            createMeetingState(
                input({
                    continuation: {
                        sourceMeetingId: "source-1",
                        materials: [
                            {
                                sourceMeetingId: "source-2",
                                sourceKind: "decision",
                                sourceObjectId: "decision-1",
                                summary: "Decision"
                            }
                        ]
                    }
                }),
                ids
            )
        ).toThrowError(
            expect.objectContaining<Partial<DomainError>>({ code: "INVALID_CREATE_INPUT" })
        );
    });

    it("plans a canonical round-robin turn in participant order", () => {
        const state = createMeetingState(input({ selectionMode: "round_robin" }), ids);
        state.activeAgendaItemId = "agenda:agenda-1";
        state.participants.push({
            id: "participant:participant-3",
            displayName: "Three",
            status: "available",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        });

        const plan = planRoundRobinTurn(
            state,
            { turnId: "turn-1", stepId: (participantId) => `step:${participantId}` },
            200
        );

        expect(plan).toMatchObject({
            id: "turn-1",
            seq: 1,
            agendaItemId: "agenda:agenda-1",
            intent: "explore",
            objective: "Resolve it",
            expectedOutputs: ["criterion:criterion-1"],
            prohibitedTopics: ["outside"],
            plan: ["participant:participant-1", "participant:participant-2"],
            createdAt: 200
        });
        expect(plan.steps).toEqual([
            {
                id: "step:participant:participant-1",
                speaker: "participant:participant-1",
                instruction: "Address the active agenda: Resolve it",
                reason: "round_robin_fallback",
                status: "pending"
            },
            {
                id: "step:participant:participant-2",
                speaker: "participant:participant-2",
                instruction: "Address the active agenda: Resolve it",
                reason: "round_robin_fallback",
                status: "pending"
            }
        ]);
    });

    it("plans only available unique speakers and refuses a second active plan", () => {
        const state = createMeetingState(input(), ids);
        state.activeAgendaItemId = "agenda:agenda-1";
        state.participants[1].status = "busy";
        const plan = planRoundRobinTurn(
            state,
            {
                turnId: "turn-1",
                stepId: (participantId, index) => `step:${index}:${participantId}`
            },
            200
        );

        expect(plan.plan).toEqual(["participant:participant-1"]);
        expect(plan.steps).toHaveLength(1);
        state.currentTurn = plan;
        expect(() =>
            planRoundRobinTurn(state, { turnId: "turn-2", stepId: () => "step" }, 201)
        ).toThrow(expect.objectContaining<Partial<DomainError>>({ code: "INVALID_ENTITY_STATE" }));
    });

    it("requires an active agenda and at least one available speaker", () => {
        const state = createMeetingState(input(), ids);
        expect(() =>
            planRoundRobinTurn(state, { turnId: "turn-1", stepId: () => "step" }, 200)
        ).toThrowError(
            expect.objectContaining<Partial<DomainError>>({ code: "INVALID_ENTITY_STATE" })
        );

        state.activeAgendaItemId = "agenda:agenda-1";
        for (const participant of state.participants) participant.status = "unavailable";
        expect(() =>
            planRoundRobinTurn(state, { turnId: "turn-1", stepId: () => "step" }, 200)
        ).toThrowError(
            expect.objectContaining<Partial<DomainError>>({ code: "INVALID_ENTITY_STATE" })
        );
    });
});
