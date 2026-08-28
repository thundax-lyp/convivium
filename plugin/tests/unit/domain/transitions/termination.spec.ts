import { describe, expect, it } from "vitest";

import { DomainError, endMeeting } from "../../../../src/domain/index.js";
import { meeting, now } from "./fixtures.js";

describe("meeting termination", () => {
    it.each([
        ["completed", "objective_satisfied"],
        ["partial", "captain_accepted"],
        ["cancelled", "user_cancelled"]
    ] as const)("ends a meeting as %s", (outcome, terminationCode) => {
        const result = endMeeting(meeting("running"), {
            meetingId: "meeting-1",
            captainBinding: "captain:captain-1",
            outcome,
            reason: "Captain ended the meeting",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: [],
            now,
            factId: (index) => `waiver-${index}`
        });

        expect(result.state).toMatchObject({
            status: outcome,
            version: 4,
            currentTurn: undefined,
            termination: { code: terminationCode, reason: "Captain ended the meeting" }
        });
        expect(result.effect.events.map(({ type }) => type)).toContain("meeting.ended");
    });

    it("preserves unresolved facts for no-consensus termination", () => {
        const state = meeting("running");
        state.agenda = [
            {
                id: "agenda-1",
                title: "Agenda",
                objective: "Decide",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipants: [],
                relatedTaskIds: [],
                status: "blocked"
            }
        ];
        state.openQuestions = [
            {
                id: "question-1",
                text: "Still open",
                askedBy: "participant-1",
                agendaItemId: "agenda-1",
                blocking: true,
                createdAt: now,
                status: "open"
            }
        ];

        const result = endMeeting(state, {
            meetingId: state.id,
            captainBinding: "captain:captain-1",
            outcome: "no_consensus",
            reason: "A blocking question remains",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: [],
            now,
            factId: (index) => `waiver-${index}`
        });

        expect(result.state.termination).toMatchObject({
            code: "no_consensus",
            unresolvedQuestionIds: ["question-1"],
            blockingAgendaItemIds: ["agenda-1"]
        });
    });

    it("records partial waivers and revokes active execution", () => {
        const state = meeting("running");
        state.objectiveContract.requiredReviewers = ["reviewer-1"];
        state.agenda = [
            {
                id: "agenda-1",
                title: "Agenda",
                objective: "Decide",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipants: [],
                relatedTaskIds: [],
                status: "discussing"
            }
        ];
        state.currentTurn = {
            id: "turn-1",
            seq: 1,
            agendaItemId: "agenda-1",
            intent: "explore",
            objective: "Decide",
            expectedOutputs: [],
            prohibitedTopics: [],
            plan: ["participant-1"],
            status: "running",
            currentStepIndex: 0,
            createdAt: now,
            steps: [
                {
                    id: "step-1",
                    speaker: "participant-1",
                    instruction: "Speak",
                    reason: "manager_selected",
                    status: "running",
                    attempt: {
                        attemptId: "attempt-1",
                        participantId: "participant-1",
                        meetingId: state.id,
                        turnId: "turn-1",
                        stepId: "step-1",
                        deliveryId: "delivery-1",
                        contextFromSeq: 0,
                        contextThroughSeq: 0,
                        taskSnapshots: [],
                        assignedAt: now,
                        status: "running",
                        deliveryStatus: "pending"
                    }
                }
            ]
        };

        const result = endMeeting(state, {
            meetingId: state.id,
            captainBinding: "captain:captain-1",
            outcome: "partial",
            reason: "Captain accepts a partial result",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: ["agenda-1"],
            waivers: [
                {
                    subjectId: "reviewer-1",
                    kind: "required_review",
                    reason: "Reviewer unavailable"
                }
            ],
            now,
            factId: (index) => `waiver-${index}`
        });

        expect(result.state.agenda[0]?.status).toBe("deferred");
        expect(result.state.completionFacts).toContainEqual(
            expect.objectContaining({ id: "waiver-0", kind: "waiver", authority: "captain" })
        );
        expect(result.state.currentTurn).toBeUndefined();
        expect(result.effect.events.map(({ type }) => type)).toEqual(
            expect.arrayContaining([
                "completion_fact.added",
                "meeting.ended",
                "speaker_attempt.revoked",
                "turn.truncated"
            ])
        );
    });

    it("rejects foreign references and any write after an execution terminal state", () => {
        expect(() =>
            endMeeting(meeting("running"), {
                meetingId: "meeting-1",
                captainBinding: "captain:captain-1",
                outcome: "partial",
                reason: "Partial",
                acceptedDecisionIds: ["decision-from-another-meeting"],
                deferredAgendaItemIds: [],
                waivers: [],
                now,
                factId: (index) => `waiver-${index}`
            })
        ).toThrowError(DomainError);
        expect(() =>
            endMeeting(meeting("completed"), {
                meetingId: "meeting-1",
                captainBinding: "captain:captain-1",
                outcome: "cancelled",
                reason: "Too late",
                acceptedDecisionIds: [],
                deferredAgendaItemIds: [],
                waivers: [],
                now,
                factId: (index) => `waiver-${index}`
            })
        ).toThrowError(expect.objectContaining({ code: "IMMUTABLE_MEETING" }));
    });
});
