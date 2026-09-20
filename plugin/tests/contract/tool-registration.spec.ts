import { CaptainAttendanceDispositionResultSchema } from "@/protocol/index.js";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { describe, expect, it, vi } from "vitest";
import { resolveMeetingCaller, type MeetingOwnershipRecord } from "@/dsh/index.js";
import {
    registerCreateAndStatusTools,
    registerMeetingToolsV1,
    registerSubmitAndControlTools
} from "@/tools/index.js";

const unauthorizedCommands: Record<string, unknown> = {
    convivium_contribution: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        requestId: "notify-1",
        expectedMeetingVersion: 1,
        action: "notify_manager",
        reason: "Review pending work"
    },
    convivium_read_contribution: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        contributionId: "contribution-1"
    },
    convivium_create_meeting: {
        protocolVersion: 1,
        requestId: "request-1",
        teamId: "team-1",
        topic: "Release",
        objective: "Decide scope",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [],
            hardConstraints: [],
            requiredReviewerKeys: [],
            riskAcceptanceAuthorityKeys: [],
            acceptableRiskLevel: "low"
        },
        agenda: [
            {
                key: "agenda-1",
                title: "Scope",
                objective: "Review scope",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipantKeys: []
            }
        ],
        evidenceReviewerKey: "reviewer",
        participants: [{ participantKey: "reviewer", displayName: "Reviewer" }]
    },
    convivium_meeting_status: { protocolVersion: 1, meetingId: "meeting-1" },
    convivium_create_meeting_task: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        attemptId: "attempt-1",
        requestId: "task-request-1",
        title: "Run tests",
        description: "Run the tests",
        blocking: false
    },
    convivium_meeting_task_status: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        meetingTaskId: "meeting-task-1"
    },
    convivium_start_meeting_task: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        meetingTaskId: "meeting-task-1",
        requestId: "task-start-1"
    },
    convivium_finish_meeting_task: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        meetingTaskId: "meeting-task-1",
        requestId: "task-finish-1",
        executionId: "execution-1",
        status: "completed"
    },
    convivium_raise_hand: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        requestId: "raise-1",
        reason: "new_evidence",
        summary: "Evidence is ready",
        taskIds: [],
        priority: "normal"
    },
    convivium_submit_turn: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        turnId: "turn-1",
        stepId: "step-1",
        attemptId: "attempt-1",
        deliveryId: "delivery-1",
        agendaItemId: "agenda-1",
        kind: "statement",
        content: "message",
        mentions: [],
        taskIds: [],
        agendaRelation: "on_topic",
        changes: {}
    },
    convivium_dispose_attendance_recommendation: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 1,
        requestId: "request-1",
        recommendationId: "recommendation-1",
        decision: "reject",
        reason: "Outside scope"
    },
    convivium_submit_manager_plan: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        planningAttemptId: "planning-1",
        observedMeetingVersion: 1,
        requestId: "request-1",
        agendaItemId: "agenda-1",
        intent: "review",
        objective: "Review scope",
        expectedOutputs: [],
        prohibitedTopics: [],
        steps: [
            {
                participantId: "participant-1",
                instruction: "Review scope",
                reason: "required_reviewer"
            }
        ]
    },
    convivium_pause_meeting: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 1,
        requestId: "request-1",
        reason: "pause"
    },
    convivium_resume_meeting: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 1,
        requestId: "request-1"
    },
    convivium_reassign_turn: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 1,
        currentAttemptId: "attempt-1",
        action: "skip",
        reason: "speaker unavailable",
        requestId: "request-1"
    },
    convivium_dispose_risk: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 1,
        requestId: "request-1",
        issueId: "issue-1",
        decision: "reject",
        reason: "not accepted",
        evidenceMessageIds: ["message-1"]
    },
    convivium_dispose_decision: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 1,
        requestId: "dispose-decision-1",
        decisionId: "decision-1",
        action: "revoke",
        reason: "Decision is no longer valid",
        evidenceMessageIds: ["message-1"]
    },
    convivium_send_message: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 1,
        requestId: "request-1",
        recipient: {
            kind: "meeting_participant",
            meetingId: "meeting-1",
            participantId: "participant-two"
        },
        content: "hello",
        meetingContext: {
            meetingId: "meeting-1",
            contextFromSeq: 0,
            contextThroughSeq: 0,
            relevantMessageIds: []
        }
    },
    convivium_finish_meeting_mail: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        mailId: "mail-1",
        handlingAttemptId: "attempt-1",
        deliveryId: "delivery-1",
        requestId: "request-1",
        status: "processed"
    },
    convivium_end_meeting: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 1,
        outcome: "cancelled",
        reason: "cancel",
        acceptedDecisionIds: [],
        deferredAgendaItemIds: [],
        waivers: [],
        requestId: "request-1"
    },
    convivium_accept_decision: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 1,
        requestId: "request-1",
        decisionCandidateId: "candidate-1",
        reason: "accept",
        evidenceMessageIds: []
    },
    convivium_dispose_agenda_candidate: {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 1,
        requestId: "request-1",
        candidateId: "candidate-1",
        action: "park"
    }
};

