import { meeting, rejectedAttendanceState } from "../domain/transitions/fixtures.js";
import { materializeArchivePackage } from "@/runtime/services/meeting-archive-service.js";
import type { MeetingState } from "@/domain/model.js";
import { describe, expect, it } from "vitest";

const state = {
    formatVersion: 2,
    id: "meeting-1",
    teamId: "team-1",
    objectiveContract: {},
    artifactRefs: [],
    decisions: [
        { id: "decision-1", proposalId: "proposal-1", proposalRevision: 1, status: "accepted" }
    ],
    proposals: [],
    completionFacts: [],
    attendanceRecommendations: [],
    agenda: [],
    issues: [
        {
            id: "issue-1",
            title: "scope",
            description: "outside",
            disposition: "out_of_scope",
            status: "out_of_scope",
            relatedTaskIds: []
        }
    ],
    openQuestions: [
        {
            id: "question-1",
            text: "who?",
            affectedOutputIds: ["output-1"],
            affectedCriterionIds: ["criterion-1"],
            violatedConstraintIds: ["constraint-1"],
            status: "open"
        }
    ],
    agendaCandidates: [{ id: "candidate-1", title: "later", reason: "parking", status: "parked" }],
    transcript: [],
    participants: [{ id: "participant-1", displayName: "P", role: "reviewer" }],
    termination: { code: "objective_satisfied", finalMessage: "done", endedAt: 10 }
} as unknown as MeetingState;

