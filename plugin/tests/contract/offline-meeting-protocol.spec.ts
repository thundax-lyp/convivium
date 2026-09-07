import { describe, expect, it, vi } from "vitest";
import { createOfflineMeetingProtocolFixture } from "../fixtures/offline-meeting-protocol.js";
import {
    CreateMeetingInputSchema,
    ManagerPlanSubmissionSchema,
    TurnSubmissionSchema
} from "../../src/protocol/index.js";
import { createSessionProvisioningEnvelope } from "../../src/dsh/provisioning.js";
import { projectSpeakerMeetingContext } from "../../src/projection/status.js";
import { submitManagerPlan, DomainError } from "../../src/domain/index.js";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import {
    registerCreateAndStatusTools,
    registerSubmitAndControlTools
} from "../../src/tools/index.js";

function runManagerPlan(
    f: ReturnType<typeof createOfflineMeetingProtocolFixture>,
    observedMeetingVersion: number
) {
    return submitManagerPlan(
        structuredClone(f.planningState),
        f.managerSubmission,
        {
            meetingId: f.managerSubmission.meetingId,
            planningAttemptId: f.managerSubmission.planningAttemptId,
            deliveryId: "offline-manager-delivery-1",
            observedMeetingVersion,
            dispatchableParticipantIds: ["participant-a", "participant-b"],
            now: 1700000000002,
            managerSessionId: "offline-manager"
        },
        { turnId: "offline-turn-1", stepId: (index) => `offline-step-${index}` }
    );
}

describe("offline meeting protocol preparation", () => {
    it("builds schema-valid offline inputs", () => {
        const f = createOfflineMeetingProtocolFixture();
        expect(() => CreateMeetingInputSchema({ ...f.createInput })).not.toThrow();
        expect(() => ManagerPlanSubmissionSchema({ ...f.managerSubmission })).not.toThrow();
        expect(() => TurnSubmissionSchema({ ...f.aSubmission })).not.toThrow();
        expect(() => TurnSubmissionSchema({ ...f.bSubmission })).not.toThrow();
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
            speaker: "participant-a",
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
    it("rejects missing protocol fields and text-only replies", () => {
        const f = createOfflineMeetingProtocolFixture();
        const { planningAttemptId: _p, ...missingPlanning } = structuredClone(f.managerSubmission);
        expect(() => ManagerPlanSubmissionSchema(missingPlanning)).toThrow();
        const { deliveryId: _d, ...missingDelivery } = structuredClone(f.aSubmission);
        expect(() => TurnSubmissionSchema({ ...missingDelivery })).toThrow();
        expect(() => TurnSubmissionSchema({ content: "OK" })).toThrow();
    });
    it("separates schema validity from reply reference evidence", () => {
        const f = createOfflineMeetingProtocolFixture();
        const invalid = { ...f.bSubmission, replyTo: "offline-missing" };
        expect(() => TurnSubmissionSchema({ ...invalid })).not.toThrow();
        expect(f.bContext.recentMessages.some((m) => m.id === invalid.replyTo)).toBe(false);
    });
    it("records the provisioning surface", () => {
        const envelope = createSessionProvisioningEnvelope({
            teamId: "offline-team",
            meetingId: "offline-meeting",
            role: "manager"
        });
        expect(envelope.kind).toBe("convivium.session.provisioning");
        expect(envelope.capability).toBe("none");
        expect(envelope).not.toHaveProperty("participantId");
        expect(envelope.instruction).toContain("attemptId and deliveryId");
    });
    it("rejects unassigned speaker projection", () => {
        const f = createOfflineMeetingProtocolFixture();
        const before = JSON.stringify(f);
        try {
            runManagerPlan(f, f.managerContext.meetingVersion + 1);
            expect.fail("stale planning was accepted");
        } catch (error) {
            expect(error).toBeInstanceOf(DomainError);
            if (!(error instanceof DomainError)) throw error;
            expect(error.code).toBe("STALE_MANAGER_ATTEMPT");
        }
        expect(() =>
            projectSpeakerMeetingContext(
                f.plannedState,
                "participant-b",
                "offline-turn-1-attempt-1"
            )
        ).toThrow(TypeError);
        expect(() =>
            projectSpeakerMeetingContext(
                f.afterAState,
                "participant-a",
                f.bContext.attempt.attemptId
            )
        ).toThrow(TypeError);
        expect(JSON.stringify(f)).toBe(before);
    });
    it("records registered tool parameter surface without execution", () => {
        const definitions: ToolDefinition[] = [];
        const denied = vi.fn(async (): Promise<never> => {
            throw new Error("Unexpected offline runtime execution");
        });
        const runtime = {
            acceptDecision: denied,
            disposeDecision: denied,
            disposeAgendaCandidate: denied,
            sendMeetingMessage: denied,
            finishMeetingMail: denied,
            createMeeting: denied,
            getStatus: denied,
            createMeetingTask: denied,
            meetingTaskStatus: denied,
            startMeetingTask: denied,
            finishMeetingTask: denied,
            raiseHand: denied,
            submitTurn: denied,
            submitManagerPlan: denied,
            pause: denied,
            resume: denied,
            reassignTurn: denied,
            disposeRisk: denied,
            endMeeting: denied
        };
        const deps = {
            registry: {
                register: (d: ToolDefinition) => {
                    definitions.push(d);
                    return () => undefined;
                }
            },
            callers: { resolve: async () => ({ sessionId: "offline", kind: "captain" as const }) },
            runtime
        };
        registerCreateAndStatusTools(deps);
        registerSubmitAndControlTools(deps);
        for (const name of [
            "convivium_create_meeting",
            "convivium_submit_manager_plan",
            "convivium_submit_turn"
        ]) {
            const definition = definitions.find((d) => d.name === name);
            expect(definition?.parameters).toEqual({
                type: "object",
                properties: { input: { description: "Protocol v1 command input." } },
                required: ["input"]
            });
        }
        expect(denied).not.toHaveBeenCalled();
    });
});