describe("target Meeting tool registration", () => {
    it("registers exactly the eight target tools through the command application", async () => {
        const definitions: ToolDefinition[] = [];
        const execute = vi.fn(async () => ({
            kind: "rejected" as const,
            error: { code: "UNAUTHORIZED" as const, message: "denied" }
        }));
        registerMeetingToolsV1({
            registry: {
                register: (definition) => {
                    definitions.push(definition);
                    return () => undefined;
                }
            },
            application: { execute },
            callers: {
                resolve: vi.fn(async () => ({
                    caller: {
                        channel: "dsh_tool" as const,
                        principalId: "identity-1",
                        sessionBindingId: "ownership-1"
                    },
                    meetingId: "meeting-1",
                    identityId: "identity-1",
                    role: "manager" as const,
                    ownership: {
                        id: "ownership-1",
                        meetingId: "meeting-1",
                        identityId: "identity-1",
                        sessionId: "agent-1",
                        parentSessionId: "captain-1",
                        sessionLabel: "meeting-v1",
                        provider: "continuable",
                        role: "manager" as const,
                        lifecycleStatus: "active" as const,
                        capabilityStatus: "active" as const,
                        createdAt: 1,
                        updatedAt: 1
                    }
                }))
            }
        });

        expect(definitions.map(({ name }) => name)).toEqual([
            "convivium_create_meeting",
            "convivium_open_round",
            "convivium_dispose_hand_raise",
            "convivium_publish_round",
            "convivium_raise_hand",
            "convivium_submit_evidence",
            "convivium_submit_review_batch",
            "convivium_recommend_identity"
        ]);
        for (const definition of definitions)
            expect(definition.parameters).toMatchObject({
                type: "object",
                required: ["input"],
                properties: { input: {} }
            });
        expect(
            definitions.find(({ name }) => name === "convivium_submit_review_batch")?.parameters
                .properties.input.description
        ).toContain("exactly one top-level field named input");

        const openRound = definitions.find(({ name }) => name === "convivium_open_round")!;
        const result = await openRound.execute(
            {
                input: {
                    protocolVersion: 1,
                    meetingId: "meeting-1",
                    expectedMeetingVersion: 1,
                    requestId: "request-1",
                    action: { kind: "open_round", agendaId: "agenda-1" }
                }
            },
            {
                agent: { id: "agent-1" } as Agent,
                signal: new AbortController().signal
            } as ToolRunContext
        );
        expect(result).toEqual({
            kind: "rejected",
            error: { code: "UNAUTHORIZED", message: "denied" }
        });
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                meetingId: "meeting-1",
                action: { kind: "open_round", agendaId: "agenda-1" }
            }),
            expect.objectContaining({
                caller: {
                    channel: "dsh_tool",
                    principalId: "identity-1",
                    sessionBindingId: "ownership-1"
                }
            }),
            expect.any(AbortSignal)
        );
    });
});

