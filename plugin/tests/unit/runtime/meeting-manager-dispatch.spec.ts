import type { MeetingState } from "@/domain/index.js";
import type { OutboxItem } from "@/repository/types.js";
import type { MeetingRepositoryRuntime } from "@/runtime/meeting-runtime.js";
import { createMeetingDeliveryDispatcher } from "@/runtime/services/meeting-dispatch-service.js";
import { meeting, now } from "../domain/transitions/fixtures.js";
import { describe, expect, it, vi } from "vitest";

function activeManagerState(): MeetingState {
    const state = meeting("running");
    state.participants = [
        {
            id: "participant-required",
            displayName: "Required Reviewer",
            status: "available",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        },
        {
            id: "participant-unavailable",
            displayName: "Unavailable Reviewer",
            status: "unavailable",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        }
    ];
    state.agenda = [
        {
            id: "agenda-1",
            title: "Review",
            objective: "Reach a supported recommendation",
            inScope: [],
            outOfScope: [],
            completionCriteria: [],
            requiredParticipants: ["participant-required"],
            relatedTaskIds: [],
            status: "discussing"
        }
    ];
    state.activeAgendaItemId = "agenda-1";
    state.meetingTasks = [];
    state.manager = {
        promptVersion: "test",
        status: "planning",
        currentPlanningAttempt: {
            id: "planning-1",
            meetingId: "meeting-1",
            observedMeetingVersion: state.version,
            reason: "initial_plan",
            deliveryId: "manager-delivery-1",
            status: "running",
            createdAt: now,
            catalogBinding: { kind: "none" }
        }
    };
    return state;
}

describe("meeting manager dispatch", () => {
    it("delivers an exact submit_manager_plan envelope using current authorization values", async () => {
        const state = activeManagerState();
        const managerOwnership = {
            sessionId: "manager-session",
            parentSessionId: "captain-session",
            sessionLabel: "convivium/team-1/meeting-1/manager",
            provider: "spawn",
            role: "manager" as const,
            lifecycleStatus: "active" as const,
            capabilityStatus: "active" as const,
            createdAt: now,
            updatedAt: now
        };
        const participantOwnership = {
            ...managerOwnership,
            sessionId: "participant-session",
            sessionLabel: "convivium/team-1/meeting-1/participant-required",
            role: "participant" as const,
            participantId: "participant-required"
        };
        const repository = {
            recover: vi.fn().mockResolvedValue({
                snapshot: { state },
                sessionOwnership: [managerOwnership, participantOwnership]
            })
        } as unknown as MeetingRepositoryRuntime;
        const sendMessage = vi.fn().mockResolvedValue("accepted-message");
        const dispatcher = createMeetingDeliveryDispatcher({ continuable: { sendMessage } });
        const item = {
            id: "outbox-manager",
            deliveryId: "manager-delivery-1",
            kind: "dispatch_manager",
            priority: 1,
            payload: { role: "manager", planningAttemptId: "planning-1" },
            attempts: 1,
            leaseOwner: "worker-1",
            leaseToken: "lease-1",
            leaseDeadline: now + 1000
        } satisfies OutboxItem;

        await dispatcher.dispatch({
            repository,
            parent: { id: "captain-session" } as never,
            meetingId: "meeting-1",
            signal: new AbortController().signal,
            item
        });

        const prompt = sendMessage.mock.calls[0]?.[2] as Array<{ type: string; text: string }>;
        const prefix = "Convivium manager submission guidance: ";
        expect(prompt).toHaveLength(2);
        expect(prompt[1]?.text.startsWith(prefix)).toBe(true);
        expect(JSON.parse(prompt[1]!.text.slice(prefix.length))).toEqual({
            tool: "convivium_submit_manager_plan",
            dispatchableParticipantIds: ["participant-required"],
            requiredSpeakerIds: ["participant-required"],
            allowedIntents: [
                "explore",
                "clarify",
                "challenge",
                "review",
                "resolve_objection",
                "synthesize",
                "decide",
                "report_task_result",
                "refocus"
            ],
            allowedStepReasons: [
                "explicit_mention",
                "direct_question",
                "required_reviewer",
                "agenda_owner",
                "task_result_owner",
                "blocking_objection_owner",
                "hand_raise",
                "rule_score",
                "manager_selected",
                "round_robin_fallback",
                "captain_summary"
            ],
            instruction:
                "Submit the outer tool argument exactly as {input:<ManagerPlanSubmissionV1 object>}. Replace planning content, but keep the current identity and version values. Every step participantId must come from dispatchableParticipantIds. Include each requiredSpeakerId that is dispatchable; never invent an unavailable participantId.",
            submitManagerPlan: {
                input: {
                    protocolVersion: 1,
                    meetingId: "meeting-1",
                    planningAttemptId: "planning-1",
                    observedMeetingVersion: 3,
                    requestId: "planning-1:submission",
                    agendaItemId: "agenda-1",
                    intent: "explore",
                    objective: "<replace with the turn objective>",
                    expectedOutputs: [],
                    prohibitedTopics: [],
                    steps: [
                        {
                            participantId: "participant-required",
                            instruction: "<replace with the speaker instruction>",
                            reason: "manager_selected"
                        }
                    ]
                }
            }
        });
    });
});
