export function validArchivePackage(meetingId = "meeting-1") {
    return {
        schemaVersion: 1,
        meetingId,
        teamId: "team-1",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [],
            hardConstraints: [],
            requiredReviewers: [],
            riskAcceptanceAuthority: [],
            acceptableRiskLevel: "low"
        },
        finalSummary: "done",
        artifactRefs: [],
        acceptedDecisions: [],
        decisionHistory: [],
        proposals: [],
        completionFacts: [],
        agenda: [],
        issues: [],
        unresolvedQuestions: [],
        parkingLot: [],
        formalTranscript: [],
        participantProvenance: [],
        termination: {
            code: "completed",
            reason: "done",
            decisionIds: [],
            unresolvedQuestionIds: []
        },
        endedAt: 1,
        materializedAt: 1
    };
}

export function validArchivedProjection() {
    return {
        meetingId: "meeting-1",
        meetingVersion: 1,
        topic: "Release",
        objective: "Decide scope",
        continuationMaterials: [],
        limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
        status: "archived",
        pendingHandRaises: [],
        pauseControl: { action: "none" },
        termination: {
            code: "completed",
            reason: "done",
            decisionIds: [],
            unresolvedQuestionIds: []
        },
        archive: { package: validArchivePackage(), archivedAt: 1 }
    };
}
