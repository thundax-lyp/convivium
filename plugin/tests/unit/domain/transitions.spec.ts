import { describe, expect, it } from "vitest";
import {
    DomainError,
    type ArchivePackage,
    type MeetingState,
    transitionAttempt,
    transitionManagerAttempt,
    transitionMeeting,
    transitionStep,
    transitionTurn
} from "../../../src/domain/index.js";

const now = 1_700_000_000_000;

function meeting(status: MeetingState["status"] = "created"): MeetingState {
    return {
        id: "meeting-1",
        teamId: "team-1",
        status,
        participants: [],
        manager: { status: "idle" },
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
        decisions: [],
        openQuestions: [],
        handRaises: [],
        completionFacts: [],
        continuationMaterials: [],
        turnSeq: 0,
        messageSeq: 0,
        eventSeq: 0,
        stallCount: 0,
        replanCount: 0,
        selectionMode: "hybrid",
        limits: { maxTurns: 10, maxSpeakersPerTurn: 5, maxMessages: 100 },
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

function archivePackage(): ArchivePackage {
    return {
        schemaVersion: 1,
        meetingId: "meeting-1",
        teamId: "team-1",
        objectiveContract: meeting().objectiveContract,
        finalSummary: "summary",
        artifactRefs: [],
        acceptedDecisions: [],
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

describe("meeting transitions", () => {
    it("increments version and records the status change", () => {
        const result = transitionMeeting(meeting(), "running", { now });

        expect(result.state.status).toBe("running");
        expect(result.state.version).toBe(4);
        expect(result.state.updatedAt).toBe(now);
        expect(result.effect.events).toEqual([
            {
                type: "meeting.created",
                payload: {
                    meetingId: "meeting-1",
                    from: "created",
                    to: "running",
                    meetingVersion: 4,
                    reason: undefined
                }
            }
        ]);
    });

    it("rejects transitions that are not in the lifecycle matrix", () => {
        expect(() => transitionMeeting(meeting("archived"), "running", { now })).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
    });

    it("requires a reason and remembers the state paused from", () => {
        expect(() => transitionMeeting(meeting("running"), "paused", { now })).toThrowError(
            DomainError
        );

        const result = transitionMeeting(meeting("waiting"), "paused", {
            now,
            reason: "captain request",
            pause: { at: now, by: { kind: "captain", actorId: "captain-1" } }
        });
        expect(result.state.pausedFromStatus).toBe("waiting");
        expect(result.state.pauseReason).toBe("captain request");
        expect(result.state.pausedAt).toBe(now);
        expect(result.state.pausedBy?.actorId).toBe("captain-1");
    });

    it("persists structured waiting metadata", () => {
        const result = transitionMeeting(meeting("running"), "waiting", {
            now,
            wait: {
                reason: "required task is still running",
                taskIds: ["task-1"],
                participantIds: ["participant-1"],
                deadlineAt: now + 1_000,
                resumeAgendaItemId: "agenda-1"
            }
        });

        expect(result.state.waiting).toEqual({
            reason: "required task is still running",
            taskIds: ["task-1"],
            participantIds: ["participant-1"],
            deadlineAt: now + 1_000,
            resumeAgendaItemId: "agenda-1"
        });
    });

    it("revokes active speaker and manager attempts while truncating the turn", () => {
        const state = meeting("running");
        state.currentTurn = {
            id: "turn-1",
            status: "running",
            currentStepIndex: 0,
            steps: [
                {
                    id: "step-1",
                    status: "running",
                    attempt: {
                        attemptId: "attempt-1",
                        meetingId: "meeting-1",
                        turnId: "turn-1",
                        stepId: "step-1",
                        deliveryId: "delivery-1",
                        status: "running",
                        deliveryStatus: "pending"
                    }
                }
            ]
        };
        state.manager = {
            status: "planning",
            currentPlanningAttempt: { id: "plan-1", status: "running" }
        };

        const result = transitionMeeting(state, "paused", {
            now,
            reason: "captain request",
            pause: { at: now, by: { kind: "captain", actorId: "captain-1" } }
        });

        expect(result.state.currentTurn?.status).toBe("truncated");
        expect(result.state.currentTurn?.steps[0].status).toBe("revoked");
        expect(result.state.currentTurn?.steps[0].attempt?.status).toBe("revoked");
        expect(result.state.manager.currentPlanningAttempt?.status).toBe("revoked");
        expect(result.effect.events.map(({ type }) => type)).toEqual([
            "meeting.paused",
            "speaker_attempt.revoked",
            "manager_attempt.revoked"
        ]);
    });

    it("does not attach termination or archive data to non-matching transitions", () => {
        const termination = {
            code: "user_cancelled" as const,
            reason: "cancelled",
            decisionIds: [],
            unresolvedQuestionIds: [],
            dissentingPositionIds: [],
            blockingAgendaItemIds: [],
            finalMessage: "cancelled",
            endedAt: now
        };
        expect(() =>
            transitionMeeting(meeting("running"), "paused", {
                now,
                reason: "pause",
                termination,
                pause: { at: now, by: { kind: "captain", actorId: "captain-1" } }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
        expect(() =>
            transitionMeeting(meeting("running"), "waiting", {
                now,
                archive: { package: archivePackage() }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));

        expect(() =>
            transitionMeeting(meeting("running"), "completed", {
                now,
                termination: {
                    code: "objective_satisfied",
                    reason: "done",
                    decisionIds: ["missing-decision"],
                    unresolvedQuestionIds: [],
                    dissentingPositionIds: [],
                    blockingAgendaItemIds: [],
                    finalMessage: "done",
                    endedAt: now
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("requires termination details for execution terminal states", () => {
        expect(() => transitionMeeting(meeting("running"), "completed", { now })).toThrowError(
            expect.objectContaining({ code: "MISSING_TERMINATION" })
        );

        const result = transitionMeeting(meeting("running"), "completed", {
            now,
            termination: {
                code: "objective_satisfied",
                reason: "all outputs accepted",
                decisionIds: [],
                unresolvedQuestionIds: [],
                dissentingPositionIds: [],
                blockingAgendaItemIds: [],
                finalMessage: "done",
                endedAt: now
            }
        });
        expect(result.state.termination?.code).toBe("objective_satisfied");
        expect(() =>
            transitionMeeting(meeting("running"), "completed", {
                now,
                termination: {
                    code: "user_cancelled",
                    reason: "cancelled",
                    decisionIds: [],
                    unresolvedQuestionIds: [],
                    dissentingPositionIds: [],
                    blockingAgendaItemIds: [],
                    finalMessage: "cancelled",
                    endedAt: now
                }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("requires a materialized archive before archived", () => {
        const archivingMeeting = meeting("archiving");
        expect(() => transitionMeeting(archivingMeeting, "archived", { now })).toThrowError(
            expect.objectContaining({ code: "MISSING_ARCHIVE" })
        );

        const materialized = transitionMeeting(meeting("completed"), "archiving", {
            now,
            archive: { package: archivePackage() }
        }).state;
        const result = transitionMeeting(materialized, "archived", {
            now,
            archive: { archivedAt: now }
        });
        expect(result.state.archive?.package.meetingId).toBe("meeting-1");
        expect(result.state.archive?.archivedAt).toBe(now);
    });

    it("rejects an archive package that disagrees with the terminal facts", () => {
        const archive = archivePackage();
        archive.termination = {
            ...archive.termination,
            finalMessage: "different"
        };
        expect(() =>
            transitionMeeting(meeting("completed"), "archiving", {
                now,
                archive: { package: archive }
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("rejects archive facts from another meeting or team", () => {
        const archive = archivePackage();
        archive.meetingId = "meeting-2";
        expect(() =>
            transitionMeeting(
                transitionMeeting(meeting("completed"), "archiving", {
                    now,
                    archive: { package: archivePackage() }
                }).state,
                "archived",
                {
                    now,
                    archive: { package: archive, archivedAt: now }
                }
            )
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
    });

    it("revokes active attempts before entering archiving", () => {
        const state = meeting("completed");
        state.currentTurn = {
            id: "turn-1",
            status: "running",
            currentStepIndex: 0,
            steps: [
                {
                    id: "step-1",
                    status: "running",
                    attempt: {
                        attemptId: "attempt-1",
                        meetingId: "meeting-1",
                        turnId: "turn-1",
                        stepId: "step-1",
                        deliveryId: "delivery-1",
                        status: "running",
                        deliveryStatus: "acknowledged"
                    }
                }
            ]
        };

        const result = transitionMeeting(state, "archiving", {
            now,
            archive: { package: archivePackage() }
        });

        expect(result.state.currentTurn?.status).toBe("truncated");
        expect(result.state.currentTurn?.steps[0].attempt?.status).toBe("revoked");
        expect(result.effect.events.map(({ type }) => type)).toContain("speaker_attempt.revoked");
    });

    it("snapshots termination facts before returning the terminal state", () => {
        const termination = {
            code: "objective_satisfied" as const,
            reason: "done",
            decisionIds: [] as string[],
            unresolvedQuestionIds: [] as string[],
            dissentingPositionIds: [] as string[],
            blockingAgendaItemIds: [] as string[],
            finalMessage: "done",
            endedAt: now
        };
        const result = transitionMeeting(meeting("running"), "completed", {
            now,
            termination
        });

        termination.decisionIds.push("mutated-after-transition");
        termination.finalMessage = "mutated-after-transition";
        expect(result.state.termination?.decisionIds).toEqual([]);
        expect(result.state.termination?.finalMessage).toBe("done");
    });

    it("snapshots the archive so later input mutation cannot change committed state", () => {
        const input = { package: archivePackage(), archivedAt: now };
        const materialized = transitionMeeting(meeting("completed"), "archiving", {
            now,
            archive: { package: input.package }
        }).state;
        const result = transitionMeeting(materialized, "archived", {
            now,
            archive: { archivedAt: now }
        });

        input.package.finalSummary = "mutated after transition";
        expect(result.state.archive?.package.finalSummary).toBe("summary");
    });
});

describe("turn, step and attempt transitions", () => {
    it("allows only the specified turn transitions", () => {
        const result = transitionTurn(
            { id: "turn-1", status: "planned", currentStepIndex: 0, steps: [] },
            "running",
            1
        );
        expect(result.state.status).toBe("running");
        expect(() => transitionTurn(result.state, "planned", 2)).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
    });

    it("models step and speaker attempt retry as new state, never resurrection", () => {
        const step = transitionStep({ id: "step-1", status: "pending" }, "assigned", 1).state;
        const runningStep = transitionStep(step, "running", 2).state;
        expect(transitionStep(runningStep, "revoked", 3).state.status).toBe("revoked");
        expect(() => transitionStep(runningStep, "assigned", 3)).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );

        const attempt = transitionAttempt(
            {
                attemptId: "attempt-1",
                meetingId: "meeting-1",
                turnId: "turn-1",
                stepId: "step-1",
                deliveryId: "delivery-1",
                status: "assigned",
                deliveryStatus: "pending"
            },
            "running",
            2,
            attemptContext()
        ).state;
        const submitted = transitionAttempt(attempt, "submitted", 3, attemptContext());
        expect(submitted.state.status).toBe("submitted");
        expect(submitted.state.deliveryStatus).toBe("acknowledged");
        expect(() =>
            transitionAttempt(attempt, "submitted", 3, {
                ...attemptContext(),
                deliveryId: "stale-delivery"
            })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
        expect(transitionAttempt(attempt, "failed", 3, attemptContext()).state.status).toBe(
            "failed"
        );
        expect(() => transitionAttempt(attempt, "assigned", 3, attemptContext())).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
    });

    it("uses the same lifecycle rule for manager planning attempts", () => {
        const running = transitionManagerAttempt(
            { id: "plan-1", status: "pending" },
            "running",
            1
        ).state;
        expect(transitionManagerAttempt(running, "submitted", 2).state.status).toBe("submitted");
        expect(() => transitionManagerAttempt(running, "pending", 2)).toThrowError(
            expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
        );
    });
});

function attemptContext() {
    return {
        meetingId: "meeting-1",
        turnId: "turn-1",
        stepId: "step-1",
        deliveryId: "delivery-1"
    };
}
