import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeMeetingSessionLabel } from "../../src/dsh/index.js";
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
        acceptanceCriteria: [],
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
        await vi.waitFor(() => expect(followups).toBe(1));
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
        await vi.waitFor(() => expect(followups).toBe(2));

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

    it("rebinds a recovered meeting to the exact live Captain before dispatch", async () => {
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

        const descendants = [
            {
                role: "manager" as const,
                sessionId: `${meetingId}-manager-manager`,
                label: encodeMeetingSessionLabel({
                    role: "manager",
                    teamId: input.teamId,
                    meetingId
                })
            },
            ...input.participants.map((participant) => {
                const participantId = `participant-${participant.participantKey}`;
                return {
                    role: "participant" as const,
                    sessionId: `${meetingId}-participant-${participantId}`,
                    label: encodeMeetingSessionLabel({
                        role: "participant",
                        teamId: input.teamId,
                        meetingId,
                        participantId
                    })
                };
            })
        ];
        let inspections = 0;
        let followups = 0;
        const recoveredRuntime = createCreateStatusRuntime({
            dataRoot: root,
            provider: "spawn",
            outboxPollMs: 5,
            resolveParent: (sessionId) =>
                sessionId === captain.sessionId ? captainAgent : undefined,
            continuable: {
                startContinuable: async () => {
                    throw new Error("recovery must not create Sessions");
                },
                listDescendants: async () => {
                    inspections += 1;
                    return descendants.map(({ sessionId, label }) => ({
                        kind: "child" as const,
                        id: sessionId as never,
                        activity: "inactive" as const,
                        mode: "continuable" as const,
                        label,
                        hasChildren: false,
                        parentId: captain.sessionId as never,
                        depth: 1
                    }));
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
        expect(inspections).toBeGreaterThan(0);
        await expect(
            recoveredRuntime.pause(
                {
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: created.result.meetingVersion,
                    requestId: "pause-recovered",
                    reason: "test rebind"
                },
                captain
            )
        ).resolves.toMatchObject({ ok: true, result: { status: "paused" } });
        await expect(
            recoveredRuntime.resume(
                {
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: created.result.meetingVersion + 1,
                    requestId: "resume-recovered"
                },
                captain
            )
        ).resolves.toMatchObject({ ok: true, result: { status: "running" } });
        await vi.waitFor(() => expect(followups).toBe(1));
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