describe("meeting tool registration", () => {
    it("passes task-linked submit_turn through the registration boundary as a canonical value", async () => {
        const definitions: ToolDefinition[] = [];
        let submitted: unknown;
        const denied = async () => ({
            protocolVersion: 1 as const,
            ok: false as const,
            code: "UNSUPPORTED_CAPABILITY" as const,
            message: "not exercised",
            retryable: false
        });
        registerSubmitAndControlTools({
            registry: { register: (definition) => (definitions.push(definition), () => undefined) },
            callers: {
                resolve: async () => ({ sessionId: "participant-session", kind: "participant" })
            },
            runtime: {
                createMeeting: denied,
                getStatus: denied,
                createMeetingTask: denied,
                meetingTaskStatus: denied,
                startMeetingTask: denied,
                finishMeetingTask: denied,
                sendMeetingMessage: denied,
                finishMeetingMail: denied,
                raiseHand: denied,
                submitTurn: async (input) => {
                    submitted = input;
                    return {
                        protocolVersion: 1,
                        ok: false,
                        code: "STALE_ATTEMPT",
                        message: "task source is not current",
                        retryable: false
                    };
                },
                submitManagerPlan: denied,
                pause: denied,
                resume: denied,
                endMeeting: denied
            }
        });

        const submit = definitions.find(
            (definition) => definition.name === "convivium_submit_turn"
        );
        expect(submit?.description).toContain(
            "content is public meeting speech, not an execution report."
        );
        const readContribution = definitions.find(
            (definition) => definition.name === "convivium_read_contribution"
        );
        expect(readContribution?.description).toContain("assigned reviewer can inspect published");
        expect(readContribution?.description).not.toContain("boundary-review draft");
        const input = {
            protocolVersion: 1,
            meetingId: "meeting-1",
            turnId: "turn-1",
            stepId: "step-1",
            attemptId: "attempt-1",
            deliveryId: "delivery-1",
            agendaItemId: "agenda-1",
            kind: "statement",
            content: "message",
            mentions: [],
            taskIds: ["meeting-task-1"],
            agendaRelation: "on_topic",
            changes: {}
        };
        const outcome = await submit?.execute({ input }, {
            agent: {} as Agent,
            signal: new AbortController().signal
        } as ToolRunContext);

        expect(submitted).toMatchObject({ taskIds: ["meeting-task-1"] });
        expect(outcome).toEqual({
            protocolVersion: 1,
            ok: false,
            code: "STALE_ATTEMPT",
            message: "task source is not current",
            retryable: false
        });
    });

    it.each([false, true])(
        "passes minutes metadata through execute with frozen=%s and rejects invalid input before runtime",
        async (frozen) => {
            const definitions: ToolDefinition[] = [];
            let submitted: unknown;
            const denied = async () => ({
                protocolVersion: 1 as const,
                ok: false as const,
                code: "UNSUPPORTED_CAPABILITY" as const,
                message: "not exercised",
                retryable: false
            });
            registerSubmitAndControlTools({
                registry: {
                    register: (definition) => (definitions.push(definition), () => undefined)
                },
                callers: {
                    resolve: async () => ({ sessionId: "participant-session", kind: "participant" })
                },
                runtime: {
                    createMeeting: denied,
                    getStatus: denied,
                    createMeetingTask: denied,
                    meetingTaskStatus: denied,
                    startMeetingTask: denied,
                    finishMeetingTask: denied,
                    sendMeetingMessage: denied,
                    finishMeetingMail: denied,
                    raiseHand: denied,
                    submitTurn: async (input) => {
                        submitted = input;
                        return {
                            protocolVersion: 1,
                            ok: false,
                            code: "STALE_ATTEMPT",
                            message: "task source is not current",
                            retryable: false
                        };
                    },
                    submitManagerPlan: denied,
                    pause: denied,
                    resume: denied,
                    endMeeting: denied
                }
            });

            const submit = definitions.find(
                (definition) => definition.name === "convivium_submit_turn"
            );
            const input = {
                protocolVersion: 1,
                meetingId: "meeting-1",
                turnId: "turn-1",
                stepId: "step-1",
                attemptId: "attempt-1",
                deliveryId: "delivery-1",
                agendaItemId: "agenda-1",
                kind: "summary",
                content: "message",
                mentions: [],
                taskIds: [],
                minutesDraft: {
                    coverage: { fromSeq: 1, throughSeq: 1 },
                    referencedMessageIds: ["source-1"]
                },
                agendaRelation: "on_topic",
                changes: {}
            };
            const before = structuredClone(input);
            if (frozen) {
                Object.freeze(input.minutesDraft.coverage);
                Object.freeze(input.minutesDraft.referencedMessageIds);
                Object.freeze(input.minutesDraft);
                Object.freeze(input.changes);
                Object.freeze(input.mentions);
                Object.freeze(input.taskIds);
                Object.freeze(input);
            }
            const outcome = await submit?.execute({ input }, {
                agent: {} as Agent,
                signal: new AbortController().signal
            } as ToolRunContext);

            expect(submitted).toMatchObject({ minutesDraft: input.minutesDraft });
            expect(input).toEqual(before);
            submitted = undefined;
            const invalid = await submit!.execute({ input: { ...input, minutesDraft: null } }, {
                agent: {} as Agent,
                signal: new AbortController().signal
            } as ToolRunContext);
            expect(invalid).toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
            expect(submitted).toBeUndefined();
            expect(submit!.output.render({ input }, outcome)).toEqual([
                { type: "text", text: JSON.stringify(outcome) }
            ]);
            expect(outcome).toEqual({
                protocolVersion: 1,
                ok: false,
                code: "STALE_ATTEMPT",
                message: "task source is not current",
                retryable: false
            });
        }
    );
});

