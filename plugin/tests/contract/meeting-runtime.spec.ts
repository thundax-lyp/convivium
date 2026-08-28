import { mkdtemp, readdir, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCreateStatusRuntime } from "../../src/tools/meeting-runtime.js";

const roots: string[] = [];
const input = {
    protocolVersion: 1 as const,
    requestId: "create-1",
    teamId: "team-1",
    topic: "Release",
    objective: "Decide scope",
    objectiveContract: {
        requiredOutputs: [],
        acceptanceCriteria: [{ key: "reviewed", description: "Reviewed" }],
        hardConstraints: [],
        requiredReviewerKeys: [],
        riskAcceptanceAuthorityKeys: [],
        acceptableRiskLevel: "medium" as const
    },
    agenda: [
        {
            key: "agenda-1",
            title: "Scope",
            objective: "Agree scope",
            inScope: ["MVP"],
            outOfScope: [],
            completionCriteria: ["Reviewed"],
            requiredParticipantKeys: ["one", "two", "three"]
        }
    ],
    participants: [
        { participantKey: "one", displayName: "One" },
        { participantKey: "two", displayName: "Two" },
        { participantKey: "three", displayName: "Three" }
    ]
};

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("create/status meeting runtime", () => {
    it("delivers the MeetingTask execution and request bindings", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-task-envelope-"));
        roots.push(root);
        const prompts: string[] = [];
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            outboxPollMs: 5,
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async (_parent, _sessionId, prompt) => {
                    const text = prompt[0]?.type === "text" ? prompt[0].text : undefined;
                    if (typeof text === "string") prompts.push(text);
                    return "followup-message" as never;
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const created = await runtime.createMeeting(
            {
                ...input,
                agenda: [
                    {
                        ...input.agenda[0]!,
                        requiredParticipantKeys: ["one"]
                    }
                ],
                participants: [input.participants[0]!]
            },
            {
                sessionId: "captain-1",
                kind: "captain",
                agent: { id: "captain-1" } as never
            },
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const meetingId = created.result.meetingId;
        const participant = {
            sessionId: `${meetingId}-participant-participant-one`,
            meetingId,
            participantId: "participant-one",
            kind: "participant" as const
        };
        const task = await runtime.createMeetingTask(
            {
                protocolVersion: 1,
                meetingId,
                attemptId: "attempt-0",
                requestId: "task-request",
                title: "Inspect release",
                description: "Inspect the release evidence",
                blocking: true
            },
            participant
        );
        if (!task.ok) throw new Error("task creation failed");

        const submitted = await runtime.submitTurn(
            {
                protocolVersion: 1,
                meetingId,
                turnId: "turn-1",
                stepId: "step-participant-one-0",
                attemptId: "attempt-0",
                deliveryId: "delivery-0",
                agendaItemId: "agenda-agenda-1",
                kind: "statement",
                content: "Task queued",
                mentions: [],
                taskIds: [task.result.meetingTaskId],
                agendaRelation: "on_topic",
                changes: {}
            },
            participant
        );
        if (!submitted.ok) throw new Error(JSON.stringify(submitted));

        const executionId = `${task.result.meetingTaskId}-execution`;
        const deliveryId = `${task.result.meetingTaskId}-delivery`;
        await vi.waitFor(() => expect(prompts.length).toBeGreaterThan(1));
        expect(prompts).toEqual(
            expect.arrayContaining([
                expect.stringContaining(`executionId: ${executionId}`),
                expect.stringContaining(`deliveryId: ${deliveryId}`)
            ])
        );
        await runtime.dispose();
    });

    it.each([{ status: "failed" as const }, { status: "completed" as const }])(
        "finishes a $status task with the matching hand raise contract",
        async ({ status }) => {
            const root = await mkdtemp(join(tmpdir(), "convivium-tools-failed-task-"));
            roots.push(root);
            const prompts: string[] = [];
            const runtime = createCreateStatusRuntime({
                dataRoot: root,
                provider: "spawn",
                outboxPollMs: 5,
                continuable: {
                    startContinuable: async (spec) => ({
                        childId: spec.childId!,
                        messageId: `initial-${String(spec.childId)}` as never
                    }),
                    followup: async (_parent, _sessionId, prompt) => {
                        const text = prompt[0]?.type === "text" ? prompt[0].text : undefined;
                        if (typeof text === "string") prompts.push(text);
                        return "followup-message" as never;
                    }
                },
                authorizationValidator: {
                    validateCreate: () => undefined,
                    validateCommand: () => undefined
                }
            });
            const created = await runtime.createMeeting(
                {
                    ...input,
                    agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
                    participants: [input.participants[0]!],
                    selectionMode: "manager"
                },
                { sessionId: "captain-1", kind: "captain", agent: { id: "captain-1" } as never },
                new AbortController().signal
            );
            if (!created.ok) throw new Error("create failed");
            const meetingId = created.result.meetingId;
            const manager = {
                sessionId: `${meetingId}-manager-manager`,
                meetingId,
                kind: "manager" as const
            };
            const planned = await runtime.submitManagerPlan(
                {
                    protocolVersion: 1,
                    meetingId,
                    requestId: "initial-plan",
                    planningAttemptId: `${meetingId}-planning-1`,
                    observedMeetingVersion: 1,
                    agendaItemId: "agenda-agenda-1",
                    intent: "explore",
                    objective: "Start task evidence flow",
                    expectedOutputs: [],
                    prohibitedTopics: [],
                    steps: [
                        {
                            participantId: "participant-one",
                            instruction: "Queue the task",
                            reason: "manager_selected"
                        }
                    ]
                },
                manager
            );
            expect(planned).toMatchObject({ ok: true });
            if (!planned.ok) throw new Error("initial plan failed");
            const participant = {
                sessionId: `${meetingId}-participant-participant-one`,
                meetingId,
                participantId: "participant-one",
                kind: "participant" as const
            };
            const task = await runtime.createMeetingTask(
                {
                    protocolVersion: 1,
                    meetingId,
                    attemptId: planned.result.firstAttemptId,
                    requestId: "task-request",
                    title: "Inspect release",
                    description: "Inspect the release evidence",
                    blocking: true
                },
                participant
            );
            if (!task.ok) throw new Error("task creation failed");
            const submitted = await runtime.submitTurn(
                {
                    protocolVersion: 1,
                    meetingId,
                    turnId: planned.result.turnId,
                    stepId: planned.result.firstStepId,
                    attemptId: planned.result.firstAttemptId,
                    deliveryId: `${planned.result.turnId}-delivery-0`,
                    agendaItemId: "agenda-agenda-1",
                    kind: "statement",
                    content: "Queue failing task",
                    mentions: [],
                    taskIds: [task.result.meetingTaskId],
                    agendaRelation: "on_topic",
                    changes: {}
                },
                participant
            );
            if (!submitted.ok) throw new Error(JSON.stringify(submitted));
            await vi.waitFor(() => expect(prompts.length).toBeGreaterThan(1));
            const executionId = `${task.result.meetingTaskId}-execution`;
            const started = await runtime.startMeetingTask(
                {
                    protocolVersion: 1,
                    meetingId,
                    meetingTaskId: task.result.meetingTaskId,
                    requestId: "failed-start",
                    executionId
                } as never,
                participant
            );
            expect(started).toMatchObject({ ok: true });
            const finishInput = {
                protocolVersion: 1,
                meetingId,
                meetingTaskId: task.result.meetingTaskId,
                requestId: "failed-finish",
                executionId,
                status,
                ...(status === "completed"
                    ? { resultSummary: "fixture result" }
                    : { failureReason: "fixture failure" })
            };
            const finished = await runtime.finishMeetingTask(finishInput, participant);
            expect(finished).toMatchObject({
                ok: true,
                result: { status }
            });
            if (!finished.ok) throw new Error("finish failed");
            if (status === "completed") {
                expect(finished.result.handRaiseId).toBe(`${task.result.meetingTaskId}-hand-raise`);
                const nextPlan = await runtime.submitManagerPlan(
                    {
                        protocolVersion: 1,
                        meetingId,
                        requestId: "next-plan",
                        planningAttemptId: `${meetingId}-planning-2`,
                        observedMeetingVersion: finished.meetingVersion,
                        agendaItemId: "agenda-agenda-1",
                        intent: "explore",
                        objective: "Continue after task evidence",
                        expectedOutputs: [],
                        prohibitedTopics: [],
                        steps: [
                            {
                                participantId: "participant-one",
                                instruction: "Continue the meeting",
                                reason: "manager_selected"
                            }
                        ]
                    },
                    manager
                );
                expect(nextPlan).toMatchObject({ ok: true });
            } else {
                expect(finished.result).not.toHaveProperty("handRaiseId");
            }
            await expect(runtime.finishMeetingTask(finishInput, participant)).resolves.toEqual(
                finished
            );
            await runtime.dispose();

            const db = new DatabaseSync(join(root, input.teamId, `${meetingId}.sqlite`));
            const state = JSON.parse(
                String(
                    db
                        .prepare("SELECT state_json FROM meetings WHERE meeting_id = ?")
                        .get(meetingId).state_json
                )
            ) as {
                handRaises: unknown[];
                manager?: { currentPlanningAttempt?: unknown };
            };
            const raiseEvents = db
                .prepare(
                    "SELECT COUNT(*) AS count FROM meeting_events WHERE meeting_id = ? AND event_type = ?"
                )
                .get(meetingId, "hand_raise.created") as { count: number };
            db.close();
            expect(state.handRaises).toHaveLength(status === "completed" ? 1 : 0);
            expect(state.manager?.currentPlanningAttempt).toBeUndefined();
            expect(raiseEvents.count).toBe(status === "completed" ? 1 : 0);

            const recoveredRuntime = createCreateStatusRuntime({
                dataRoot: root,
                provider: "spawn",
                continuable: {
                    startContinuable: async () => {
                        throw new Error("recovery must not create Sessions");
                    },
                    followup: async () => {
                        throw new Error("recovery must not dispatch a terminal task");
                    }
                },
                authorizationValidator: {
                    validateCreate: () => undefined,
                    validateCommand: () => undefined
                }
            });
            await expect(
                recoveredRuntime.meetingTaskStatus(
                    {
                        protocolVersion: 1,
                        meetingId,
                        meetingTaskId: task.result.meetingTaskId
                    },
                    participant
                )
            ).resolves.toMatchObject({
                ok: true,
                result: {
                    task: { status },
                    meetingTerminal: false,
                    mayExecute: false
                }
            });
            await recoveredRuntime.dispose();
        }
    );

    it("scopes request-derived HandRaise IDs to the Participant", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-scoped-ids-"));
        roots.push(root);
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => 100
        });
        const created = await runtime.createMeeting(
            input,
            {
                sessionId: "captain-1",
                kind: "captain",
                agent: { id: "captain-1" } as never
            },
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const request = {
            protocolVersion: 1 as const,
            meetingId: created.result.meetingId,
            requestId: "shared-request",
            reason: "new_evidence" as const,
            summary: "New evidence",
            taskIds: [],
            priority: "normal" as const
        };
        const first = await runtime.raiseHand(request, {
            sessionId: `${created.result.meetingId}-participant-participant-one`,
            meetingId: created.result.meetingId,
            participantId: "participant-one",
            kind: "participant"
        });
        const second = await runtime.raiseHand(request, {
            sessionId: `${created.result.meetingId}-participant-participant-two`,
            meetingId: created.result.meetingId,
            participantId: "participant-two",
            kind: "participant"
        });

        expect(first).toMatchObject({ ok: true });
        expect(second).toMatchObject({ ok: true });
        if (!first.ok || !second.ok) throw new Error("raise hand failed");
        expect(first.result.handRaiseId).not.toBe(second.result.handRaiseId);
        await runtime.dispose();
    });

    it("commits completion claims with the turn and rejects unavailable task evidence atomically", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-completion-"));
        roots.push(root);
        const children: Array<{ id: string; label: string }> = [];
        const interrupted: string[] = [];
        const drained: string[][] = [];
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    children.push({ id: String(spec.childId), label: spec.label });
                    return {
                        childId: spec.childId!,
                        messageId: `initial-${String(spec.childId)}` as never
                    };
                },
                followup: async () => "followup-message" as never,
                listChildren: async () =>
                    children.map((child) => ({
                        kind: "child" as const,
                        id: child.id as never,
                        activity: "inactive" as const,
                        hasChildren: false,
                        mode: "continuable" as const,
                        label: child.label
                    })),
                interrupt: (childId) => {
                    interrupted.push(String(childId));
                },
                drainContinuableChildren: async (_parent, childIds) => {
                    drained.push(childIds.map(String));
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => 100
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                objectiveContract: {
                    ...input.objectiveContract,
                    requiredOutputs: [{ key: "done", description: "Done output" }],
                    acceptanceCriteria: [{ key: "done", description: "Done criterion" }]
                },
                agenda: [
                    {
                        ...input.agenda[0]!,
                        completionCriteria: ["output-done", "criterion-done"],
                        requiredParticipantKeys: ["one"]
                    }
                ],
                participants: [input.participants[0]!]
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const meetingId = created.result.meetingId;
        const participant = {
            sessionId: `${meetingId}-participant-participant-one`,
            meetingId,
            participantId: "participant-one",
            kind: "participant" as const
        };
        const submission = {
            protocolVersion: 1 as const,
            meetingId,
            turnId: "turn-1",
            stepId: "step-participant-one-0",
            attemptId: "attempt-0",
            deliveryId: "delivery-0",
            agendaItemId: "agenda-agenda-1",
            kind: "evidence" as const,
            content: "Completion evidence",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic" as const,
            changes: {}
        };

        await expect(runtime.submitTurn(submission, captain)).resolves.toMatchObject({
            ok: false,
            code: "UNAUTHORIZED_CALLER"
        });
        await expect(
            runtime.submitTurn(submission, {
                ...participant,
                sessionId: `${meetingId}-participant-other`,
                participantId: "participant-other"
            })
        ).resolves.toMatchObject({ ok: false, code: "STALE_ATTEMPT" });

        await expect(
            runtime.submitTurn(
                {
                    ...submission,
                    completionClaims: {
                        outputClaims: [
                            {
                                subjectId: "output-done",
                                evidenceMessageIds: [],
                                taskIds: ["task-1"]
                            }
                        ]
                    }
                },
                participant
            )
        ).resolves.toMatchObject({ ok: false, code: "INVALID_STATE_TRANSITION" });
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            meetingVersion: 1,
            result: { messages: [] }
        });

        const validSubmission = {
            ...submission,
            completionClaims: {
                outputClaims: [
                    {
                        subjectId: "output-done",
                        evidenceMessageIds: ["message-delivery-0"],
                        taskIds: []
                    }
                ],
                criterionClaims: [
                    {
                        subjectId: "criterion-done",
                        evidenceMessageIds: ["message-delivery-0"],
                        taskIds: []
                    }
                ],
                agendaResolution: {
                    agendaItemId: "agenda-agenda-1",
                    resolution: "Done",
                    evidenceMessageIds: ["message-delivery-0"]
                }
            }
        };
        const committed = await runtime.submitTurn(validSubmission, participant);
        expect(committed).toMatchObject({
            ok: true,
            meetingVersion: 2,
            result: { messageSeq: 1, meetingStatus: "converging" }
        });
        await expect(runtime.submitTurn(validSubmission, participant)).resolves.toEqual(committed);
        const endInput = {
            protocolVersion: 1 as const,
            meetingId,
            expectedMeetingVersion: 2,
            outcome: "completed" as const,
            reason: "Objective contract is satisfied",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: [],
            requestId: "end-1"
        };
        await expect(runtime.endMeeting(endInput, participant)).resolves.toMatchObject({
            ok: false,
            code: "UNAUTHORIZED_CALLER"
        });
        await expect(
            runtime.endMeeting({ ...endInput, expectedMeetingVersion: 1 }, captain)
        ).resolves.toMatchObject({ ok: false, code: "VERSION_CONFLICT", retryable: true });
        const ended = await runtime.endMeeting(endInput, captain);
        expect(ended).toMatchObject({
            ok: true,
            meetingVersion: 3,
            result: { status: "completed", terminationCode: "objective_satisfied" }
        });
        expect(interrupted).toEqual(
            expect.arrayContaining([
                `${meetingId}-manager-manager`,
                `${meetingId}-participant-participant-one`
            ])
        );
        expect(drained).toEqual([
            expect.arrayContaining([
                `${meetingId}-manager-manager`,
                `${meetingId}-participant-participant-one`
            ])
        ]);
        expect(children.map((child) => child.id)).toEqual(
            expect.arrayContaining([
                `${meetingId}-manager-manager`,
                `${meetingId}-participant-participant-one`
            ])
        );
        await expect(runtime.endMeeting(endInput, captain)).resolves.toEqual(ended);
        await expect(
            runtime.endMeeting({ ...endInput, reason: "Different request hash" }, captain)
        ).resolves.toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
        await expect(
            runtime.submitTurn(
                {
                    ...submission,
                    deliveryId: "delivery-after-terminal",
                    content: "late write"
                },
                participant
            )
        ).resolves.toMatchObject({ ok: false, code: "IMMUTABLE_MEETING" });
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            meetingVersion: 5,
            result: {
                status: "archived",
                archive: { package: { meetingId }, archivedAt: 100 }
            }
        });
        await runtime.dispose();
        const restarted = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        await expect(
            restarted.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            result: {
                status: "archived",
                archive: {
                    package: { meetingId, finalSummary: "Objective contract is satisfied" },
                    archivedAt: 100
                }
            }
        });
        await restarted.dispose();
    });

    it("retries a transient dispatch through the configured outbox loop", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-outbox-retry-"));
        roots.push(root);
        let followups = 0;
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            outboxPollMs: 5,
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => {
                    followups += 1;
                    if (followups === 1) {
                        throw new Error("provider unavailable");
                    }
                    return "followup-message" as never;
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };

        await expect(
            runtime.createMeeting(input, captain, new AbortController().signal)
        ).resolves.toMatchObject({ ok: true });
        await vi.waitFor(() => expect(followups).toBe(2));
        await runtime.dispose();
    });

    it("keeps committed Manager commands successful when asynchronous dispatch fails", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-manager-dispatch-"));
        roots.push(root);
        let followups = 0;
        const managerContexts: Record<string, unknown>[] = [];
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async (_parent, _sessionId, prompt) => {
                    followups += 1;
                    const text = prompt[0]?.type === "text" ? prompt[0].text : undefined;
                    if (typeof text === "string" && text.startsWith("{")) {
                        managerContexts.push(JSON.parse(text) as Record<string, unknown>);
                    }
                    throw Object.assign(new Error("provider unavailable"), {
                        retryable: false
                    });
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const managerInput = {
            ...input,
            selectionMode: "manager" as const,
            agenda: [
                {
                    ...input.agenda[0]!,
                    requiredParticipantKeys: ["one"]
                }
            ],
            participants: [input.participants[0]!]
        };
        const created = await runtime.createMeeting(
            managerInput,
            captain,
            new AbortController().signal
        );
        expect(created).toMatchObject({ ok: true, result: { status: "running" } });
        if (!created.ok) throw new Error("create failed");
        await vi.waitFor(() => expect(followups).toBe(1), { timeout: 5000 });
        const meetingId = created.result.meetingId;
        expect(managerContexts[0]).toMatchObject({
            protocolVersion: 1,
            meetingId,
            meetingVersion: 1,
            planningAttemptId: `${meetingId}-planning-1`,
            activeAgendaItem: { id: "agenda-agenda-1" },
            requiredSpeakerIds: ["participant-one"],
            dispatchableParticipantIds: ["participant-one"],
            planningReason: "initial_plan"
        });
        const manager = {
            sessionId: `${meetingId}-manager-manager`,
            meetingId,
            kind: "manager" as const
        };
        const plan = {
            protocolVersion: 1 as const,
            meetingId,
            planningAttemptId: `${meetingId}-planning-1`,
            agendaItemId: "agenda-agenda-1",
            intent: "explore",
            objective: "Resolve scope",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-one",
                    instruction: "Address scope",
                    reason: "manager_selected"
                }
            ]
        };

        await expect(
            runtime.submitManagerPlan(
                { ...plan, observedMeetingVersion: 0, requestId: "stale-plan" },
                manager
            )
        ).resolves.toMatchObject({
            ok: false,
            code: "STALE_MANAGER_ATTEMPT",
            retryable: false
        });
        await expect(
            runtime.submitManagerPlan(
                {
                    ...plan,
                    planningAttemptId: "wrong-planning-attempt",
                    observedMeetingVersion: 1,
                    requestId: "stale-attempt"
                },
                manager
            )
        ).resolves.toMatchObject({
            ok: false,
            code: "STALE_MANAGER_ATTEMPT",
            retryable: false
        });

        const planned = await runtime.submitManagerPlan(
            { ...plan, observedMeetingVersion: 1, requestId: "plan-1" },
            manager
        );
        expect(planned).toMatchObject({ ok: true });
        if (!planned.ok) throw new Error("plan failed");
        await vi.waitFor(() => expect(followups).toBe(2), { timeout: 5000 });

        await expect(
            runtime.submitTurn(
                {
                    protocolVersion: 1,
                    meetingId,
                    turnId: planned.result.turnId,
                    stepId: planned.result.firstStepId,
                    attemptId: planned.result.firstAttemptId,
                    deliveryId: "turn-1-delivery-0",
                    agendaItemId: "agenda-agenda-1",
                    kind: "statement",
                    content: "Scope response",
                    mentions: [],
                    taskIds: [],
                    agendaRelation: "supporting_context",
                    changes: {}
                },
                {
                    sessionId: `${meetingId}-participant-participant-one`,
                    meetingId,
                    participantId: "participant-one",
                    kind: "participant"
                }
            )
        ).resolves.toMatchObject({
            ok: true,
            result: { messageSeq: 1, turnStatus: "completed", meetingStatus: "running" }
        });
        await vi.waitFor(() => expect(followups).toBe(3));
        await runtime.dispose();
    });

    it("creates through SQLite and projects status only for the bound meeting", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-"));
        roots.push(root);
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => 100
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const created = await runtime.createMeeting(input, captain, new AbortController().signal);
        expect(created).toMatchObject({
            ok: true,
            result: { meetingVersion: 1, status: "running" }
        });
        if (!created.ok) throw new Error("create failed");

        const status = await runtime.getStatus(
            { protocolVersion: 1, meetingId: created.result.meetingId },
            { ...captain, meetingId: created.result.meetingId }
        );
        expect(status).toMatchObject({
            ok: true,
            result: { status: "running", meetingVersion: 1 }
        });

        await expect(
            runtime.getStatus(
                { protocolVersion: 1, meetingId: created.result.meetingId },
                { ...captain, sessionId: "other-captain" }
            )
        ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
    });

    it("keeps recovered meetings unbound and does not dispatch from status", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-rebind-"));
        roots.push(root);
        const captainAgent = { id: "captain-1" } as never;
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: captainAgent
        };
        const firstRuntime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "initial-followup" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const created = await firstRuntime.createMeeting(
            input,
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        await firstRuntime.dispose();

        const meetingId = created.result.meetingId;
        const unboundRuntime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async () => {
                    throw new Error("recovery must not create Sessions");
                },
                followup: async () => {
                    throw new Error("an unbound recovery must not dispatch");
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        await expect(
            unboundRuntime.submitTurn(
                {
                    protocolVersion: 1,
                    meetingId,
                    turnId: "turn-1",
                    stepId: "step-participant-one-0",
                    attemptId: "turn-1-attempt-0",
                    deliveryId: "turn-1-delivery-0",
                    agendaItemId: "agenda-agenda-1",
                    kind: "statement",
                    content: "must not commit",
                    mentions: [],
                    taskIds: [],
                    agendaRelation: "on_topic",
                    changes: {}
                },
                {
                    sessionId: `${meetingId}-participant-participant-one`,
                    meetingId,
                    participantId: "participant-one",
                    kind: "participant"
                }
            )
        ).resolves.toMatchObject({ ok: false, code: "INTERNAL_ERROR", retryable: true });
        await unboundRuntime.dispose();

        let followups = 0;
        const recoveredRuntime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            outboxPollMs: 5,
            continuable: {
                startContinuable: async () => {
                    throw new Error("recovery must not create Sessions");
                },
                listDescendants: async () => {
                    throw new Error("cold status must not inspect descendants");
                },
                followup: async () => {
                    followups += 1;
                    return "recovered-followup" as never;
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        await expect(
            recoveredRuntime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({ ok: true });
        expect(followups).toBe(0);
        await recoveredRuntime.dispose();
    });

    it("rejects non-Captain creation and mismatched control callers before SQLite access", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-auth-"));
        roots.push(root);
        let starts = 0;
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    starts += 1;
                    return { childId: spec.childId!, messageId: "initial" as never };
                },
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const participant = { sessionId: "participant-1", kind: "participant" as const };
        await expect(
            runtime.createMeeting(input, participant, new AbortController().signal)
        ).resolves.toMatchObject({
            ok: false,
            code: "UNAUTHORIZED_CALLER"
        });
        await expect(
            runtime.pause(
                {
                    protocolVersion: 1,
                    meetingId: "meeting-1",
                    expectedMeetingVersion: 0,
                    requestId: "pause-1",
                    reason: "stop"
                },
                { sessionId: "captain-1", kind: "captain", meetingId: "other-meeting" }
            )
        ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
        expect(starts).toBe(0);
    });

    it("rejects an empty agenda before repository or Session provisioning", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-empty-agenda-"));
        roots.push(root);
        let starts = 0;
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    starts += 1;
                    return { childId: spec.childId!, messageId: "initial" as never };
                },
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const result = await runtime.createMeeting(
            { ...input, agenda: [] },
            {
                sessionId: "captain-1",
                kind: "captain",
                agent: { id: "captain-1" } as never
            },
            new AbortController().signal
        );

        expect(result).toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
        expect(starts).toBe(0);
        await expect(readdir(root)).resolves.toEqual([]);
        await runtime.dispose();
    });

    it("replays only the same create request for its original Captain", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-idempotency-"));
        roots.push(root);
        let starts = 0;
        const runtime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    starts += 1;
                    return { childId: spec.childId!, messageId: "initial" as never };
                },
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const first = await runtime.createMeeting(input, captain, new AbortController().signal);
        if (!first.ok) throw new Error("create failed");
        await runtime.pause(
            {
                protocolVersion: 1,
                meetingId: first.result.meetingId,
                expectedMeetingVersion: first.result.meetingVersion,
                requestId: "pause-before-create-replay",
                reason: "verify persisted receipt"
            },
            captain
        );
        const replay = await runtime.createMeeting(input, captain, new AbortController().signal);
        expect(replay).toEqual(first);
        expect(starts).toBe(4);

        const conflict = await runtime.createMeeting(
            { ...input, topic: "Different" },
            captain,
            new AbortController().signal
        );
        expect(conflict).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    });
});
