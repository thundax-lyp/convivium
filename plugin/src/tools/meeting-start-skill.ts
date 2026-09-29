import type { UserMessage } from "@deepseek-ai/dsh-llm";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { defineTool, type ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import {
    MeetingCommandSchema,
    type MeetingCommand,
    type MeetingReadResult
} from "@/protocol/index.js";
import type { ContributorRoleDefinitionId } from "@/role-composition/index.js";

interface StartGrant {
    readonly turn: number;
    readonly goal: string;
    readonly requestId: string;
}
interface CancelGrant {
    readonly turn: number;
    readonly meetingId: string;
    readonly reason: string;
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
    private readonly cancelGrants = new Map<string, CancelGrant>();

    observe = (sessionId: string, turn: number, messages: readonly UserMessage[]): void => {
        for (const message of messages) {
            if (message.source.kind !== "user") {
                continue;
            }
            const text = message.content
                .filter((block) => block.type === "text")
                .map((block) => block.text)
                .join("\n");
            const match = /^\/convivium(?:\s+([\s\S]*))?$/.exec(text.trim());
            if (!match) {
                this.grants.delete(sessionId);
                this.cancelGrants.delete(sessionId);
                continue;
            }
            const goal = match[1]?.trim();
            if (!goal) {
                this.grants.delete(sessionId);
                this.cancelGrants.delete(sessionId);
                continue;
            }
            const cancellation = /^cancel\s+(\S+)\s+([\s\S]+)$/.exec(goal);
            if (cancellation) {
                this.grants.delete(sessionId);
                this.cancelGrants.set(sessionId, {
                    turn,
                    meetingId: cancellation[1]!,
                    reason: cancellation[2]!.trim(),
                    requestId: `skill:${message.id}`
                });
                continue;
            }
            if (goal.startsWith("cancel")) {
                this.grants.delete(sessionId);
                this.cancelGrants.delete(sessionId);
                continue;
            }
            this.cancelGrants.delete(sessionId);
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

    takeCancel = (sessionId: string): CancelGrant | undefined => {
        const grant = this.cancelGrants.get(sessionId);
        this.cancelGrants.delete(sessionId);
        return grant;
    };

    clear = (sessionId: string, turn: number): void => {
        if (this.grants.get(sessionId)?.turn === turn) {
            this.grants.delete(sessionId);
        }
        if (this.cancelGrants.get(sessionId)?.turn === turn) {
            this.cancelGrants.delete(sessionId);
        }
    };
}

export const createMeetingCancelCommand = (
    grant: Omit<CancelGrant, "turn">,
    view: MeetingReadResult
): MeetingCommand =>
    MeetingCommandSchema.parse({
        protocolVersion: 1,
        meetingId: grant.meetingId,
        expectedMeetingVersion: view.version,
        requestId: grant.requestId,
        action: {
            kind: "end_meeting",
            outcome: "cancelled",
            reason: grant.reason,
            decisionIds: view.outcomes.decisions
                .filter((item) => item.status === "accepted")
                .map((item) => item.id),
            completionFactIds: view.outcomes.completionFacts
                .filter((item) => item.status === "active")
                .map((item) => item.id),
            unresolvedQuestionIds: view.questions
                .filter((item) => item.status === "open" || item.status === "deferred")
                .map((item) => item.id),
            unresolvedIssueIds: view.issues
                .filter((item) => item.status === "open" || item.status === "deferred")
                .map((item) => item.id)
        }
    });

export interface MeetingCancelToolDependencies {
    readonly registry: Pick<ToolRuntime, "register">;
    readonly gate: MeetingStartGate;
    readonly read: (meetingId: string, signal: AbortSignal) => Promise<MeetingReadResult>;
    readonly cancel: (command: MeetingCommand, signal: AbortSignal) => Promise<JsonValue>;
    readonly isMeetingAgent: (agent: Agent, signal: AbortSignal) => Promise<boolean>;
}

export const registerMeetingCancelTool = (
    dependencies: MeetingCancelToolDependencies
): (() => void) =>
    dependencies.registry.register(
        defineTool({
            name: "convivium_cancel_meeting",
            description:
                "Cancel one Meeting from the current user's explicit /convivium cancel <meetingId> <reason> invocation.",
            parameters: {},
            output: {
                schema: { type: "json" },
                render: (_args, value) => [{ type: "text" as const, text: JSON.stringify(value) }]
            },
            async execute(_args, exec) {
                if (!exec.agent) {
                    return {
                        kind: "rejected",
                        error: {
                            code: "UNAUTHORIZED",
                            message: "A direct user Skill call is required"
                        }
                    } as JsonValue;
                }
                const grant = dependencies.gate.takeCancel(exec.agent.id);
                if (!grant || (await dependencies.isMeetingAgent(exec.agent, exec.signal))) {
                    return {
                        kind: "rejected",
                        error: {
                            code: "UNAUTHORIZED",
                            message: "No active user cancellation invocation"
                        }
                    } as JsonValue;
                }
                const view = await dependencies.read(grant.meetingId, exec.signal);
                return dependencies.cancel(createMeetingCancelCommand(grant, view), exec.signal);
            }
        })
    );

export const createMeetingStartCommand = (
    goal: string,
    requestId: string,
    initialContributorRoleIds: readonly ContributorRoleDefinitionId[]
): MeetingCommand => {
    const statement = goal.trim();
    if (!statement) {
        throw new Error("A Meeting objective is required");
    }
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
            identities: roles
                .filter(
                    ([identityKey, , role]) =>
                        role !== "contributor" ||
                        initialContributorRoleIds.includes(
                            identityKey as ContributorRoleDefinitionId
                        )
                )
                .map(([identityKey, displayName, role]) => ({
                    identityKey,
                    definitionId: `convivium.${identityKey}`,
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
    readonly initialContributorRoleIds: readonly ContributorRoleDefinitionId[];
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
                if (!exec.agent) {
                    return {
                        kind: "rejected",
                        error: {
                            code: "UNAUTHORIZED",
                            message: "A direct user Skill call is required"
                        }
                    } as JsonValue;
                }
                const grant = dependencies.gate.take(exec.agent.id);
                if (!grant) {
                    return {
                        kind: "rejected",
                        error: { code: "UNAUTHORIZED", message: "No active /convivium invocation" }
                    } as JsonValue;
                }
                if (await dependencies.isMeetingAgent(exec.agent, exec.signal)) {
                    return {
                        kind: "rejected",
                        error: {
                            code: "UNAUTHORIZED",
                            message: "A Meeting Agent cannot start a Meeting"
                        }
                    } as JsonValue;
                }
                return dependencies.create(
                    createMeetingStartCommand(
                        grant.goal,
                        grant.requestId,
                        dependencies.initialContributorRoleIds
                    ),
                    exec.signal
                );
            }
        })
    );