describe("meeting create and status tool registration", () => {
    it("registers create and status with mandatory canonical outputs", () => {
        const definitions: ToolDefinition[] = [];
        registerCreateAndStatusTools({
            registry: { register: (definition) => (definitions.push(definition), () => undefined) },
            callers: { resolve: async () => ({ sessionId: "captain-session", kind: "captain" }) },
            runtime: {
                createMeeting: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                getStatus: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "MEETING_NOT_FOUND",
                    message: "not found",
                    retryable: false
                }),
                submitTurn: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                submitManagerPlan: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                pause: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                resume: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                endMeeting: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                disposeRisk: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNAUTHORIZED_CALLER",
                    message: "not exercised",
                    retryable: false
                }),
                disposeAttendanceRecommendation: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "INVALID_ARGUMENT",
                    message: "not exercised",
                    retryable: false
                }),
                acceptDecision: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNAUTHORIZED_CALLER",
                    message: "not exercised",
                    retryable: false
                }),
                disposeDecision: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNAUTHORIZED_CALLER",
                    message: "not exercised",
                    retryable: false
                }),
                disposeAgendaCandidate: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNAUTHORIZED_CALLER",
                    message: "not exercised",
                    retryable: false
                })
            }
        });
        registerSubmitAndControlTools({
            registry: { register: (definition) => (definitions.push(definition), () => undefined) },
            callers: { resolve: async () => ({ sessionId: "captain-session", kind: "captain" }) },
            runtime: {
                createMeeting: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                getStatus: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                submitTurn: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                submitManagerPlan: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                pause: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                resume: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                endMeeting: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                })
            }
        });

        expect(definitions.map((definition) => definition.name)).toEqual([
            "convivium_dispose_attendance_recommendation",
            "convivium_accept_decision",
            "convivium_dispose_decision",
            "convivium_dispose_agenda_candidate",
            "convivium_dispose_risk",
            "convivium_create_meeting",
            "convivium_meeting_status",
            "convivium_create_meeting_task",
            "convivium_contribution",
            "convivium_read_contribution",
            "convivium_send_message",
            "convivium_finish_meeting_mail",
            "convivium_meeting_task_status",
            "convivium_start_meeting_task",
            "convivium_finish_meeting_task",
            "convivium_raise_hand",
            "convivium_submit_manager_plan",
            "convivium_submit_turn",
            "convivium_pause_meeting",
            "convivium_resume_meeting",
            "convivium_reassign_turn",
            "convivium_end_meeting"
        ]);
        expect(definitions.every((definition) => definition.output !== undefined)).toBe(true);
        const createMeeting = definitions.find(
            (definition) => definition.name === "convivium_create_meeting"
        );
        expect(
            (createMeeting?.parameters.properties as Record<string, { description?: string }>).input
                .description
        ).toContain("evidenceReviewerKey");
    });

    it("binds status authorization to exec.agent and never caller-controlled input", async () => {
        const definitions: ToolDefinition[] = [];
        const agent = {} as Agent;
        let resolvedAgent: Agent | undefined;
        registerCreateAndStatusTools({
            registry: { register: (definition) => (definitions.push(definition), () => undefined) },
            callers: {
                resolve: async (candidate) => {
                    resolvedAgent = candidate;
                    return { sessionId: "captain-session", kind: "captain" };
                }
            },
            runtime: {
                createMeeting: async () => {
                    throw new Error("create must not run");
                },
                getStatus: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "MEETING_NOT_FOUND",
                    message: "not found",
                    retryable: false
                }),
                submitTurn: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                submitManagerPlan: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                pause: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                resume: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                }),
                endMeeting: async () => ({
                    protocolVersion: 1,
                    ok: false,
                    code: "UNSUPPORTED_CAPABILITY",
                    message: "not exercised",
                    retryable: false
                })
            }
        });

        const status = definitions.find(
            (definition) => definition.name === "convivium_meeting_status"
        );
        expect(status).toBeDefined();
        const outcome = await status?.execute(
            { input: { protocolVersion: 1, meetingId: "meeting-1", caller: "forged" } },
            { agent, signal: new AbortController().signal } as ToolRunContext
        );

        expect(resolvedAgent).toBe(agent);
        expect(outcome).toMatchObject({ ok: false, code: "MEETING_NOT_FOUND" });
    });
});

