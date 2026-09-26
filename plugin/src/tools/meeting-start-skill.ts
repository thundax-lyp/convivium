import type { UserMessage } from "@deepseek-ai/dsh-llm";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { defineTool, type ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import { MeetingCommandSchema, type MeetingCommand } from "@/protocol/index.js";

interface StartGrant {
    readonly turn: number;
    readonly goal: string;
    readonly requestId: string;
}

const roles = [
    ["meeting_manager", "Meeting Manager", "manager"],
    ["domain_architect", "Domain Architect", "contributor"],
    ["runtime_engineer", "Runtime Engineer", "contributor"],
    ["protocol_ui_engineer", "Protocol and UI Engineer", "contributor"],
    ["verification_reviewer", "Evidence Reviewer", "evidence_reviewer"],
    ["github_research_analyst", "GitHub Research Analyst", "contributor"],
    ["arxiv_research_analyst", "arXiv Research Analyst", "contributor"]
] as const;

export class MeetingStartGate {
    private readonly grants = new Map<string, StartGrant>();

    observe = (sessionId: string, turn: number, messages: readonly UserMessage[]): void => {
        for (const message of messages) {
            if (message.source.kind !== "user") continue;
            const text = message.content
                .filter((block) => block.type === "text")
                .map((block) => block.text)
                .join("\n");
            const match = /^\/convivium(?:\s+([\s\S]*))?$/.exec(text.trim());
            if (!match) {
                this.grants.delete(sessionId);
                continue;
            }
            const goal = match[1]?.trim();
            if (!goal) {
                this.grants.delete(sessionId);
                continue;
            }
            this.grants.set(sessionId, {
                turn,
                goal,
                requestId: `skill:${message.id}`
            });
        }
    };

    take = (sessionId: string): StartGrant | undefined => {
        const grant = this.grants.get(sessionId);
        this.grants.delete(sessionId);
        return grant;
    };

    clear = (sessionId: string, turn: number): void => {
        if (this.grants.get(sessionId)?.turn === turn) this.grants.delete(sessionId);
    };
}

export const createMeetingStartCommand = (goal: string, requestId: string): MeetingCommand => {
    const statement = goal.trim();
    if (!statement) throw new Error("A Meeting objective is required");
    return MeetingCommandSchema.parse({
        protocolVersion: 1,
        meetingId: "new",
        expectedMeetingVersion: 0,
        requestId,
        action: {
            kind: "create_meeting",
            objective: {
                statement,
                requiredOutputs: [{ id: "primary", text: `完成目标：${statement}` }],
                acceptanceCriteria: [
                    { id: "verifiable", text: "给出可核验的产出、依据与未解决的限制。" }
                ],
                hardConstraints: [{ id: "evidence", text: "不得将未经验证的推断表述为既成事实。" }],
                acceptableRiskLevel: "low"
            },
            identities: roles.map(([identityKey, displayName, role]) => ({
                identityKey,
                definitionId: `convivium.${identityKey}`,
                definitionVersion: "2.0.0",
                displayName,
                roles: [role],
                agendaResponsibilityIds: ["initial"],
                riskAuthority: false,
                required: true
            })),
            managerIdentityKey: "meeting_manager",
            evidenceReviewerIdentityKey: "verification_reviewer",
            initialAgenda: [
                {
                    id: "initial",
                    title: statement,
                    question: statement,
                    requiredOutputIds: ["primary"]
                }
            ],
            initialActiveAgendaId: "initial",
            limits: {
                maxFormalMessages: 200,
                maxDurationMs: 86_400_000,
                taskDeadlineMs: 3_600_000,
                reviewDeadlineMs: 900_000
            }
        }
    });
};

export interface MeetingStartToolDependencies {
    readonly registry: Pick<ToolRuntime, "register">;
    readonly gate: MeetingStartGate;
    readonly create: (command: MeetingCommand, signal: AbortSignal) => Promise<JsonValue>;
    readonly isMeetingAgent: (agent: Agent, signal: AbortSignal) => Promise<boolean>;
}

export const registerMeetingStartTool = (
    dependencies: MeetingStartToolDependencies
): (() => void) =>
    dependencies.registry.register(
        defineTool({
            name: "convivium_start_meeting",
            description:
                "Create one Convivium Meeting from the current user's explicit /convivium request. Arguments are empty; the Host uses the exact user objective.",
            parameters: {},
            output: {
                schema: { type: "json" },
                render: (_args, value) => [{ type: "text" as const, text: JSON.stringify(value) }]
            },
            async execute(_args, exec) {
                if (!exec.agent)
                    return {
                        kind: "rejected",
                        error: {
                            code: "UNAUTHORIZED",
                            message: "A direct user Skill call is required"
                        }
                    } as JsonValue;
                const grant = dependencies.gate.take(exec.agent.id);
                if (!grant)
                    return {
                        kind: "rejected",
                        error: { code: "UNAUTHORIZED", message: "No active /convivium invocation" }
                    } as JsonValue;
                if (await dependencies.isMeetingAgent(exec.agent, exec.signal))
                    return {
                        kind: "rejected",
                        error: {
                            code: "UNAUTHORIZED",
                            message: "A Meeting Agent cannot start a Meeting"
                        }
                    } as JsonValue;
                return dependencies.create(
                    createMeetingStartCommand(grant.goal, grant.requestId),
                    exec.signal
                );
            }
        })
    );
