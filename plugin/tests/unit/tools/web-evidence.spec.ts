import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { expect, it, vi } from "vitest";
import { registerMeetingTools } from "@/tools/index.ts";
import { parseWebEvidence } from "@/evidence-content/index.ts";
import { projectMeetingView } from "@/projection/index.ts";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { peerBindings } from "../../fixtures/peer-ownership.ts";
import { draft } from "../../fixtures/web-evidence.ts";

it.each(["valid", "invalid", "foreign", "closed", "registered", "wrong-role"])(
    "assembles only authorized complete content: %s",
    async (scenario) => {
        const state = makeRunningMeetingStateV1();
        const identity = state.identities.find((i) => i.roles.includes("contributor"))!;
        const owner = peerBindings(state.id, state.identities).initialOwnership.find(
            (o) => o.identityId === identity.id
        )!;
        const caller = {
            caller: {
                channel: "dsh_tool" as const,
                principalId: identity.id,
                sessionBindingId: owner.id
            },
            meetingId: state.id,
            identityId: identity.id,
            role: "participant" as const,
            ownership: {
                ...owner,
                definition: {
                    ...owner.definition,
                    agentDefinitionId:
                        scenario === "wrong-role"
                            ? "convivium.github_research_analyst"
                            : "convivium.web_research_analyst"
                }
            }
        };
        const view = projectMeetingView(
            { state, meetingId: state.id, version: state.version, createdAt: 0, updatedAt: 0 },
            { kind: "captain" }
        );
        view.rounds = [
            {
                id: "round",
                agendaId: state.agenda[0]!.id,
                planId: "plan",
                status: scenario === "closed" ? "published" : "open",
                openedAt: 0,
                roundGoal: { question: "Q", evidenceGap: "G", expectedOutput: "E" },
                baselinePublicationIds: [],
                invitedContributorIds: [identity.id],
                participationResponses: [],
                pendingHandRaises: [],
                contributions: [
                    {
                        id: "contribution",
                        contributorId: identity.id,
                        status: scenario === "registered" ? "registered" : "preparing"
                    }
                ]
            }
        ];
        let tool!: ToolDefinition;
        let rawTool!: ToolDefinition;
        const execute = vi.fn(async () => ({
            kind: "rejected" as const,
            error: { code: "VERSION_CONFLICT" as const, message: "changed after read" }
        }));
        const readWebEvidence = vi.fn(async () =>
            scenario === "invalid" ? draft.replace("## summary", "## invalid") : draft
        );
        registerMeetingTools({
            registry: {
                register: (d) => {
                    if (d.name === "convivium_submit_web_evidence") {
                        tool = d;
                    }
                    if (d.name === "convivium_submit_evidence") {
                        rawTool = d;
                    }
                    return () => {};
                }
            },
            callers: { resolve: async () => caller },
            reader: { read: async () => view },
            application: { execute },
            readWebEvidence,
            reviewWorkers: { start: vi.fn() },
            reviewPrompts: { resolve: vi.fn() }
        });
        const result = await tool.execute(
            {
                meetingId: scenario === "foreign" ? "other" : state.id,
                contributionId: "contribution",
                requestId: "request"
            },
            {
                agent: { id: owner.sessionId } as Agent,
                signal: new AbortController().signal
            } as ToolRunContext
        );
        if (scenario === "valid") {
            expect(execute).toHaveBeenCalledTimes(1);
            expect(execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    protocolVersion: 1,
                    meetingId: state.id,
                    expectedMeetingVersion: state.version,
                    requestId: "request",
                    action: expect.objectContaining({
                        kind: "submit_evidence",
                        contributionId: "contribution",
                        evidence: expect.objectContaining({
                            summary: expect.stringContaining('"quotes"'),
                            uncertainties: [{ value: "未做实测", reason: "只完成阅读" }]
                        })
                    })
                }),
                expect.objectContaining({ caller: caller.caller }),
                expect.any(AbortSignal)
            );
            expect(result).toMatchObject({ kind: "rejected", error: { code: "VERSION_CONFLICT" } });
            const raw = await rawTool.execute(
                {
                    protocolVersion: 1,
                    meetingId: state.id,
                    expectedMeetingVersion: state.version,
                    requestId: "raw",
                    action: {
                        kind: "submit_evidence",
                        contributionId: "contribution",
                        evidence: parseWebEvidence(draft)
                    }
                },
                {
                    agent: { id: owner.sessionId } as Agent,
                    signal: new AbortController().signal
                } as ToolRunContext
            );
            expect(raw).toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
            expect(execute).toHaveBeenCalledTimes(1);
        } else {
            expect(execute).not.toHaveBeenCalled();
        }
        if (["foreign", "closed", "registered", "wrong-role"].includes(scenario)) {
            expect(readWebEvidence).not.toHaveBeenCalled();
        }
    }
);
