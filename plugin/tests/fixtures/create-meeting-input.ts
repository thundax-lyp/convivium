import type { CreateMeetingInputV1 } from "@/protocol/index.js";

export function createOfflineMeetingInput(): CreateMeetingInputV1 {
    return {
        protocolVersion: 1,
        requestId: "offline-create-1",
        teamId: "offline-team",
        topic: "Offline protocol preparation",
        objective: "A presents amber-47; B cites A from the delivered public context.",
        selectionMode: "manager",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [{ key: "reference", description: "B cites A" }],
            hardConstraints: [],
            requiredReviewerKeys: [],
            riskAcceptanceAuthorityKeys: [],
            acceptableRiskLevel: "low"
        },
        agenda: [
            {
                key: "reference",
                title: "Sequential reference",
                objective: "A then B",
                inScope: ["public reference"],
                outOfScope: ["network"],
                completionCriteria: ["reference"],
                requiredParticipantKeys: ["a", "b"]
            }
        ],
        participants: [
            { participantKey: "a", displayName: "A" },
            { participantKey: "b", displayName: "B" }
        ],
        limits: {
            maxTurns: 2,
            maxSpeakersPerTurn: 2,
            maxTotalMessages: 4,
            speakerAttemptTimeoutMs: 60000
        }
    };
}
