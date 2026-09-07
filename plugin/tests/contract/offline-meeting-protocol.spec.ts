import { describe, expect, it } from "vitest";
import { createOfflineMeetingProtocolFixture } from "../fixtures/offline-meeting-protocol.js";

describe("offline meeting protocol preparation", () => {
    it("builds schema-valid offline inputs", () => {
        const f = createOfflineMeetingProtocolFixture();
        expect(f.planningState.version).toBe(1);
        expect(f.plannedState.version).toBe(2);
        expect(f.afterAState.version).toBe(3);
    });
    it("plans only A before B", () => {
        const f = createOfflineMeetingProtocolFixture();
        expect(f.plannedState.currentTurn?.steps.map((s) => s.status)).toEqual([
            "running",
            "pending"
        ]);
        expect(f.aContext.recentMessages).toEqual([]);
    });
    it("projects the submitted A message into B context", () => {
        const f = createOfflineMeetingProtocolFixture();
        expect(f.bContext.recentMessages[0]?.id).toBe("offline-message-a");
        expect(f.bSubmission.replyTo).toBe("offline-message-a");
    });
    it("returns detached repeatable fixtures", () => {
        const a = createOfflineMeetingProtocolFixture();
        const b = createOfflineMeetingProtocolFixture();
        expect(a).toEqual(b);
        (a.bContext.recentMessages[0] as { content: string }).content = "changed";
        expect(a.afterAState.transcript[0]?.content).toContain("amber-47");
        expect(b.bContext.recentMessages[0]?.content).toContain("amber-47");
    });
});
