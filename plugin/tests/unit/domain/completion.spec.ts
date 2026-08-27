import { describe, expect, it } from "vitest";
import { judgeTurnCompletion, type MeetingState } from "../../../src/domain/index.js";

const now = 1_700_000_000_000;

function state(overrides: Partial<MeetingState> = {}): MeetingState {
    return {
        id: "meeting-1",
        teamId: "team-1",
        status: "running",
        participants: [],
        manager: { promptVersion: "test", status: "idle" },
        agenda: [
            {
                id: "agenda-1",
                title: "Agenda",
                objective: "Objective",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipants: [],
                relatedTaskIds: [],
                status: "pending" as const
            }
        ],
        topic: "topic",
        objective: "objective",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [],
            hardConstraints: [],
            requiredReviewers: [],
            riskAcceptanceAuthority: [],
            acceptableRiskLevel: "low"
        },
        issues: [],
        agendaCandidates: [],
        transcript: [],
        proposals: [],
        decisions: [],
        openQuestions: [],
        handRaises: [],
        completionFacts: [],
        artifactRefs: [],
        continuationMaterials: [],
        turnSeq: 1,
        messageSeq: 1,
        eventSeq: 0,
        stallCount: 0,
        replanCount: 0,
        selectionMode: "manager",
        limits: {
            maxTurns: 3,
            maxSpeakersPerTurn: 3,
            maxTotalMessages: 10,
            maxConsecutiveSpeechesPerSpeaker: 2,
            maxConsecutiveAttemptFailuresPerParticipant: 3,
            maxDeliveryRetries: 5,
            maxStalls: 3,
            maxReplans: 1
        },
        version: 1,
        createdAt: now - 1_000,
        updatedAt: now - 1_000,
        ...overrides
    };
}

describe("judgeTurnCompletion", () => {
    it("returns continue while the objective is open", () => {
        expect(judgeTurnCompletion(state(), now)).toEqual({ kind: "continue", reason: "continue" });
    });

    it("prioritizes objective completion over every hard limit", () => {
        const completed = state({
            turnSeq: 3,
            messageSeq: 10,
            objectiveContract: {
                requiredOutputs: [{ id: "output-1", description: "output", status: "accepted" }],
                acceptanceCriteria: [
                    { id: "criterion-1", description: "criterion", satisfied: true }
                ],
                hardConstraints: [],
                requiredReviewers: [],
                riskAcceptanceAuthority: [],
                acceptableRiskLevel: "low"
            },
            agenda: [
                {
                    id: "agenda-1",
                    title: "Agenda",
                    objective: "Objective",
                    inScope: [],
                    outOfScope: [],
                    completionCriteria: [],
                    requiredParticipants: [],
                    relatedTaskIds: [],
                    status: "resolved" as const
                }
            ],
            limits: { ...state().limits, maxDurationMs: 1 }
        });
        expect(judgeTurnCompletion(completed, now)).toEqual({
            kind: "completed",
            reason: "objective_satisfied"
        });
    });

    it("returns the first matching partial limit deterministically", () => {
        expect(judgeTurnCompletion(state({ turnSeq: 3 }), now).reason).toBe("max_turns");
        expect(judgeTurnCompletion(state({ messageSeq: 10 }), now).reason).toBe("message_limit");
        expect(
            judgeTurnCompletion(state({ limits: { ...state().limits, maxDurationMs: 1 } }), now)
                .reason
        ).toBe("time_limit");
    });
});
