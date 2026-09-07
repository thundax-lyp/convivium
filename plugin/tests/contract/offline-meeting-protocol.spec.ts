import { describe, expect, it, vi } from "vitest";
import {
    createOfflineMeetingProtocolFixture,
    type OfflineMeetingProtocolFixture
} from "../fixtures/offline-meeting-protocol.js";
import {
    CreateMeetingInputSchema,
    ManagerPlanSubmissionSchema,
    TurnSubmissionSchema
} from "../../src/protocol/index.js";
import { createSessionProvisioningEnvelope } from "../../src/dsh/provisioning.js";
import { projectSpeakerMeetingContext } from "../../src/projection/status.js";
import {
    submitManagerPlan,
    DomainError,
    type MeetingState,
    type TransitionResult
} from "../../src/domain/index.js";
import type { MeetingToolRuntime } from "../../src/runtime/index.js";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import {
    registerCreateAndStatusTools,
    registerSubmitAndControlTools
} from "../../src/tools/index.js";

function runManagerPlan(
    f: OfflineMeetingProtocolFixture,
    observedMeetingVersion: number
): TransitionResult<MeetingState> {
    return submitManagerPlan(
        structuredClone(f.planningState),
        {
            agendaItemId: f.managerSubmission.agendaItemId,
            intent: f.managerSubmission.intent,
            objective: f.managerSubmission.objective,
            expectedOutputs: [...f.managerSubmission.expectedOutputs],
            prohibitedTopics: [...f.managerSubmission.prohibitedTopics],
            steps: structuredClone(f.managerSubmission.steps)
        },
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

function collectToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    const denied = vi.fn(async (): Promise<never> => {
        throw new Error("Unexpected offline runtime execution");
    });
    const runtime: MeetingToolRuntime = {
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
        callers: { resolve: denied },
        runtime
    };
    registerCreateAndStatusTools(deps);
    registerSubmitAndControlTools(deps);
    expect(denied).not.toHaveBeenCalled();
    return definitions;
}

describe("offline meeting protocol preparation", () => {
    it("builds schema-valid offline inputs", () => {
        const f = createOfflineMeetingProtocolFixture();
        expect(() => CreateMeetingInputSchema({ ...f.createInput })).not.toThrow();
        expect(() => ManagerPlanSubmissionSchema({ ...f.managerSubmission })).not.toThrow();
        expect(() => TurnSubmissionSchema({ ...f.aSubmission })).not.toThrow();
        expect(() => TurnSubmissionSchema({ ...f.bSubmission })).not.toThrow();
        expect(Object.keys(f.createInput).sort()).toEqual(
            [
                "protocolVersion",
                "requestId",
                "teamId",
                "topic",
                "objective",
                "selectionMode",
                "objectiveContract",
                "agenda",
                "participants",
                "limits"
            ].sort()
        );
        expect(runManagerPlan(f, f.managerContext.meetingVersion).state).toEqual(f.plannedState);
        expect(f.createInput.teamId).toBe("offline-team");
        expect(f.planningState.participants.map((p) => p.id)).toEqual([
            "participant-a",
            "participant-b"
        ]);
        expect(f.planningState.objectiveContract.acceptanceCriteria).toEqual([
            {
                id: "criterion-reference",
                description: "B cites A",
                satisfied: false
            }
        ]);
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
        expect(Object.hasOwn(f.managerContext, "attendanceRecommendations")).toBe(false);
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
        const secondBefore = JSON.stringify(b);
        expect(JSON.stringify(a)).toBe(secondBefore);
        const original = a.afterAState.transcript[0]?.content;
        const message = a.bContext.recentMessages[0];
        if (!message) throw new Error("B context message missing");
        message.content = "changed";
        expect(a.afterAState.transcript[0]?.content).toBe(original);
        expect(JSON.stringify(b)).toBe(secondBefore);
    });
    it("rejects missing protocol fields and text-only replies", () => {
        const f = createOfflineMeetingProtocolFixture();
        const before = JSON.stringify(f);
        const { planningAttemptId: _p, ...missingPlanning } = structuredClone(f.managerSubmission);
        expect(() => ManagerPlanSubmissionSchema(missingPlanning)).toThrow();
        const { deliveryId: _d, ...missingDelivery } = structuredClone(f.aSubmission);
        expect(() => TurnSubmissionSchema({ ...missingDelivery })).toThrow();
        expect(() => TurnSubmissionSchema({ content: "OK" })).toThrow();
        expect(JSON.stringify(f)).toBe(before);
    });
    it("separates schema validity from reply reference evidence", () => {
        const f = createOfflineMeetingProtocolFixture();
        const invalid = { ...f.bSubmission, replyTo: "offline-missing" };
        expect(() => TurnSubmissionSchema({ ...invalid })).not.toThrow();
        expect(f.bContext.recentMessages.some((m) => m.id === invalid.replyTo)).toBe(false);
        const matches = f.bContext.recentMessages.filter((m) => m.id === f.bSubmission.replyTo);
        expect(matches).toHaveLength(1);
        expect(matches[0]).toMatchObject({ id: "offline-message-a", speaker: "participant-a" });
    });
    it("rejects stale planning and unassigned speaker projection", () => {
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
    it("records current tool and provisioning surfaces", () => {
        const envelope = createSessionProvisioningEnvelope({
            teamId: "offline-team",
            meetingId: "offline-meeting",
            role: "manager"
        });
        expect(envelope.kind).toBe("convivium.session.provisioning");
        expect(envelope.version).toBe(1);
        expect(envelope.role).toBe("manager");
        expect(envelope.capability).toBe("none");
        expect(envelope).not.toHaveProperty("participantId");
        expect(envelope.instruction).toBe(
            "This message establishes your meeting identity only. You have no planning or speaker capability yet. Wait for a later request that includes attemptId and deliveryId before using any meeting write tool."
        );
        const f = createOfflineMeetingProtocolFixture();
        expect(f.managerContext).toHaveProperty("planningAttemptId");
        expect(Object.hasOwn(f.managerContext, "attemptId")).toBe(false);
        expect(Object.hasOwn(f.managerContext, "deliveryId")).toBe(false);
        expect(f.aContext.attempt.attemptId).toEqual(expect.stringMatching(/.+/));
        expect(f.aContext.attempt.deliveryId).toEqual(expect.stringMatching(/.+/));
        expect(f.bContext.attempt.attemptId).toEqual(expect.stringMatching(/.+/));
        expect(f.bContext.attempt.deliveryId).toEqual(expect.stringMatching(/.+/));
        const definitions = collectToolDefinitions();
        for (const name of [
            "convivium_create_meeting",
            "convivium_submit_manager_plan",
            "convivium_submit_turn"
        ]) {
            const matches = definitions.filter((d) => d.name === name);
            expect(matches).toHaveLength(1);
            const definition = matches[0];
            expect(definition?.parameters).toEqual({
                type: "object",
                properties: { input: { description: "Protocol v1 command input." } },
                required: ["input"]
            });
        }
    });
});
