import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { describe, expect, it, vi } from "vitest";
import { registerMeetingTools } from "@/tools/index.js";

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
            "convivium_open_round",
            "convivium_submit_manager_plan",
            "convivium_dispose_hand_raise",
            "convivium_publish_round",
            "convivium_raise_hand",
            "convivium_submit_evidence",
            "convivium_submit_review_batch",
            "convivium_recommend_identity"
        ]);

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
                input: {
                    protocolVersion: 1,
                    meetingId: "meeting-1",
                    expectedMeetingVersion: 1,
                    requestId: "request-1",
                    action: { kind: "open_round", agendaId: "agenda-1", planId: "plan-1" }
                }
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
