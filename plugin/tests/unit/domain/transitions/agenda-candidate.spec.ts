import { describe, expect, it } from "vitest";
import { addSubmittedAgendaCandidates } from "../../../../src/domain/index.js";
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
