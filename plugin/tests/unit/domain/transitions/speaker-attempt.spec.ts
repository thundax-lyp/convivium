import { describe, expect, it } from "vitest";

import {
    failSpeakerAttempt,
    submitSpeakerAttempt,
    submitSpeakerAndAdvanceMeeting,
    type MeetingState
} from "@/domain/index.js";
import { isMeetingMinutesDraft, isMeetingStateV2 } from "@/domain/meeting-state-validation.js";
import { meeting, now } from "./fixtures.js";

function timeoutState(
    selectionMode: MeetingState["selectionMode"] = "round_robin",
    requiredParticipants: readonly string[] = ["a"]
): MeetingState {
    const state = meeting("running");
    state.selectionMode = selectionMode;
    state.activeAgendaItemId = "agenda-1";
    state.agenda = [
        {
            id: "agenda-1",
            title: "Agenda",
            objective: "Objective",
            inScope: [],
            outOfScope: [],
            completionCriteria: ["output-1"],
            requiredParticipants,
            relatedTaskIds: [],
            status: "discussing"
        }
    ];
    state.objectiveContract.requiredOutputs = [
        { id: "output-1", description: "Output", status: "pending" }
    ];
    state.limits.maxConsecutiveAttemptFailuresPerParticipant = 1;
    state.participants = [
        {
            id: "a",
            displayName: "A",
            status: "speaking",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        },
        {
            id: "b",
            displayName: "B",
            status: "available",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        }
    ];
    state.currentTurn = {
        id: "turn-1",
        seq: 1,
        agendaItemId: "agenda-1",
        intent: "explore",
        objective: "Objective",
        expectedOutputs: ["output-1"],
        prohibitedTopics: [],
        plan: ["a"],
        status: "running",
        currentStepIndex: 0,
        createdAt: now,
        steps: [
            {
                id: "step-0",
                speaker: "a",
                instruction: "Speak",
                reason: "manager_selected",
                status: "running",
                attempt: {
                    attemptId: "attempt-0",
                    participantId: "a",
                    meetingId: state.id,
                    turnId: "turn-1",
                    stepId: "step-0",
                    deliveryId: "delivery-0",
                    contextFromSeq: 0,
                    contextThroughSeq: 0,
                    taskSnapshots: [],
                    assignedAt: now,
                    deadlineAt: now + 1,
                    status: "running",
                    deliveryStatus: "pending"
                }
            }
        ]
    };
    return state;
}

const timeoutContext = {
    meetingId: "meeting-1",
    participantId: "a",
    turnId: "turn-1",
    stepId: "step-0",
    attemptId: "attempt-0",
    deliveryId: "delivery-0",
    agendaItemId: "agenda-1",
    now: now + 1,
    nextPlanningAttemptId: "planning-2",
    nextPlanningDeliveryId: "planning-delivery-2",
    catalogBinding: { kind: "none" as const }
};

describe("SpeakerAttempt timeout", () => {
    it("cancels requested tasks and stops round-robin before a partial required plan", () => {
        const state = timeoutState();
        state.meetingTasks = [
            {
                meetingTaskId: "task-1",
                participantId: "a",
                originatingSpeakerAttemptId: "attempt-0",
                title: "Pending task",
                description: "Pending task",
                blocking: false,
                status: "requested",
                createdAt: now
            }
        ];

        const result = failSpeakerAttempt(state, timeoutContext);

        expect(result.state.meetingTasks).toMatchObject([
            { meetingTaskId: "task-1", status: "cancelled", finishedAt: now + 1 }
        ]);
        expect(result.state.participants).toMatchObject([
            { id: "a", status: "available", consecutiveAttemptFailures: 1 },
            { id: "b", status: "available", consecutiveAttemptFailures: 0 }
        ]);
        expect(result.state.currentTurn).toMatchObject({
            id: "turn-1",
            status: "completed",
            steps: [
                {
                    status: "revoked",
                    attempt: { status: "revoked" }
                }
            ]
        });
        expect(result.state).toMatchObject({
            status: "waiting",
            waitState: {
                reason: "required_participant_unavailable",
                waitingSince: now + 1,
                participantIds: ["a"],
                taskIds: [],
                resumeAgendaItemId: "agenda-1"
            }
        });
        expect(result.effect.events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "speaker_attempt.revoked",
                    payload: expect.objectContaining({ reason: "timeout" })
                }),
                expect.objectContaining({
                    type: "speaker.revoked",
                    payload: expect.objectContaining({ reason: "timeout" })
                })
            ])
        );
        expect(result.effect.events.map(({ type }) => type)).not.toContain("turn.planned");
        expect(result.effect.events.map(({ type }) => type)).not.toContain("manager_plan.failed");
        expect(result.effect.events.map(({ type }) => type)).toContain("meeting_task.cancelled");
        expect(result.effect.events).toContainEqual(
            expect.objectContaining({
                type: "meeting.waiting",
                payload: expect.objectContaining({
                    reason: "required_participant_unavailable"
                })
            })
        );
    });

    it("creates the next Manager planning attempt when remaining speakers are dispatchable", () => {
        const state = timeoutState("manager", []);

        const result = failSpeakerAttempt(state, timeoutContext);

        expect(result.state.manager.currentPlanningAttempt).toMatchObject({
            id: "planning-2",
            deliveryId: "planning-delivery-2",
            status: "running",
            catalogBinding: { kind: "none" }
        });
        expect(result.effect.events.map(({ type }) => type)).toContain("manager_plan.started");
    });
});

