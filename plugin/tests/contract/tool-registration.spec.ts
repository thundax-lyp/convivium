import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { describe, expect, it } from "vitest";
import {
    registerCreateAndStatusTools,
    registerSubmitAndControlTools
} from "../../src/tools/index.js";

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
            "convivium_accept_decision",
            "convivium_dispose_decision",
            "convivium_dispose_risk",
            "convivium_create_meeting",
            "convivium_meeting_status",
            "convivium_create_meeting_task",
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
                acceptDecision: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`accept:${caller.kind}`),
                    denied()
                ),
                disposeDecision: async (_input: unknown, caller: { kind: string }) => (
                    calls.push(`dispose-decision:${caller.kind}`),
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

        const commands: Record<string, unknown> = {
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
                participants: []
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
            }
        };

        for (const definition of definitions) {
            const outcome = await definition.execute({ input: commands[definition.name] }, {
                agent,
                signal: new AbortController().signal
            } as ToolRunContext);
            expect(outcome).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
        }

        expect(calls).toEqual([
            "accept:participant",
            "dispose-decision:participant",
            "risk:participant",
            "create:participant",
            "status:participant",
            "task-create:participant",
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
