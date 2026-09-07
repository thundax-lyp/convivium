import { describe, expect, it } from "vitest";
import { createOfflineMeetingProtocolFixture } from "../fixtures/offline-meeting-protocol.js";

describe("offline meeting protocol preparation", () => {
    it("builds schema-valid offline inputs", () => {
        const f = createOfflineMeetingProtocolFixture();
        expect(f.createInput.teamId).toBe("offline-team");
        expect(f.planningState.participants.map((p) => p.id)).toEqual([
            "participant-a",
            "participant-b"
        ]);
        expect(f.planningState.objectiveContract.acceptanceCriteria[0]).toEqual({
            id: "criterion-reference",
            description: "B cites A",
            satisfied: false
        });
        expect(f.planningState.agenda[0]).toMatchObject({
            id: "agenda-reference",
            status: "discussing"
        });
        expect(f.planningState.version).toBe(1);
        expect(f.plannedState.version).toBe(2);
        expect(f.afterAState.version).toBe(3);
    });
    it("plans only A before B", () => {
        const f = createOfflineMeetingProtocolFixture();
        expect(f.plannedState.currentTurn?.steps.map((s) => s.speaker)).toEqual([
            "participant-a",
            "participant-b"
        ]);
        expect(f.plannedState.currentTurn?.steps.map((s) => s.status)).toEqual([
            "running",
            "pending"
        ]);
        expect(f.plannedState.currentTurn?.steps.filter((s) => s.attempt).length).toBe(1);
        expect(f.aContext.step.participantId).toBe("participant-a");
        expect(f.aContext.recentMessages).toEqual([]);
        expect(f.aContext.attempt.contextThroughSeq).toBe(0);
        expect(f.managerContext.agentCatalog).toBeNull();
        expect("attendanceRecommendations" in f.managerSubmission).toBe(false);
    });
    it("projects the submitted A message into B context", () => {
        const f = createOfflineMeetingProtocolFixture();
        expect(f.afterAState.transcript).toHaveLength(1);
        expect(f.afterAState.transcript[0]).toMatchObject({
            id: "offline-message-a",
            seq: 1,
            speaker: "participant-a",
            content: "Marker: amber-47. Reason: a local fixture needs no network."
        });
        expect(f.bContext.recentMessages).toHaveLength(1);
        expect(f.bContext.recentMessages[0]).toMatchObject({
            id: "offline-message-a",
            seq: 1,
            content: "Marker: amber-47. Reason: a local fixture needs no network."
        });
        expect(f.bContext.attempt.contextThroughSeq).toBe(1);
        expect(f.bContext.step.id).toBe("offline-step-1");
        expect(f.aContext.attempt.attemptId).not.toBe(f.bContext.attempt.attemptId);
        expect(f.aContext.attempt.deliveryId).not.toBe(f.bContext.attempt.deliveryId);
        expect(f.bSubmission.replyTo).toBe("offline-message-a");
        expect(f.bSubmission.content).toBe("I cite amber-47: a local fixture needs no network.");
    });
    it("returns detached repeatable fixtures", () => {
        const a = createOfflineMeetingProtocolFixture();
        const b = createOfflineMeetingProtocolFixture();
        expect(a).toEqual(b);
        const original = a.afterAState.transcript[0]?.content;
        a.bContext.recentMessages[0]!.content = "changed";
        expect(a.afterAState.transcript[0]?.content).toBe(original);
        expect(b).toEqual(createOfflineMeetingProtocolFixture());
    });
});
