import type { MeetingState } from "@/domain/meeting-state-v1.js";

export function makeRunningMeetingStateV1(): MeetingState {
    return {
        id: "meeting-v1",
        version: 1,
        createdAt: 0,
        updatedAt: 0,
        objective: {
            statement: "核对议题 A",
            requiredOutputs: [{ id: "output-v1", text: "形成公开证据", status: "pending" }],
            acceptanceCriteria: [{ id: "criterion-v1", text: "审核最终证据", status: "pending" }],
            hardConstraints: [],
            acceptableRiskLevel: "low"
        },
        lifecycle: { status: "running", changedAt: 0, changedBy: "manager-v1" },
        identities: [
            {
                id: "manager-v1",
                displayName: "manager-v1",
                roles: ["manager"],
                agendaResponsibilityIds: ["agenda-v1"],
                reviewResponsibilityIds: [],
                riskAuthority: false,
                required: true
            },
            {
                id: "contributor-v1",
                displayName: "contributor-v1",
                roles: ["contributor"],
                agendaResponsibilityIds: ["agenda-v1"],
                reviewResponsibilityIds: [],
                riskAuthority: false,
                required: true
            },
            {
                id: "reviewer-v1",
                displayName: "reviewer-v1",
                roles: ["evidence_reviewer"],
                agendaResponsibilityIds: ["agenda-v1"],
                reviewResponsibilityIds: ["agenda-v1"],
                riskAuthority: false,
                required: true
            }
        ],
        identityRecommendations: [],
        agenda: [
            {
                id: "agenda-v1",
                title: "议题 A",
                question: "证据是什么",
                status: "active",
                requiredOutputIds: ["output-v1"],
                requiredReviewerIds: ["reviewer-v1"]
            }
        ],
        agendaCandidates: [],
        rounds: [],
        opportunityRequests: [],
        pendingHandRaises: [],
        contributions: [],
        formatApprovals: [],
        completionDeclarations: [],
        evidencePackages: [],
        registrations: [],
        reviews: [],
        reviewDeliveries: [],
        publications: [],
        messages: [],
        proposals: [],
        positions: [],
        decisionCandidates: [],
        decisions: [],
        questions: [],
        issues: [],
        riskDispositions: [],
        tasks: [],
        managerPlans: [],
        privateMails: [],
        completionFacts: [],
        limits: {
            maxFormalMessages: 100,
            maxDurationMs: 3600000,
            taskDeadlineMs: 600000,
            reviewDeadlineMs: 600000,
            responseDeadlineMs: 60000
        }
    };
}