function minutesFixture() {
    const state = timeoutState();
    state.meetingTasks = [];
    const attempt = state.currentTurn!.steps[0]!.attempt!;
    attempt.contextThroughSeq = 2;
    state.messageSeq = 2;
    state.transcript = [1, 2].map((seq) => ({
        id: `source-${seq}`,
        seq,
        turnSeq: 0,
        turnId: "source-turn",
        stepId: `source-step-${seq}`,
        attemptId: `source-attempt-${seq}`,
        speaker: "b",
        agendaItemId: "agenda-1",
        agendaRelation: "on_topic" as const,
        kind: "statement" as const,
        content: `source ${seq}`,
        mentions: [],
        taskIds: [],
        createdAt: now - 1
    }));
    const context = {
        ...timeoutContext,
        questions: [],
        message: {
            id: "draft-3",
            kind: "summary" as const,
            content: "已通过，决定发布（仅草稿）",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic" as const,
            createdAt: now,
            minutesDraft: {
                status: "draft" as const,
                coverage: { fromSeq: 1, throughSeq: 2 },
                referencedMessageIds: ["source-2"]
            }
        }
    };
    return { state, context };
}

describe("referenced minutes domain", () => {
    it.each([
        [1, 2],
        [2, 2]
    ])(
        "appends one non-authoritative draft over %s..%s without aliasing",
        (fromSeq, throughSeq) => {
            const { state, context } = minutesFixture();
            context.message.minutesDraft.coverage = { fromSeq, throughSeq };
            const before = structuredClone(state);
            const result = submitSpeakerAttempt(state, "a", state.version, context);
            const { minutesDraft: _draft, ...ordinary } = context.message;
            const plain = submitSpeakerAttempt(state, "a", state.version, {
                ...context,
                message: ordinary
            });
            expect(result.effect).toEqual(plain.effect);
            expect(state).toEqual(before);
            expect(result.state.transcript).toHaveLength(3);
            expect(result.state.transcript.slice(0, 2)).toEqual(before.transcript);
            for (const key of [
                "decisions",
                "completionFacts",
                "objectiveContract",
                "termination",
                "proposals",
                "issues"
            ] as const)
                expect(result.state[key]).toEqual(before[key]);
            const committed = structuredClone(result.state.transcript[2]);
            context.message.minutesDraft.coverage.fromSeq = 99;
            context.message.minutesDraft.referencedMessageIds.push("mutated");
            expect(result.state.transcript[2]).toEqual(committed);
            expect(plain.state.transcript[2]).not.toHaveProperty("minutesDraft");
        }
    );
    it.each(["unknown", "draft-3", "source-1"])(
        "atomically rejects unavailable reference %s",
        (id) => {
            const { state, context } = minutesFixture();
            context.message.minutesDraft.coverage.fromSeq = 2;
            context.message.minutesDraft.referencedMessageIds = ["source-2", id];
            const before = structuredClone(state);
            expect(() => submitSpeakerAttempt(state, "a", state.version, context)).toThrow(
                "Invalid minutes draft."
            );
            expect(state).toEqual(before);
        }
    );
    it.each(["hole", "duplicate-seq", "duplicate-id", "future", "before-context", "empty-context"])(
        "rejects invalid coverage %s",
        (kind) => {
            const { state, context } = minutesFixture();
            if (kind === "hole") state.transcript = state.transcript.slice(1);
            if (kind === "duplicate-seq") state.transcript[0]!.seq = 2;
            if (kind === "duplicate-id") state.transcript[0]!.id = "source-2";
            if (kind === "future") context.message.minutesDraft.coverage.throughSeq = 3;
            if (kind === "before-context") state.currentTurn!.steps[0]!.attempt!.contextFromSeq = 2;
            if (kind === "empty-context")
                state.currentTurn!.steps[0]!.attempt!.contextThroughSeq = 0;
            const before = structuredClone(state);
            expect(() => submitSpeakerAttempt(state, "a", state.version, context)).toThrow(
                "Invalid minutes draft."
            );
            expect(state).toEqual(before);
        }
    );
    it.each([
        null,
        {},
        {
            status: "accepted",
            coverage: { fromSeq: 1, throughSeq: 2 },
            referencedMessageIds: ["source-2"]
        },
        {
            status: "draft",
            coverage: { fromSeq: 2, throughSeq: 1 },
            referencedMessageIds: ["source-2"]
        },
        {
            status: "draft",
            coverage: { fromSeq: 1, throughSeq: 2 },
            referencedMessageIds: ["source-2", "source-2"]
        }
    ])("rejects malformed metadata through the pure transition and V2 guard %#", (metadata) => {
        const { state, context } = minutesFixture();
        const before = structuredClone(state);
        const invalid = { ...context, message: { ...context.message, minutesDraft: metadata } };
        // Deliberately malformed boundary input exercises guards without Protocol validation.
        expect(() =>
            Reflect.apply(submitSpeakerAttempt, undefined, [state, "a", state.version, invalid])
        ).toThrow("Invalid minutes draft.");
        expect(state).toEqual(before);
        expect(isMeetingMinutesDraft(metadata)).toBe(false);
        expect(
            isMeetingStateV2({
                ...state,
                transcript: [{ ...state.transcript[0], minutesDraft: metadata }]
            })
        ).toBe(false);
    });
    it.each([
        { content: " " },
        { content: "x".repeat(8001) },
        { kind: "statement" },
        { taskIds: ["task-1"] },
        { replyTo: "source-1" },
        { agendaRelation: "supporting_context" }
    ])("rejects incompatible pure message fields %#", (fields) => {
        const { state, context } = minutesFixture();
        const before = structuredClone(state);
        expect(() =>
            Reflect.apply(submitSpeakerAttempt, undefined, [
                state,
                "a",
                state.version,
                { ...context, message: { ...context.message, ...fields } }
            ])
        ).toThrow("Invalid minutes draft.");
        expect(state).toEqual(before);
    });
    it("retains version, attempt and terminal guards", () => {
        const { state, context } = minutesFixture();
        expect(() => submitSpeakerAttempt(state, "a", state.version - 1, context)).toThrow();
        expect(() =>
            submitSpeakerAttempt(state, "a", state.version, { ...context, attemptId: "wrong" })
        ).toThrow();
        for (const status of [
            "completed",
            "partial",
            "cancelled",
            "archiving",
            "archived"
        ] as const)
            expect(() =>
                submitSpeakerAttempt({ ...state, status }, "a", state.version, context)
            ).toThrow();
    });
    it.each([
        "questions",
        "issues",
        "proposals",
        "positions",
        "agendaCandidates",
        "decisionCandidates",
        "completion"
    ])("rejects mixed %s before any authoritative mutation", (field) => {
        const { state, context } = minutesFixture();
        const before = structuredClone(state);
        const mixed = { ...context, [field]: field === "completion" ? {} : [{}] };
        expect(() =>
            Reflect.apply(submitSpeakerAndAdvanceMeeting, undefined, [state, "a", mixed])
        ).toThrow("Invalid minutes draft.");
        expect(state).toEqual(before);
    });
    it("advances an ordinary draft without interpreting its prose as completion", () => {
        const { state, context } = minutesFixture();
        const result = submitSpeakerAndAdvanceMeeting(state, "a", context);
        expect(result.state.decisions).toEqual(state.decisions);
        expect(result.state.completionFacts).toEqual(state.completionFacts);
        expect(result.state.objectiveContract).toEqual(state.objectiveContract);
        expect(result.state.transcript.at(-1)?.minutesDraft).toEqual(context.message.minutesDraft);
        expect(result.state.status).not.toBe("completed");
    });
});
