import type { MeetingProposal } from "@/domain/model.js";
import type { ArchivePackage, MeetingState } from "@/domain/index.js";

export const now = 1_700_000_000_000;

export function meeting(status: MeetingState["status"] = "created"): MeetingState {
    return {
        formatVersion: 2,
        id: "meeting-1",
        teamId: "team-1",
        status,
        participants: [],
        manager: { promptVersion: "test", status: "idle" },
        agenda: [],
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
        decisionCandidates: [],
        decisions: [],
        openQuestions: [],
        handRaises: [],
        completionFacts: [],
        attendanceRecommendations: [],
        artifactRefs: [],
        continuationMaterials: [],
        turnSeq: 0,
        messageSeq: 0,
        eventSeq: 0,
        managerPlanningSeq: 0,
        stallCount: 0,
        replanCount: 0,
        selectionMode: "hybrid",
        limits: {
            maxTurns: 10,
            maxSpeakersPerTurn: 5,
            maxTotalMessages: 100,
            maxConsecutiveSpeechesPerSpeaker: 2,
            maxConsecutiveAttemptFailuresPerParticipant: 3,
            maxDeliveryRetries: 5,
            maxStalls: 3,
            maxReplans: 1
        },
        version: 3,
        createdAt: now - 1000,
        updatedAt: now - 1000,
        termination: [
            "completed",
            "partial",
            "no_consensus",
            "cancelled",
            "failed",
            "archiving"
        ].includes(status)
            ? {
                  code: "objective_satisfied",
                  reason: "done",
                  decisionIds: [],
                  unresolvedQuestionIds: [],
                  dissentingPositionIds: [],
                  blockingAgendaItemIds: [],
                  finalMessage: "done",
                  endedAt: now
              }
            : undefined
    };
}

export function archivePackage(): ArchivePackage {
    return {
        schemaVersion: 1,
        meetingId: "meeting-1",
        teamId: "team-1",
        objectiveContract: meeting().objectiveContract,
        finalSummary: "summary",
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
            code: "objective_satisfied",
            reason: "done",
            decisionIds: [],
            unresolvedQuestionIds: [],
            dissentingPositionIds: [],
            blockingAgendaItemIds: [],
            finalMessage: "done",
            endedAt: now
        },
        endedAt: now,
        materializedAt: now
    };
}

export function rejectedAttendanceState(): MeetingState {
    const state = meeting("running");
    state.meetingTasks = [];
    const recommendation = {
        id: "recommendation-1",
        candidateId: "candidate-1",
        roleDefinitionId: "domain_architect",
        roleDefinitionVersion: "1",
        displayName: "Architect",
        agentDefinitionId: "private-definition",
        agendaItemId: "agenda-1",
        rationale: "Review",
        expectedContribution: "Review scope",
        evidenceGapIds: [],
        urgency: "current_agenda" as const,
        recommendedByManagerSessionId: "manager-session",
        catalogId: "catalog-1",
        catalogVersion: "1",
        planningAttemptId: "planning-1",
        status: "pending" as const,
        createdAt: 1
    };
    state.attendanceRecommendations = [
        {
            ...recommendation,
            id: "recommendation-b",
            status: "rejected",
            rejection: {
                requestId: "reject-b",
                actorBinding: "captain:private-session",
                reason: "Outside scope",
                rejectedAt: 100
            }
        },
        {
            ...recommendation,
            id: "recommendation-a",
            status: "rejected",
            rejection: {
                requestId: "reject-a",
                actorBinding: "captain:private-session",
                reason: "Already covered",
                rejectedAt: 101
            }
        },
        { ...recommendation, id: "pending", createdAt: 2 }
    ];
    return state;
}

export function attemptContext() {
    return {
        attemptId: "attempt-1",
        participantId: "participant-1",
        meetingId: "meeting-1",
        turnId: "turn-1",
        stepId: "step-1",
        deliveryId: "delivery-1"
    };
}

export function managerAttemptContext() {
    return {
        attemptId: "plan-1",
        meetingId: "meeting-1",
        deliveryId: "manager-delivery-1"
    };
}

export function questionState(): MeetingState {
    const state = meeting("running");
    state.participants = [
        {
            id: "participant-1",
            displayName: "One",
            status: "available",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        },
        {
            id: "participant-2",
            displayName: "Two",
            status: "available",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        }
    ];
    state.agenda = [
        {
            id: "agenda-1",
            title: "Agenda",
            objective: "Discuss",
            inScope: [],
            outOfScope: [],
            completionCriteria: [],
            requiredParticipants: [],
            relatedTaskIds: [],
            status: "discussing"
        }
    ];
    state.activeAgendaItemId = "agenda-1";
    return state;
}

export function proposalWithBlockingPosition(
    id: string,
    participantId: string,
    revision = 1
): MeetingProposal {
    return {
        id,
        agendaItemId: "agenda-1",
        revision,
        title: id,
        description: id,
        status: "under_review",
        proposedBy: participantId,
        createdAt: now,
        updatedAt: now,
        positions: [
            {
                id: `pos-${id}`,
                participantId,
                proposalRevision: revision,
                position: "object",
                blocking: true
            }
        ]
    };
}
