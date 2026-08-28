import type { MeetingState } from "../../src/domain/model.js";
import { projectMeetingStatus } from "../../src/projection/index.js";
import { MeetingStatusResultSchema } from "../../src/protocol/index.js";
import { describe, expect, it } from "vitest";

const state = {
    id: "meeting-1",
    teamId: "team-1",
    status: "running",
    topic: "Release",
    objective: "Decide scope",
    objectiveContract: {},
    continuationMaterials: [],
    limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 8 },
    version: 2,
    agenda: [],
    transcript: [],
    decisions: [],
    issues: [],
    handRaises: [],
    meetingTasks: [],
    currentTurn: undefined,
    manager: {
        status: "planning",
        currentPlanningAttempt: {
            id: "planning-1",
            deliveryId: "delivery-1"
        }
    },
    outbox: { leaseToken: "secret" }
} as unknown as MeetingState;

describe("meeting status projection", () => {
    it("maps only public canonical meeting facts", () => {
        const projected = projectMeetingStatus(state, {
            kind: "participant",
            sessionId: "session-1",
            participantId: "participant-1"
        });

        expect(projected).toMatchObject({
            meetingId: "meeting-1",
            meetingVersion: 2,
            status: "running",
            limits: { maxTurns: 3 }
        });
        expect(JSON.stringify(projected)).not.toContain("session-1");
        expect(JSON.stringify(projected)).not.toContain("capability");
        expect(JSON.stringify(projected)).not.toContain("prompt");
        expect(projected).not.toHaveProperty("currentTurn");
        expect(projected).not.toHaveProperty("currentSpeakerId");
        expect(JSON.stringify(projected)).not.toContain("planning-1");
        expect(JSON.stringify(projected)).not.toContain("leaseToken");
    });

    it("keeps pause available while an active meeting is waiting", () => {
        const projected = projectMeetingStatus({ ...state, status: "waiting" } as MeetingState, {
            kind: "captain",
            sessionId: "captain-1"
        });

        expect(projected).toMatchObject({
            status: "waiting",
            pauseControl: { action: "pause" }
        });
    });

    it("projects the optional HandRaise reply target", () => {
        const projected = projectMeetingStatus(
            {
                ...state,
                handRaises: [
                    {
                        id: "raise-1",
                        participant: "participant-1",
                        reason: "correction",
                        summary: "Correct the prior statement",
                        taskIds: [],
                        replyToMessageId: "message-1",
                        priority: "normal",
                        createdAt: 1,
                        status: "pending"
                    }
                ]
            } as MeetingState,
            { kind: "captain", sessionId: "captain-1" }
        );

        expect(projected.pendingHandRaises).toEqual([
            expect.objectContaining({ replyToMessageId: "message-1" })
        ]);
        expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();
    });

    it.each(["completed", "partial", "no_consensus", "cancelled", "failed"] as const)(
        "maps %s through the execution-terminal schema without active execution data",
        (status) => {
            const projected = projectMeetingStatus(
                {
                    ...state,
                    status,
                    completionFacts: [
                        { id: "fact-active", status: "active" },
                        { id: "fact-superseded", status: "superseded" }
                    ],
                    termination: {
                        code: status === "failed" ? "internal_error" : "captain_accepted",
                        reason: "Formal terminal reason",
                        decisionIds: ["decision-1"],
                        unresolvedQuestionIds: ["question-1"],
                        dissentingPositionIds: ["position-1"],
                        blockingAgendaItemIds: ["agenda-1"],
                        finalMessage: "Final public message",
                        endedAt: 1_700_000_000_000
                    },
                    currentTurn: {
                        id: "turn-secret",
                        currentStepIndex: 0,
                        steps: [
                            {
                                id: "step-secret",
                                speaker: "participant-secret",
                                attempt: { attemptId: "attempt-secret" }
                            }
                        ]
                    },
                    handRaises: [{ id: "raise-secret", status: "pending" }]
                } as unknown as MeetingState,
                {
                    kind: "captain",
                    sessionId: "session-secret"
                }
            );

            expect(() => MeetingStatusResultSchema(projected as never)).not.toThrow();
            expect(projected).toMatchObject({
                status,
                pendingHandRaises: [],
                pauseControl: { action: "none" },
                completionFactIds: ["fact-active"],
                termination: {
                    decisionIds: ["decision-1"],
                    unresolvedQuestionIds: ["question-1"],
                    dissentingPositionIds: ["position-1"],
                    blockingAgendaItemIds: ["agenda-1"],
                    finalMessage: "Final public message",
                    endedAt: 1_700_000_000_000
                }
            });
            expect(projected).not.toHaveProperty("currentTurn");
            expect(projected).not.toHaveProperty("currentSpeakerId");
            expect(JSON.stringify(projected)).not.toMatch(
                /session-secret|turn-secret|step-secret|attempt-secret|raise-secret/
            );
        }
    );
});
