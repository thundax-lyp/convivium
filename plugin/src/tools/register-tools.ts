import type { Agent } from "@deepseek-ai/dsh-agent";
import { defineTool, type ToolRuntime } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import type { ResolvedMeetingCaller } from "@/dsh/index.js";
import {
    CreateMeetingActionSchema,
    DisposeHandRaiseActionSchema,
    MeetingCommandSchema,
    OpenRoundActionSchema,
    SubmitManagerPlanActionSchema,
    PublishRoundActionSchema,
    RaiseHandActionSchema,
    RecommendIdentityActionSchema,
    SubmitEvidenceActionSchema,
    SubmitReviewBatchActionSchema,
    type MeetingCommandResult,
    type MeetingCommand
} from "@/protocol/index.js";
import type { MeetingCommandApplication } from "@/runtime/index.js";

export interface TargetMeetingToolCallerResolver {
    resolve(agent: Agent, signal: AbortSignal): Promise<ResolvedMeetingCaller | undefined>;
}

export interface MeetingCommandToolDependencies {
    readonly registry: Pick<ToolRuntime, "register">;
    readonly application: MeetingCommandApplication;
    readonly callers: TargetMeetingToolCallerResolver;
    readonly onMeetingCreated?: (meetingId: string, parent: Agent) => void;
}

const toolParameters = {
    input: {
        type: "json",
        required: true,
        description:
            "Complete MeetingCommand object. The tool-call arguments must have exactly one top-level field named input; input must be an object, never a serialized JSON string."
    }
} as const;

type ActionSchema = { safeParse(value: unknown): { success: boolean; data?: unknown } };
type ToolDefinition = {
    readonly name: string;
    readonly kind: string;
    readonly schema: ActionSchema;
};

function rejected(
    code: "INVALID_ARGUMENT" | "UNAUTHORIZED",
    message: string
): MeetingCommandResult {
    return { kind: "rejected", error: { code, message } };
}

function parseCommand(
    input: unknown,
    definition: ToolDefinition
): MeetingCommand | MeetingCommandResult {
    const parsed = MeetingCommandSchema.safeParse(input);
    if (!parsed.success || parsed.data.action.kind !== definition.kind)
        return rejected("INVALID_ARGUMENT", `Expected ${definition.kind} command input.`);
    const action = definition.schema.safeParse(parsed.data.action);
    if (!action.success)
        return rejected("INVALID_ARGUMENT", `Expected valid ${definition.kind} command input.`);
    return { ...parsed.data, action: action.data } as MeetingCommand;
}

function registerTool(
    dependencies: MeetingCommandToolDependencies,
    definition: ToolDefinition
): () => void {
    return dependencies.registry.register(
        defineTool({
            name: definition.name,
            description: `Execute the ${definition.kind} Meeting command.`,
            parameters: toolParameters,
            output: {
                schema: { type: "json" },
                render: (_args, value) => [{ type: "text" as const, text: JSON.stringify(value) }]
            },
            async execute(args, exec) {
                const command = parseCommand(args.input, definition);
                if ("kind" in command) return command as unknown as JsonValue;
                if (exec.agent === undefined)
                    return rejected(
                        "UNAUTHORIZED",
                        "A Meeting tool requires an Agent caller."
                    ) as unknown as JsonValue;
                if (definition.kind === "create_meeting") {
                    const result = await dependencies.application.execute(
                        command,
                        {
                            caller: { channel: "dsh_tool", principalId: String(exec.agent.id) },
                            captainParent: exec.agent
                        },
                        exec.signal
                    );
                    if (result.kind === "accepted")
                        dependencies.onMeetingCreated?.(result.meetingId, exec.agent);
                    return result as unknown as JsonValue;
                }
                const caller = await dependencies.callers.resolve(exec.agent, exec.signal);
                if (caller === undefined)
                    return rejected(
                        "UNAUTHORIZED",
                        "The caller is not an active Meeting identity."
                    ) as unknown as JsonValue;
                return (await dependencies.application.execute(
                    command,
                    {
                        caller: {
                            channel: "dsh_tool",
                            principalId: caller.identityId,
                            ...(caller.ownership.id === undefined
                                ? {}
                                : { sessionBindingId: caller.ownership.id })
                        }
                    },
                    exec.signal
                )) as unknown as JsonValue;
            }
        })
    );
}

export function registerMeetingToolsV1(
    dependencies: MeetingCommandToolDependencies
): readonly (() => void)[] {
    const definitions: readonly ToolDefinition[] = [
        {
            name: "convivium_create_meeting",
            kind: "create_meeting",
            schema: CreateMeetingActionSchema
        },
        { name: "convivium_open_round", kind: "open_round", schema: OpenRoundActionSchema },
        {
            name: "convivium_submit_manager_plan",
            kind: "submit_manager_plan",
            schema: SubmitManagerPlanActionSchema
        },
        {
            name: "convivium_dispose_hand_raise",
            kind: "dispose_hand_raise",
            schema: DisposeHandRaiseActionSchema
        },
        {
            name: "convivium_publish_round",
            kind: "publish_round",
            schema: PublishRoundActionSchema
        },
        { name: "convivium_raise_hand", kind: "raise_hand", schema: RaiseHandActionSchema },
        {
            name: "convivium_submit_evidence",
            kind: "submit_evidence",
            schema: SubmitEvidenceActionSchema
        },
        {
            name: "convivium_submit_review_batch",
            kind: "submit_review_batch",
            schema: SubmitReviewBatchActionSchema
        },
        {
            name: "convivium_recommend_identity",
            kind: "recommend_identity",
            schema: RecommendIdentityActionSchema
        }
    ];
    return definitions.map((definition) => registerTool(dependencies, definition));
}