describe("meeting tool caller binding", () => {
    const reviewerOwnership = (
        overrides: Partial<MeetingOwnershipRecord> = {}
    ): MeetingOwnershipRecord => ({
        id: "ownership-1",
        meetingId: "meeting-1",
        identityId: "reviewer-1",
        sessionId: "reviewer-session",
        parentSessionId: "captain-session",
        sessionLabel: "target-ownership-does-not-use-a-legacy-label",
        provider: "spawn",
        role: "evidence_reviewer",
        lifecycleStatus: "active",
        capabilityStatus: "active",
        createdAt: 1,
        updatedAt: 1,
        ...overrides
    });

    const resolveReviewer = (ownership: MeetingOwnershipRecord) =>
        resolveMeetingCaller(
            { id: "reviewer-session" } as Agent,
            {
                findBySessionId: async () => ({
                    teamId: "team-1",
                    meetingId: "meeting-1",
                    ownership
                })
            },
            new AbortController().signal
        );

    it.each(["id", "meetingId", "identityId"] as const)(
        "rejects target reviewer ownership without %s",
        async (field) => {
            const ownership = reviewerOwnership();
            Reflect.deleteProperty(ownership, field);

            await expect(resolveReviewer(ownership)).resolves.toMatchObject({
                ok: false,
                code: "UNAUTHORIZED_CALLER"
            });
        }
    );

    it("resolves a target reviewer but keeps it out of legacy meeting tools", async () => {
        const definitions: ToolDefinition[] = [];
        const getStatus = vi.fn(() => {
            throw new Error("legacy runtime must not receive a reviewer caller");
        });
        const resolved = await resolveReviewer(reviewerOwnership());
        expect(resolved).toMatchObject({
            kind: "evidence_reviewer",
            meetingId: "meeting-1",
            identityId: "reviewer-1"
        });

        registerCreateAndStatusTools({
            registry: { register: (definition) => (definitions.push(definition), () => undefined) },
            callers: { resolve: async () => resolved },
            runtime: { getStatus } as never
        });
        const status = definitions.find(
            (definition) => definition.name === "convivium_meeting_status"
        );
        const outcome = await status?.execute(
            { input: { protocolVersion: 1, meetingId: "meeting-1" } },
            {
                agent: { id: "reviewer-session" } as Agent,
                signal: new AbortController().signal
            } as ToolRunContext
        );

        expect(outcome).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
        expect(getStatus).not.toHaveBeenCalled();
    });

    it("rejects calls without an Agent before invoking the runtime", async () => {
        const definitions: ToolDefinition[] = [];
        let runtimeCalls = 0;
        registerCreateAndStatusTools({
            registry: { register: (definition) => (definitions.push(definition), () => undefined) },
            callers: { resolve: async () => ({ sessionId: "captain-session", kind: "captain" }) },
            runtime: {
                createMeeting: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                },
                getStatus: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                },
                submitTurn: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                },
                submitManagerPlan: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                },
                pause: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                },
                resume: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                },
                endMeeting: async () => {
                    runtimeCalls += 1;
                    throw new Error("must not run");
                }
            }
        });

        const status = definitions.find(
            (definition) => definition.name === "convivium_meeting_status"
        );
        const outcome = await status?.execute(
            { input: { protocolVersion: 1, meetingId: "meeting-1" } },
            { signal: new AbortController().signal } as ToolRunContext
        );

        expect(outcome).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
        expect(runtimeCalls).toBe(0);
    });

    it("forwards the DSH-bound caller to each command and preserves runtime authorization errors", async () => {
        const definitions: ToolDefinition[] = [];
        const calls: string[] = [];
        const agent = {} as Agent;
        const denied = () => ({
            protocolVersion: 1 as const,
            ok: false as const,
            code: "UNAUTHORIZED_CALLER",
            message: "caller cannot perform this operation",
            retryable: false
        });
        const dependencies = {
            registry: {
                register: (definition: ToolDefinition) => (
                    definitions.push(definition),
                    () => undefined
                )
            },
            callers: {
                resolve: async () => ({
                    sessionId: "participant-session",
                    kind: "participant" as const,
                    participantId: "participant-1"
                })
            },
            runtime: {
                createMeeting: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`create:${caller.kind}`),
                    denied()
                ),
                applyContribution: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`contribution:${caller.kind}`),
                    denied()
                ),
                readContribution: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`read-contribution:${caller.kind}`),
                    denied()
                ),
                getStatus: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`status:${caller.kind}`),
                    denied()
                ),
                createMeetingTask: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`task-create:${caller.kind}`),
                    denied()
                ),
                meetingTaskStatus: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`task-status:${caller.kind}`),
                    denied()
                ),
                startMeetingTask: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`task-start:${caller.kind}`),
                    denied()
                ),
                finishMeetingTask: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`task-finish:${caller.kind}`),
                    denied()
                ),
                sendMeetingMessage: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`send-message:${caller.kind}`),
                    denied()
                ),
                finishMeetingMail: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`finish-mail:${caller.kind}`),
                    denied()
                ),
                raiseHand: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`raise-hand:${caller.kind}`),
                    denied()
                ),
                submitTurn: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`submit:${caller.kind}`),
                    denied()
                ),
                submitManagerPlan: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`manager-plan:${caller.kind}`),
                    denied()
                ),
                pause: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`pause:${caller.kind}`),
                    denied()
                ),
                resume: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`resume:${caller.kind}`),
                    denied()
                ),
                reassignTurn: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`reassign:${caller.kind}`),
                    denied()
                ),
                disposeRisk: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`risk:${caller.kind}`),
                    denied()
                ),
                disposeAttendanceRecommendation: async (
                    _input: unknown,
                    caller: { kind: string }
                ) => (calls.push(`dispose-attendance:${caller.kind}`), denied()),
                acceptDecision: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`accept:${caller.kind}`),
                    denied()
                ),
                disposeDecision: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`dispose-decision:${caller.kind}`),
                    denied()
                ),
                disposeAgendaCandidate: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`dispose-agenda-candidate:${caller.kind}`),
                    denied()
                ),
                endMeeting: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`end:${caller.kind}`),
                    denied()
                )
            }
        };
        registerCreateAndStatusTools(dependencies);
        registerSubmitAndControlTools(dependencies);

        for (const definition of definitions) {
            const outcome = await definition.execute(
                { input: unauthorizedCommands[definition.name] },
                {
                    agent,
                    signal: new AbortController().signal
                } as ToolRunContext
            );
            expect(outcome).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
        }

        expect(calls).toEqual([
            "dispose-attendance:participant",
            "accept:participant",
            "dispose-decision:participant",
            "dispose-agenda-candidate:participant",
            "risk:participant",
            "create:participant",
            "status:participant",
            "task-create:participant",
            "contribution:participant",
            "read-contribution:participant",
            "send-message:participant",
            "finish-mail:participant",
            "task-status:participant",
            "task-start:participant",
            "task-finish:participant",
            "raise-hand:participant",
            "manager-plan:participant",
            "submit:participant",
            "pause:participant",
            "resume:participant",
            "reassign:participant",
            "end:participant"
        ]);
    });
});

