import { describe, expect, it } from "vitest";
import {
    addSubmittedAgendaCandidates,
    disposeAgendaCandidate
} from "../../../../src/domain/index.js";
import { now, questionState } from "./fixtures.js";

const candidate = {
    id: "delivery-1-agenda-candidate-1",
    title: " Follow-up topic ",
    reason: " Needs separate discussion ",
    relationToActiveAgenda: "adjacent" as const,
    urgency: "later" as const,
    suggestedParticipants: ["participant-2"],
    now
};

describe("addSubmittedAgendaCandidates", () => {
    it("binds the candidate to its speaker and committed source message", () => {
        const state = questionState();
        state.transcript = [{ id: "message-1" } as (typeof state.transcript)[number]];
        const result = addSubmittedAgendaCandidates(state, "participant-1", "message-1", [
            candidate
        ]);

        expect(result.state.agendaCandidates).toEqual([
            expect.objectContaining({
                id: candidate.id,
                proposedBy: "participant-1",
                sourceMessageId: "message-1",
                title: "Follow-up topic",
                reason: "Needs separate discussion",
                status: "pending",
                createdAt: now
            })
        ]);
        expect(result.state.activeAgendaItemId).toBe("agenda-1");
        expect(result.effect.events[0]).toMatchObject({
            type: "agenda_candidate.added",
            payload: { candidateId: candidate.id, proposedBy: "participant-1" }
        });
    });

    it("rejects invalid arrays without mutating state", () => {
        const state = questionState();
        state.transcript = [{ id: "message-1" } as (typeof state.transcript)[number]];
        expect(() =>
            addSubmittedAgendaCandidates(state, "participant-1", "message-1", [
                candidate,
                { ...candidate, id: "candidate-2", suggestedParticipants: ["unknown"] }
            ])
        ).toThrow();
        expect(state.agendaCandidates).toEqual([]);
        expect(state.eventSeq).toBe(0);
    });

    it("rejects duplicate suggested participants and missing source message", () => {
        const state = questionState();
        state.transcript = [{ id: "message-1" } as (typeof state.transcript)[number]];
        expect(() =>
            addSubmittedAgendaCandidates(state, "participant-1", "message-1", [
                { ...candidate, suggestedParticipants: ["participant-2", "participant-2"] }
            ])
        ).toThrow();
        expect(() =>
            addSubmittedAgendaCandidates(state, "participant-1", "missing", [candidate])
        ).toThrow();
    });
});

describe("disposeAgendaCandidate", () => {
    function stateWithCandidate() {
        const state = questionState();
        state.objectiveContract.requiredOutputs = [
            {
                id: "output-1",
                description: "Output",
                status: "pending"
            }
        ];
        state.agendaCandidates = [
            {
                id: "candidate-1",
                proposedBy: "participant-1",
                sourceMessageId: "message-1",
                title: "Follow-up",
                reason: "Separate scope",
                relationToActiveAgenda: "adjacent",
                urgency: "later",
                suggestedParticipants: ["participant-2"],
                status: "pending",
                createdAt: now
            }
        ];
        return state;
    }

    const promoteAgendaItem = {
        objective: "Decide follow-up",
        inScope: ["Follow-up"],
        outOfScope: [],
        completionCriteria: ["output-1"],
        requiredParticipants: ["participant-2"]
    };

    it("promotes atomically without changing the active agenda", () => {
        const state = stateWithCandidate();
        const result = disposeAgendaCandidate(state, {
            meetingId: "meeting-1",
            candidateId: "candidate-1",
            actorBinding: "captain:session-1",
            action: "promote",
            agendaItem: promoteAgendaItem
        });
        expect(result.state.agendaCandidates[0]?.status).toBe("promoted");
        expect(result.state.agenda).toContainEqual({
            id: "candidate-1-agenda-item",
            title: "Follow-up",
            ...promoteAgendaItem,
            relatedTaskIds: [],
            status: "pending"
        });
        expect(result.state.activeAgendaItemId).toBe("agenda-1");
        expect(result.state.eventSeq).toBe(1);
        expect(result.effect.events).toEqual([
            {
                type: "agenda_candidate.disposed",
                payload: {
                    meetingId: "meeting-1",
                    candidateId: "candidate-1",
                    action: "promote",
                    actorBinding: "captain:session-1",
                    agendaItemId: "candidate-1-agenda-item"
                }
            }
        ]);
    });

    it("parks and rejects without creating agenda items", () => {
        for (const action of ["park", "reject"] as const) {
            const result = disposeAgendaCandidate(stateWithCandidate(), {
                meetingId: "meeting-1",
                candidateId: "candidate-1",
                actorBinding: "captain:session-1",
                action
            });
            expect(result.state.agendaCandidates[0]?.status).toBe(
                action === "park" ? "parked" : "rejected"
            );
            expect(result.state.agenda).toHaveLength(1);
            expect(result.effect.events[0]?.payload).toMatchObject({ action });
        }
    });

    it("rejects non-pending and invalid promotion references without changes", () => {
        const state = stateWithCandidate();
        expect(() =>
            disposeAgendaCandidate(
                {
                    ...state,
                    agendaCandidates: state.agendaCandidates.map((item) => ({
                        ...item,
                        status: "parked" as const
                    }))
                },
                {
                    meetingId: "meeting-1",
                    candidateId: "candidate-1",
                    actorBinding: "captain:session-1",
                    action: "park"
                }
            )
        ).toThrow("agenda candidate is not pending");
        expect(() =>
            disposeAgendaCandidate(state, {
                meetingId: "meeting-1",
                candidateId: "candidate-1",
                actorBinding: "captain:session-1",
                action: "promote",
                agendaItem: { ...promoteAgendaItem, completionCriteria: ["unknown"] }
            })
        ).toThrow("agenda item references are invalid");
        expect(state.agendaCandidates[0]?.status).toBe("pending");
        expect(state.agenda).toHaveLength(1);
        expect(state.eventSeq).toBe(0);
    });

    it("rejects an existing derived agenda item id", () => {
        const state = stateWithCandidate();
        state.agenda.push({
            id: "candidate-1-agenda-item",
            title: "Existing",
            objective: "Existing",
            inScope: [],
            outOfScope: [],
            completionCriteria: [],
            requiredParticipants: [],
            relatedTaskIds: [],
            status: "pending"
        });
        expect(() =>
            disposeAgendaCandidate(state, {
                meetingId: "meeting-1",
                candidateId: "candidate-1",
                actorBinding: "captain:session-1",
                action: "promote",
                agendaItem: promoteAgendaItem
            })
        ).toThrow("agenda item already exists");
    });
});
