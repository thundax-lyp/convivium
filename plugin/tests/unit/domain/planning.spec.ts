import { describe, expect, it } from "vitest";
import {
    createMeetingState,
    planManagerTurn,
    planRoundRobinTurn,
    type CanonicalIdAllocator,
    type CreateMeetingSpec,
    type DomainError,
    type ManagerPlanInput
} from "../../../src/domain/index.js";

const ids: CanonicalIdAllocator = {
    allocate: (kind, key) => `${kind}:${key}`
};

function input(): CreateMeetingSpec {
    return {
        meetingId: "meeting-1",
        teamId: "team-1",
        topic: "Topic",
        objective: "Objective",
        promptVersion: "v1",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [],
            hardConstraints: [],
            requiredReviewerKeys: [],
            riskAcceptanceAuthorityKeys: [],
            acceptableRiskLevel: "low"
        },
        agenda: [
            {
                key: "agenda-1",
                title: "Agenda",
                objective: "Resolve it",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipantKeys: ["a"]
            }
        ],
        participants: [
            { key: "a", displayName: "A" },
            { key: "b", displayName: "B" },
            { key: "c", displayName: "C" }
        ],
        limits: {
            maxTurns: 3,
            maxSpeakersPerTurn: 3,
            maxTotalMessages: 10,
            maxConsecutiveSpeechesPerSpeaker: 2,
            maxConsecutiveAttemptFailuresPerParticipant: 3,
            maxDeliveryRetries: 3,
            maxStalls: 3,
            maxReplans: 1
        },
        createdAt: 100
    };
}

function plan(overrides: Partial<ManagerPlanInput> = {}): ManagerPlanInput {
    return {
        agendaItemId: "agenda:agenda-1",
        intent: "review",
        objective: "Review the proposal",
        expectedOutputs: ["review"],
        prohibitedTopics: [],
        steps: [
            { participantId: "participant:a", instruction: "Review", reason: "agenda_owner" },
            {
                participantId: "participant:c",
                instruction: "Challenge",
                reason: "manager_selected"
            },
            { participantId: "participant:b", instruction: "Summarize", reason: "manager_selected" }
        ],
        ...overrides
    };
}

function state() {
    const meeting = createMeetingState(input(), ids);
    meeting.activeAgendaItemId = "agenda:agenda-1";
    return meeting;
}

function expectInvalid(candidate: ManagerPlanInput) {
    expect(() =>
        planManagerTurn(
            state(),
            candidate,
            { turnId: "turn-1", stepId: (index) => `step-${index}` },
            200
        )
    ).toThrowError(expect.objectContaining<Partial<DomainError>>({ code: "MANAGER_PLAN_INVALID" }));
}

describe("Manager planning", () => {
    it("preserves a non-round-robin ordered plan without mutating the meeting", () => {
        const meeting = state();
        const before = structuredClone(meeting);
        const turn = planManagerTurn(
            meeting,
            plan(),
            { turnId: "turn-1", stepId: (index) => `step-${index}` },
            200
        );

        expect(turn).toMatchObject({
            id: "turn-1",
            seq: 1,
            agendaItemId: "agenda:agenda-1",
            intent: "review",
            plan: ["participant:a", "participant:c", "participant:b"],
            status: "planned",
            currentStepIndex: 0,
            createdAt: 200
        });
        expect(turn.steps.map(({ speaker, reason }) => ({ speaker, reason }))).toEqual([
            { speaker: "participant:a", reason: "agenda_owner" },
            { speaker: "participant:c", reason: "manager_selected" },
            { speaker: "participant:b", reason: "manager_selected" }
        ]);
        expect(meeting).toEqual(before);
    });

    it("rejects invalid membership, ordering constraints, and domain enums", () => {
        expectInvalid(plan({ steps: [] }));
        expectInvalid(
            plan({
                steps: [
                    {
                        participantId: "participant:a",
                        instruction: "A",
                        reason: "manager_selected"
                    },
                    {
                        participantId: "participant:a",
                        instruction: "A again",
                        reason: "manager_selected"
                    }
                ]
            })
        );
        expectInvalid(
            plan({
                steps: [
                    { participantId: "participant:c", instruction: "C", reason: "manager_selected" }
                ]
            })
        );
        expectInvalid(
            plan({
                steps: [
                    {
                        participantId: "participant:a",
                        instruction: "A",
                        reason: "manager_selected"
                    },
                    {
                        participantId: "participant:unknown",
                        instruction: "X",
                        reason: "manager_selected"
                    }
                ]
            })
        );
        expectInvalid(plan({ intent: "unknown" }));
        expectInvalid(
            plan({
                steps: [
                    { participantId: "participant:a", instruction: "A", reason: "unknown" },
                    { participantId: "participant:c", instruction: "C", reason: "manager_selected" }
                ]
            })
        );
    });
});

describe("round-robin planning", () => {
    it("prioritizes pending hand raises before the speaker limit", () => {
        const meeting = state();
        meeting.limits.maxSpeakersPerTurn = 1;
        meeting.handRaises.push({
            id: "raise-1",
            participant: "participant:c",
            reason: "new_evidence",
            summary: "Task result",
            taskIds: [],
            priority: "normal",
            createdAt: 101,
            status: "pending"
        });

        const turn = planRoundRobinTurn(
            meeting,
            { turnId: "turn-1", stepId: (participantId) => `step-${participantId}` },
            200
        );

        expect(turn.plan).toEqual(["participant:c"]);
    });
});