describe("Captain attendance tool registration", () => {
    it("validates, forwards, renders and unregisters Captain attendance rejection", async () => {
        const definitions = new Map<string, ToolDefinition>();
        const denied = vi.fn(async (): Promise<never> => {
            throw new Error("unexpected call");
        });
        const success = {
            protocolVersion: 1,
            ok: true,
            meetingId: "meeting-1",
            meetingVersion: 2,
            result: {
                requestId: "reject-1",
                recommendationId: "recommendation-1",
                disposition: "rejected"
            }
        };
        const dispose = vi.fn(async () => success);
        const caller = { kind: "captain" as const, sessionId: "captain-session" };
        const resolve = vi.fn(async () => caller);
        const disposers = registerCreateAndStatusTools({
            registry: {
                register: (definition) => {
                    definitions.set(definition.name, definition);
                    return () => {
                        definitions.delete(definition.name);
                    };
                }
            },
            callers: { resolve },
            runtime: {
                acceptDecision: denied,
                disposeAttendanceRecommendation: dispose,
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
            }
        });
        const tool = definitions.get("convivium_dispose_attendance_recommendation")!;
        const input = {
            protocolVersion: 1,
            meetingId: "meeting-1",
            expectedMeetingVersion: 1,
            requestId: "reject-1",
            recommendationId: "recommendation-1",
            decision: "reject",
            reason: " Outside scope "
        };
        const exec = { agent: {} as Agent, signal: new AbortController().signal } as ToolRunContext;
        for (const invalid of [
            { ...input, decision: "approve" },
            { ...input, reason: " " },
            { ...input, actor: "captain" }
        ]) {
            expect(await tool.execute({ input: invalid }, exec)).toMatchObject({
                ok: false,
                code: "INVALID_ARGUMENT",
                retryable: false
            });
        }
        expect(dispose).not.toHaveBeenCalled();
        expect(resolve).not.toHaveBeenCalled();
        const result = await tool.execute({ input }, exec);
        expect(dispose).toHaveBeenCalledExactlyOnceWith(input, caller, exec.signal);
        expect(resolve).toHaveBeenCalledExactlyOnceWith(exec.agent, exec.signal);
        expect(result).toEqual(success);
        expect(CaptainAttendanceDispositionResultSchema(success.result)).toEqual(success.result);
        expect(await tool.output!.render!({ input }, result)).toEqual([
            { type: "text", text: JSON.stringify(success) }
        ]);
        const error = {
            protocolVersion: 1,
            ok: false,
            code: "ATTENDANCE_RECOMMENDATION_NOT_PENDING",
            message: "The attendance recommendation is not pending.",
            retryable: false
        };
        dispose.mockResolvedValueOnce(error);
        const rejected = await tool.execute({ input }, exec);
        expect(rejected).toEqual(error);
        expect(await tool.output!.render!({ input }, rejected)).toEqual([
            { type: "text", text: JSON.stringify(error) }
        ]);
        disposers.forEach((dispose) => dispose());
        expect(definitions.size).toBe(0);
        expect(denied).not.toHaveBeenCalled();
    });
});
