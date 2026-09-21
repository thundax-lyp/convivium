import type { CreateMeetingInput } from "@/protocol/index.js";

export function createOfflineMeetingInput(): CreateMeetingInput {
    return {
        protocolVersion: 1,
        requestId: "offline-create-1",
        teamId: "offline-team",
        topic: "Offline protocol preparation",
        objective: "A presents amber-47; B cites A from the delivered public context.",
        evidenceReviewerKey: "b",
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
                relatedTaskIds: [],
                requiredParticipantKeys: ["a", "b"]
            }
        ],
        participants: [
            { participantKey: "a", displayName: "A" },
            { participantKey: "b", displayName: "B" }
        ],
        limits: {
            maxTotalMessages: 4
        }
    };
}
