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
        updatedAt: now - 1000
    };
}

function archivePackage(): ArchivePackage {
    return {
        schemaVersion: 1,
        meetingId: "meeting-1",
        teamId: "team-1",
        objectiveContract: meeting().objectiveContract,
        finalSummary: "summary",
        artifacts: [],
        acceptedDecisions: [],
        proposals: [],
        completionFacts: [],
        agenda: [],
        issues: [],
        unresolvedQuestions: [],
        parkingLot: [],
        formalTranscript: [],
        participantProvenance: [],
        managerPromptVersion: "v1",
        termination: { code: "objective_satisfied", reason: "done", endedAt: now },
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
                type: "meeting.status_changed",
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
            reason: "captain request"
        });
        expect(result.state.pausedFromStatus).toBe("waiting");
        expect(result.state.pauseReason).toBe("captain request");
    });

    it("does not attach termination or archive data to non-matching transitions", () => {
        const termination = { code: "user_cancelled" as const, reason: "cancelled", endedAt: now };
        expect(() =>
            transitionMeeting(meeting("running"), "paused", { now, reason: "pause", termination })
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
        expect(() =>
            transitionMeeting(meeting("running"), "waiting", {
                now,
                archive: { package: archivePackage() }
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
                endedAt: now
            }
        });
        expect(result.state.termination?.code).toBe("objective_satisfied");
    });

    it("requires a materialized archive before archived", () => {
        expect(() => transitionMeeting(meeting("archiving"), "archived", { now })).toThrowError(
            expect.objectContaining({ code: "MISSING_ARCHIVE" })
        );

        const result = transitionMeeting(meeting("archiving"), "archived", {
            now,
            archive: { package: archivePackage(), archivedAt: now }
        });
        expect(result.state.archive?.package.meetingId).toBe("meeting-1");
        expect(result.state.archive?.archivedAt).toBe(now);
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
            { attemptId: "attempt-1", status: "assigned", deliveryStatus: "pending" },
            "running",
            2
        ).state;
        expect(transitionAttempt(attempt, "failed", 3).state.status).toBe("failed");
        expect(() => transitionAttempt(attempt, "assigned", 3)).toThrowError(
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
