import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { describe, expect, it, vi } from "vitest";
import { registerMeetingTools } from "@/tools/index.js";

const expectSubmitManagerPlanExecution = async (
    definition: ToolDefinition,
    execute: ReturnType<typeof vi.fn>
) => {
    await definition.execute(
        {
            protocolVersion: 1,
            meetingId: "meeting-1",
            expectedMeetingVersion: 1,
            requestId: "request-plan-1",
            action: {
                kind: "submit_manager_plan",
                agendaId: "agenda-1",
                planKind: "open_round",
                roundGoal: {
                    question: "What should this round answer?",
                    evidenceGap: "Which evidence is missing?",
                    expectedOutput: "A bounded recommendation."
                },
                rationale: "The active agenda still has an evidence gap."
            }
        },
        {
            agent: { id: "agent-1" } as Agent,
            signal: new AbortController().signal
        } as ToolRunContext
    );
    expect(execute).toHaveBeenLastCalledWith(
        expect.objectContaining({
            action: expect.objectContaining({
                kind: "submit_manager_plan",
                roundGoal: {
                    question: "What should this round answer?",
                    evidenceGap: "Which evidence is missing?",
                    expectedOutput: "A bounded recommendation."
                },
                rationale: "The active agenda still has an evidence gap."
            })
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
};

describe("target Meeting tool registration", () => {
    it("registers only target commands and binds the resolved identity", async () => {
        const definitions: ToolDefinition[] = [];
        const read = vi.fn(async () => ({
            meetingId: "meeting-1",
            version: 1,
            objective: {
                statement: "Question",
                requiredOutputs: [],
                acceptanceCriteria: [],
                hardConstraints: [],
                acceptableRiskLevel: "low" as const
            },
            lifecycle: { status: "running" as const, changedAt: 1 },
            identities: [],
            agenda: [],
            opportunityRequests: [],
            rounds: [],
            publications: [],
            evidencePackages: [],
            evidenceReviews: [],
            reviewDeliveries: [],
            messages: [],
            questions: [],
            issues: [],
            outcomes: {},
            managerPlans: [],
            tasks: [],
            privateMail: [],
            controls: []
        }));
        const execute = vi.fn(async () => ({
            kind: "rejected" as const,
            error: { code: "UNAUTHORIZED" as const, message: "denied" }
        }));
        registerMeetingTools({
            registry: {
                register: (definition) => {
                    definitions.push(definition);
                    return () => undefined;
                }
            },
            application: { execute },
            reviewWorkers: { start: vi.fn() },
            reader: { read },
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
            "convivium_read_meeting",
            "convivium_run_review_worker",
            "convivium_open_round",
            "convivium_submit_manager_plan",
            "convivium_dispose_hand_raise",
            "convivium_publish_round",
            "convivium_raise_hand",
            "convivium_submit_evidence",
            "convivium_submit_review_batch",
            "convivium_recommend_identity"
        ]);
        for (const definition of definitions) {
            expect(JSON.stringify(definition.parameters)).not.toContain('"type":"json"');
            if (
                definition.name === "convivium_read_meeting" ||
                definition.name === "convivium_run_review_worker"
            ) {
                expect(definition.parameters).toMatchObject({
                    type: "object",
                    required: ["input"],
                    properties: {
                        input: { type: "object", additionalProperties: false }
                    }
                });
                continue;
            }
            expect(definition.parameters).toMatchObject({
                type: "object",
                required: expect.arrayContaining([
                    "protocolVersion",
                    "meetingId",
                    "requestId",
                    "action"
                ]),
                properties: {
                    action: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            kind: {
                                const: definition.name.replace("convivium_", "")
                            }
                        }
                    }
                }
            });
        }

        const submitManagerPlan = definitions.find(
            ({ name }) => name === "convivium_submit_manager_plan"
        )!;
        expect(submitManagerPlan.parameters).toMatchObject({
            type: "object",
            required: [
                "protocolVersion",
                "meetingId",
                "expectedMeetingVersion",
                "requestId",
                "action"
            ],
            properties: {
                protocolVersion: { type: "integer", const: 1 },
                meetingId: { type: "string" },
                expectedMeetingVersion: { type: "integer" },
                requestId: { type: "string" },
                action: {
                    type: "object",
                    additionalProperties: false,
                    required: ["kind", "agendaId", "planKind", "rationale"],
                    properties: {
                        kind: { type: "string", const: "submit_manager_plan" },
                        agendaId: { type: "string" },
                        planKind: {
                            type: "string",
                            enum: [
                                "open_round",
                                "continue_agenda",
                                "stop_agenda",
                                "raise_agenda_candidate",
                                "wait_for_required_identity"
                            ]
                        },
                        roundGoal: {
                            type: "object",
                            additionalProperties: false,
                            required: ["question", "evidenceGap", "expectedOutput"]
                        },
                        rationale: { type: "string" },
                        blockingReason: { type: "string" }
                    }
                }
            }
        });

        const openRoundParameters = definitions.find(
            ({ name }) => name === "convivium_open_round"
        )!.parameters;
        expect(openRoundParameters).toMatchObject({
            properties: {
                action: {
                    properties: {
                        kind: { const: "open_round" },
                        agendaId: { type: "string" },
                        planId: { type: "string" },
                        deadlineAt: { type: "integer" }
                    }
                }
            }
        });

        const readMeeting = definitions.find(({ name }) => name === "convivium_read_meeting")!;
        const readResult = await readMeeting.execute(
            { input: { protocolVersion: 1, meetingId: "meeting-1" } },
            {
                agent: { id: "agent-1" } as Agent,
                signal: new AbortController().signal
            } as ToolRunContext
        );
        expect(readResult).toMatchObject({
            meetingId: "meeting-1",
            objective: { statement: "Question" }
        });
        expect(read).toHaveBeenCalledWith(
            { protocolVersion: 1, meetingId: "meeting-1" },
            expect.objectContaining({ meetingId: "meeting-1", identityId: "identity-1" }),
            expect.any(AbortSignal)
        );

        const openRound = definitions.find(({ name }) => name === "convivium_open_round")!;
        await openRound.execute(
            {
                protocolVersion: 1,
                meetingId: "meeting-1",
                expectedMeetingVersion: 1,
                requestId: "request-1",
                action: { kind: "open_round", agendaId: "agenda-1", planId: "plan-1" }
            },
            {
                agent: { id: "agent-1" } as Agent,
                signal: new AbortController().signal
            } as ToolRunContext
        );
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                action: { kind: "open_round", agendaId: "agenda-1", planId: "plan-1" }
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

        await expectSubmitManagerPlanExecution(submitManagerPlan, execute);
    });

    it("rejects cross-Meeting reads before accessing a projection", async () => {
        const definitions: ToolDefinition[] = [];
        const read = vi.fn();
        registerMeetingTools({
            registry: {
                register: (definition) => {
                    definitions.push(definition);
                    return () => undefined;
                }
            },
            application: { execute: vi.fn() },
            reviewWorkers: { start: vi.fn() },
            reader: { read },
            callers: {
                resolve: vi.fn(async () => ({
                    caller: {
                        channel: "dsh_tool" as const,
                        principalId: "identity-1",
                        sessionBindingId: "ownership-1"
                    },
                    meetingId: "meeting-owned",
                    identityId: "identity-1",
                    role: "participant" as const,
                    ownership: {
                        id: "ownership-1",
                        meetingId: "meeting-owned",
                        identityId: "identity-1",
                        sessionId: "agent-1",
                        parentSessionId: "captain-1",
                        sessionLabel: "meeting-v1",
                        provider: "continuable",
                        role: "participant" as const,
                        lifecycleStatus: "active" as const,
                        capabilityStatus: "active" as const,
                        createdAt: 1,
                        updatedAt: 1
                    }
                }))
            }
        });

        const result = await definitions
            .find(({ name }) => name === "convivium_read_meeting")!
            .execute({ input: { protocolVersion: 1, meetingId: "meeting-other" } }, {
                agent: { id: "agent-1" } as Agent,
                signal: new AbortController().signal
            } as ToolRunContext);

        expect(result).toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(read).not.toHaveBeenCalled();
    });
});
