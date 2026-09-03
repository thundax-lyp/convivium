import { describe, expect, it } from "vitest";
import {
    createProgressFingerprint,
    hasBlockingDisagreement
} from "../../../../src/domain/transitions/turn-advancement.js";
import { meeting, now } from "./fixtures.js";

describe("convergence progress fingerprint", () => {
    it("is stable for canonical array order and changes for each structured component", () => {
        const state = meeting();
        state.agenda = [
            {
                id: "agenda-1",
                title: "Agenda",
                objective: "Objective",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipants: [],
                relatedTaskIds: [],
                status: "discussing"
            }
        ];
        state.activeAgendaItemId = "agenda-1";
        state.meetingTasks = [];
        const first = createProgressFingerprint(state);
        state.continuationMaterials = [
            {
                sourceMeetingId: "meeting-0",
                sourceKind: "evidence",
                summary: "ignored"
            }
        ];
        expect(createProgressFingerprint(state)).toBe(first);
        state.agenda[0]!.resolution = "resolved";
        expect(createProgressFingerprint(state)).not.toBe(first);
    });

    it("detects only current open blocking questions and positions", () => {
        const state = meeting();
        state.openQuestions = [
            {
                id: "question-1",
                text: "Blocking",
                askedBy: "participant-1",
                agendaItemId: "agenda-1",
                blocking: true,
                affectedOutputIds: [],
                affectedCriterionIds: [],
                violatedConstraintIds: [],
                status: "open",
                createdAt: now
            }
        ];
        expect(hasBlockingDisagreement(state)).toBe(true);
        state.openQuestions[0]!.status = "answered";
        expect(hasBlockingDisagreement(state)).toBe(false);
    });
});