describe("meeting archive materialization", () => {
    it("copies existing optional facts without fabricating fields or retaining aliases", () => {
        const source = structuredClone(state);
        const archive = materializeArchivePackage(source, 20);
        expect(archive.acceptedDecisions).toEqual([
            { id: "decision-1", proposalId: "proposal-1", proposalRevision: 1, status: "accepted" }
        ]);
        expect(archive.decisionHistory).toEqual(archive.acceptedDecisions);
        expect(archive.issues).toEqual([
            {
                id: "issue-1",
                title: "scope",
                description: "outside",
                disposition: "out_of_scope",
                status: "out_of_scope",
                relatedTaskIds: []
            }
        ]);
        expect(archive.unresolvedQuestions).toEqual([
            {
                id: "question-1",
                text: "who?",
                affectedOutputIds: ["output-1"],
                affectedCriterionIds: ["criterion-1"],
                violatedConstraintIds: ["constraint-1"],
                status: "open"
            }
        ]);
        expect(archive.parkingLot).toEqual([
            { id: "candidate-1", title: "later", reason: "parking", status: "parked" }
        ]);
        source.agendaCandidates[0].title = "mutated";
        source.issues[0].title = "mutated";

        expect(archive.parkingLot[0]?.title).toBe("later");
        expect(archive.issues[0]?.title).toBe("scope");
    });

    it("persists every Decision in history while keeping acceptedDecisions current-only", () => {
        const source = structuredClone(state);
        source.decisions = [
            {
                id: "decision-1",
                proposalId: "proposal-1",
                proposalRevision: 1,
                status: "superseded"
            },
            {
                id: "decision-2",
                proposalId: "proposal-1",
                proposalRevision: 2,
                status: "accepted"
            }
        ];

        const archive = materializeArchivePackage(source, 20);

        expect(archive.acceptedDecisions.map(({ id }) => id)).toEqual(["decision-2"]);
        expect(archive.decisionHistory.map(({ id }) => id)).toEqual(["decision-1", "decision-2"]);
    });

    it("preserves continuation source provenance without copying source runtime facts", () => {
        const source = structuredClone(state);
        source.sourceMeetingId = "source-meeting";
        source.continuationMaterials = [
            {
                sourceMeetingId: "source-meeting",
                sourceKind: "artifact",
                sourceObjectId: "artifact-1",
                summary: "Selected artifact",
                checksum: "sha256:artifact-1"
            }
        ];
        const archive = materializeArchivePackage(source, 20);

        expect(archive.sourceMeetingId).toBe("source-meeting");
        expect(archive).not.toHaveProperty("continuationMaterials");
        expect(archive).not.toHaveProperty("sourceSessionId");
    });

    it("preserves proposal revisions and their positions as formal archive facts", () => {
        const source = structuredClone(state);
        source.proposals = [
            {
                id: "proposal-1",
                title: "Storage v1",
                description: "Use files.",
                proposedBy: "participant-1",
                revision: 1,
                status: "superseded",
                agendaItemId: "agenda-1",
                positions: [
                    {
                        id: "position-old",
                        participantId: "participant-1",
                        position: "object",
                        blocking: true,
                        proposalRevision: 1
                    }
                ],
                createdAt: 1,
                updatedAt: 1
            },
            {
                id: "proposal-1",
                title: "Storage",
                description: "Use SQLite.",
                proposedBy: "participant-1",
                revision: 2,
                status: "under_review",
                agendaItemId: "agenda-1",
                positions: [
                    {
                        id: "position-1",
                        participantId: "participant-1",
                        position: "accept",
                        blocking: false,
                        proposalRevision: 2
                    }
                ],
                createdAt: 1,
                updatedAt: 2
            }
        ];
        const archive = materializeArchivePackage(source, 20);

        expect(archive.proposals).toEqual(source.proposals);
        source.proposals[1]!.positions[0]!.position = "object";
        expect(archive.proposals[1]?.positions[0]?.position).toBe("accept");
    });

    it("includes agenda candidate facts in the archive parking lot projection", () => {
        const source = structuredClone(state);
        source.agendaCandidates = [
            {
                id: "candidate-2",
                proposedBy: "participant-1",
                sourceMessageId: "message-1",
                title: "Follow-up",
                reason: "Separate discussion",
                relationToActiveAgenda: "adjacent",
                urgency: "later",
                suggestedParticipants: ["participant-1"],
                status: "pending",
                createdAt: 1
            }
        ];
        expect(materializeArchivePackage(source, 20).parkingLot).toEqual([
            {
                id: "candidate-2",
                title: "Follow-up",
                reason: "Separate discussion",
                status: "pending"
            }
        ]);
    });

    it("orders archive parking-lot candidates by creation time and then ID", () => {
        const source = structuredClone(state);
        source.agendaCandidates = [
            {
                id: "candidate-z",
                title: "Z",
                reason: "later",
                status: "pending",
                createdAt: 1
            },
            {
                id: "candidate-a",
                title: "A",
                reason: "later",
                status: "pending",
                createdAt: 2
            },
            {
                id: "candidate-b",
                title: "B",
                reason: "later",
                status: "pending",
                createdAt: 1
            }
        ];

        expect(materializeArchivePackage(source, 20).parkingLot.map(({ id }) => id)).toEqual([
            "candidate-b",
            "candidate-z",
            "candidate-a"
        ]);
    });
});

it("materializes only safe rejection facts in canonical order without aliasing", () => {
    const source = { ...rejectedAttendanceState(), termination: meeting("completed").termination };
    const archive = materializeArchivePackage(source, 200);
    expect(archive.attendanceRejections?.map((r) => r.recommendationId)).toEqual([
        "recommendation-a",
        "recommendation-b"
    ]);
    expect(Object.keys(archive.attendanceRejections![0]!).sort()).toEqual(
        [
            "recommendationId",
            "candidateId",
            "roleDefinitionId",
            "displayName",
            "agendaItemId",
            "reason",
            "rejectedAt"
        ].sort()
    );
    source.attendanceRecommendations[1]!.rejection!.reason = "changed";
    expect(archive.attendanceRejections![0]!.reason).toBe("Already covered");
    expect(
        materializeArchivePackage({ ...source, attendanceRecommendations: [] }, 200)
    ).not.toHaveProperty("attendanceRejections");
});
