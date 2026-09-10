import type { MeetingState } from "@/domain/index.js";
import type { OutboxItem } from "@/repository/types.js";
import type { MeetingRepositoryRuntime } from "@/runtime/meeting-runtime.js";
import { createMeetingDeliveryDispatcher } from "@/runtime/services/meeting-dispatch-service.js";
import { meeting, now } from "../domain/transitions/fixtures.js";
import { describe, expect, it, vi } from "vitest";

function activeSpeakerState(): MeetingState {
    const state = meeting("running");
    state.participants = [
        {
            id: "participant-scribe",
            displayName: "Meeting Scribe",
            status: "speaking",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        }
    ];
    state.agenda = [
        {
            id: "agenda-agenda-1",
            title: "Summarize",
            objective: "Produce referenced minutes",
            inScope: [],
            outOfScope: [],
            completionCriteria: [],
            requiredParticipants: ["participant-scribe"],
            relatedTaskIds: [],
            status: "discussing"
        }
    ];
    state.activeAgendaItemId = "agenda-agenda-1";
    state.meetingTasks = [];
    state.transcript = [
        {
            id: "message-turn-1-delivery-2",
            seq: 1,
            turnSeq: 1,
            turnId: "turn-1",
            stepId: "step-runtime",
            attemptId: "turn-1-attempt-2",
            speaker: "participant-runtime",
            agendaItemId: "agenda-agenda-1",
            agendaRelation: "on_topic",
            content: "Runtime evidence",
            kind: "evidence",
            mentions: [],
            taskIds: [],
            createdAt: now
        }
    ];
    state.messageSeq = 1;
    state.currentTurn = {
        id: "turn-1",
        seq: 1,
        agendaItemId: "agenda-agenda-1",
        intent: "synthesize",
        objective: "Produce referenced minutes",
        expectedOutputs: [],
        prohibitedTopics: [],
        plan: ["participant-scribe"],
        status: "running",
        currentStepIndex: 0,
        createdAt: now,
        steps: [
            {
                id: "step-participant-scribe-4",
                speaker: "participant-scribe",
                instruction: "Create referenced minutes",
                reason: "captain_summary",
                status: "running",
                attempt: {
                    attemptId: "turn-1-attempt-4",
                    participantId: "participant-scribe",
                    meetingId: "meeting-1",
                    turnId: "turn-1",
                    stepId: "step-participant-scribe-4",
                    deliveryId: "turn-1-delivery-4",
                    contextFromSeq: 0,
                    contextThroughSeq: 1,
                    taskSnapshots: [],
                    assignedAt: now,
                    status: "running",
                    deliveryStatus: "accepted"
                }
            }
        ]
    };
    return state;
}

describe("meeting speaker dispatch", () => {
    it("delivers an exact submit_turn envelope and clamps referenced-minutes coverage to one", async () => {
        const state = activeSpeakerState();
        const ownership = {
            sessionId: "scribe-session",
            parentSessionId: "captain-session",
            sessionLabel: "convivium/team-1/meeting-1/participant-scribe",
            provider: "spawn",
            role: "participant" as const,
            participantId: "participant-scribe",
            lifecycleStatus: "active" as const,
            capabilityStatus: "active" as const,
            createdAt: now,
            updatedAt: now
        };
        const repository = {
            recover: vi.fn().mockResolvedValue({
                snapshot: { state },
                sessionOwnership: [ownership]
            })
        } as unknown as MeetingRepositoryRuntime;
        const sendMessage = vi.fn().mockResolvedValue("accepted-message");
        const dispatcher = createMeetingDeliveryDispatcher({ continuable: { sendMessage } });
        const item = {
            id: "outbox-scribe",
            deliveryId: "turn-1-delivery-4",
            kind: "dispatch",
            priority: 1,
            payload: {
                participantId: "participant-scribe",
                attemptId: "turn-1-attempt-4",
                turnId: "turn-1"
            },
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
        const prefix = "Convivium speaker submission guidance: ";
        expect(prompt).toHaveLength(2);
        expect(prompt[1]?.text.startsWith(prefix)).toBe(true);
        const guidance = JSON.parse(prompt[1]!.text.slice(prefix.length));
        expect(guidance).toEqual({
            tool: "convivium_submit_turn",
            submitTurn: {
                input: {
                    protocolVersion: 1,
                    meetingId: "meeting-1",
                    turnId: "turn-1",
                    stepId: "step-participant-scribe-4",
                    attemptId: "turn-1-attempt-4",
                    deliveryId: "turn-1-delivery-4",
                    agendaItemId: "agenda-agenda-1",
                    kind: "statement",
                    content: "<replace with the formal message>",
                    mentions: [],
                    taskIds: [],
                    agendaRelation: "on_topic",
                    changes: {}
                }
            },
            referencedMinutes: {
                instruction:
                    "For a minutes draft, change kind to summary, keep agendaRelation=on_topic, changes={}, taskIds=[], omit replyTo/completionClaims, and add this minutesDraft object.",
                minutesDraft: {
                    coverage: { fromSeq: 1, throughSeq: 1 },
                    referencedMessageIds: ["message-turn-1-delivery-2"]
                }
            }
        });

        state.transcript = [];
        state.messageSeq = 0;
        state.currentTurn!.steps[0]!.attempt!.contextThroughSeq = 0;
        sendMessage.mockClear();
        await dispatcher.dispatch({
            repository,
            parent: { id: "captain-session" } as never,
            meetingId: "meeting-1",
            signal: new AbortController().signal,
            item
        });
        const emptyPrompt = sendMessage.mock.calls[0]?.[2] as Array<{
            type: string;
            text: string;
        }>;
        const emptyGuidance = JSON.parse(emptyPrompt[1]!.text.slice(prefix.length));
        expect(emptyGuidance.referencedMinutes).toEqual({
            instruction: "No formal message is referenceable in this delivery; omit minutesDraft."
        });
    });
});
