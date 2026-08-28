import { materializeArchivePackage } from "../../../src/runtime/archive.js";
import type { MeetingState } from "../../../src/domain/model.js";
import { describe, expect, it } from "vitest";

const state = {
    id: "meeting-1",
    teamId: "team-1",
    objectiveContract: {},
    artifactRefs: [],
    decisions: [
        { id: "decision-1", proposalId: "proposal-1", proposalRevision: 1, status: "accepted" }
    ],
    proposals: [],
    completionFacts: [],
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
    openQuestions: [{ id: "question-1", text: "who?", status: "open" }],
    agendaCandidates: [{ id: "candidate-1", title: "later", reason: "parking", status: "parked" }],
    transcript: [],
    participants: [{ id: "participant-1", displayName: "P", role: "reviewer" }],
    termination: { code: "objective_satisfied", finalMessage: "done", endedAt: 10 }
} as unknown as MeetingState;

describe("materializeArchivePackage", () => {
    it("copies existing optional facts without fabricating missing fields", () => {
        const archive = materializeArchivePackage(state, 20);
        expect(archive.acceptedDecisions).toEqual([
            { id: "decision-1", proposalId: "proposal-1", proposalRevision: 1, status: "accepted" }
        ]);
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
            { id: "question-1", text: "who?", status: "open" }
        ]);
        expect(archive.parkingLot).toEqual([
            { id: "candidate-1", title: "later", reason: "parking", status: "parked" }
        ]);
    });
});
