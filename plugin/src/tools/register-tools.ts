import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    defineTool,
    type JsonValue,
    type ToolDefinition,
    type ToolRunContext
} from "@deepseek-ai/dsh-tools";
import type {
    CreateMeetingInputV1,
    CreateMeetingResultV1,
    MeetingStatusInputV1,
    MeetingStatusResultV1,
    MeetingTaskRequestV1,
    MeetingTaskStatusInputV1,
    MeetingTaskStartInputV1,
    MeetingTaskFinishInputV1,
    MeetingTaskResultV1,
    MeetingTaskStatusResultV1,
    MeetingTaskStartResultV1,
    MeetingTaskFinishResultV1,
    MeetingControlResultV1,
    ManagerPlanResultV1,
    ManagerPlanSubmissionV1,
    PauseMeetingInputV1,
    ProtocolErrorV1,
    ProtocolSuccessV1,
    ResumeMeetingInputV1,
    TurnSubmissionResultV1,
    TurnSubmissionV1
} from "../protocol/index.js";
import {
    CreateMeetingInputSchema,
    MeetingStatusInputSchema,
    PauseMeetingInputSchema,
    ResumeMeetingInputSchema,
    ManagerPlanSubmissionSchema,
    TurnSubmissionSchema,
    MeetingTaskRequestSchema,
    MeetingTaskStatusInputSchema,
    MeetingTaskStartInputSchema,
    MeetingTaskFinishInputSchema,
    validateProtocolError
} from "../protocol/index.js";

export interface MeetingToolCaller {
    readonly sessionId: string;
    readonly agent?: Agent;
    readonly kind: "captain" | "manager" | "participant";
    readonly meetingId?: string;
    readonly participantId?: string;
}

export interface MeetingToolCallerResolver {
    resolve(agent: Agent, signal: AbortSignal): Promise<MeetingToolCaller | ProtocolErrorV1>;
}

export interface MeetingToolRuntime {
    createMeeting(
        input: CreateMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<CreateMeetingResultV1> | ProtocolErrorV1>;
    getStatus(
        input: MeetingStatusInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingStatusResultV1> | ProtocolErrorV1>;
    createMeetingTask(
        input: MeetingTaskRequestV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<MeetingToolOutcome<MeetingTaskResultV1>>;
    meetingTaskStatus(
        input: MeetingTaskStatusInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<MeetingToolOutcome<MeetingTaskStatusResultV1>>;
    startMeetingTask(
        input: MeetingTaskStartInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<MeetingToolOutcome<MeetingTaskStartResultV1>>;
    finishMeetingTask(
        input: MeetingTaskFinishInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<MeetingToolOutcome<MeetingTaskFinishResultV1>>;
    submitTurn(
        input: TurnSubmissionV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<TurnSubmissionResultV1> | ProtocolErrorV1>;
    submitManagerPlan(
        input: ManagerPlanSubmissionV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<ManagerPlanResultV1> | ProtocolErrorV1>;
    pause(
        input: PauseMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
    resume(
        input: ResumeMeetingInputV1,
        caller: MeetingToolCaller,
        signal: AbortSignal
    ): Promise<ProtocolSuccessV1<MeetingControlResultV1> | ProtocolErrorV1>;
}

export interface MeetingToolRegistry {
    register(definition: ToolDefinition): () => void;
}

export interface CreateAndStatusToolDependencies {
    readonly registry: MeetingToolRegistry;
    readonly runtime: MeetingToolRuntime;
    readonly callers: MeetingToolCallerResolver;
}

export interface SubmitAndControlToolDependencies extends CreateAndStatusToolDependencies {}

type MeetingToolOutcome<T> = ProtocolSuccessV1<T> | ProtocolErrorV1;

const protocolOutputSchema = { type: "json" } as const;

const toolParameters = {
    input: { type: "json", required: true, description: "Protocol v1 command input." }
} as const;

function error(
    code: ProtocolErrorV1["code"],
    message: string,
    retryable: boolean
): ProtocolErrorV1 {
    return { protocolVersion: 1, ok: false, code, message, retryable };
}

async function resolveCaller(
    callers: MeetingToolCallerResolver,
    exec: ToolRunContext
): Promise<MeetingToolCaller | ProtocolErrorV1> {
    if (exec.agent === undefined) {
        return error("UNAUTHORIZED_CALLER", "A meeting tool requires an Agent caller.", false);
    }
    return callers.resolve(exec.agent, exec.signal);
}

async function execute<TInput, TResult>(
    input: unknown,
    options: {
        readonly validate: (value: unknown) => TInput;
        readonly callers: MeetingToolCallerResolver;
        readonly runtime: (
            value: TInput,
            caller: MeetingToolCaller,
            signal: AbortSignal
        ) => Promise<MeetingToolOutcome<TResult>>;
        readonly exec: ToolRunContext;
    }
): Promise<MeetingToolOutcome<TResult>> {
    let validated: TInput;
    try {
        validated = options.validate(input);
    } catch {
        return error(
            "INVALID_ARGUMENT",
            "The command input does not match protocol version 1.",
            false
        );
    }

    const caller = await resolveCaller(options.callers, options.exec);
    if ("ok" in caller) return caller;

    try {
        return await options.runtime(validated, caller, options.exec.signal);
    } catch {
        return error("INTERNAL_ERROR", "The meeting runtime could not complete the command.", true);
    }
}

function renderOutcome(_args: unknown, value: JsonValue) {
    return [{ type: "text" as const, text: JSON.stringify(value) }];
}

function asJson(value: MeetingToolOutcome<unknown>): JsonValue {
    return value as unknown as JsonValue;
}

export function registerCreateAndStatusTools(
    dependencies: CreateAndStatusToolDependencies
): readonly (() => void)[] {
    return [
        dependencies.registry.register(
            defineTool({
                name: "convivium_create_meeting",
                description:
                    "Create a meeting as its Captain. The caller identity comes from DSH, never tool input.",
                parameters: toolParameters,
                output: { schema: protocolOutputSchema, render: renderOutcome },
                async execute(args, exec) {
                    return asJson(
                        await execute(args.input, {
                            validate: (value) =>
                                CreateMeetingInputSchema(value as never) as CreateMeetingInputV1,
                            callers: dependencies.callers,
                            runtime: dependencies.runtime.createMeeting.bind(dependencies.runtime),
                            exec
                        })
                    );
                }
            })
        ),
        dependencies.registry.register(
            defineTool({
                name: "convivium_meeting_status",
                description:
                    "Read the caller-specific status projection for one authorized meeting.",
                parameters: toolParameters,
                output: { schema: protocolOutputSchema, render: renderOutcome },
                async execute(args, exec) {
                    return asJson(
                        await execute(args.input, {
                            validate: (value) =>
                                MeetingStatusInputSchema(value as never) as MeetingStatusInputV1,
                            callers: dependencies.callers,
                            runtime: dependencies.runtime.getStatus.bind(dependencies.runtime),
                            exec
                        })
                    );
                }
            })
        ),
        dependencies.registry.register(
            defineTool({
                name: "convivium_create_meeting_task",
                description:
                    "Create a Convivium-owned asynchronous task from the current SpeakerAttempt.",
                parameters: toolParameters,
                output: { schema: protocolOutputSchema, render: renderOutcome },
                async execute(args, exec) {
                    return asJson(
                        await execute(args.input, {
                            validate: (value) =>
                                MeetingTaskRequestSchema(value as never) as MeetingTaskRequestV1,
                            callers: dependencies.callers,
                            runtime: dependencies.runtime.createMeetingTask.bind(
                                dependencies.runtime
                            ),
                            exec
                        })
                    );
                }
            })
        )
    ];
}

export function registerSubmitAndControlTools(
    dependencies: SubmitAndControlToolDependencies
): readonly (() => void)[] {
    return [
        dependencies.registry.register(
            defineTool({
                name: "convivium_meeting_task_status",
                description:
                    "Read the current authorized MeetingTask projection and execution permission.",
                parameters: toolParameters,
                output: { schema: protocolOutputSchema, render: renderOutcome },
                async execute(args, exec) {
                    return asJson(
                        await execute(args.input, {
                            validate: (value) =>
                                MeetingTaskStatusInputSchema(
                                    value as never
                                ) as MeetingTaskStatusInputV1,
                            callers: dependencies.callers,
                            runtime: dependencies.runtime.meetingTaskStatus.bind(
                                dependencies.runtime
                            ),
                            exec
                        })
                    );
                }
            })
        ),
        dependencies.registry.register(
            defineTool({
                name: "convivium_start_meeting_task",
                description: "Idempotently start a queued MeetingTask.",
                parameters: toolParameters,
                output: { schema: protocolOutputSchema, render: renderOutcome },
                async execute(args, exec) {
                    return asJson(
                        await execute(args.input, {
                            validate: (value) =>
                                MeetingTaskStartInputSchema(
                                    value as never
                                ) as MeetingTaskStartInputV1,
                            callers: dependencies.callers,
                            runtime: dependencies.runtime.startMeetingTask.bind(
                                dependencies.runtime
                            ),
                            exec
                        })
                    );
                }
            })
        ),
        dependencies.registry.register(
            defineTool({
                name: "convivium_finish_meeting_task",
                description:
                    "Commit a terminal MeetingTask result from its owning Participant Session.",
                parameters: toolParameters,
                output: { schema: protocolOutputSchema, render: renderOutcome },
                async execute(args, exec) {
                    return asJson(
                        await execute(args.input, {
                            validate: (value) =>
                                MeetingTaskFinishInputSchema(
                                    value as never
                                ) as MeetingTaskFinishInputV1,
                            callers: dependencies.callers,
                            runtime: dependencies.runtime.finishMeetingTask.bind(
                                dependencies.runtime
                            ),
                            exec
                        })
                    );
                }
            })
        ),
        dependencies.registry.register(
            defineTool({
                name: "convivium_submit_manager_plan",
                description:
                    "Submit one ordered Manager turn plan only from the current meeting Manager Session.",
                parameters: toolParameters,
                output: { schema: protocolOutputSchema, render: renderOutcome },
                async execute(args, exec) {
                    return asJson(
                        await execute(args.input, {
                            validate: (value) =>
                                ManagerPlanSubmissionSchema(
                                    value as never
                                ) as ManagerPlanSubmissionV1,
                            callers: dependencies.callers,
                            runtime: dependencies.runtime.submitManagerPlan.bind(
                                dependencies.runtime
                            ),
                            exec
                        })
                    );
                }
            })
        ),
        dependencies.registry.register(
            defineTool({
                name: "convivium_submit_turn",
                description:
                    "Submit one formal turn message only from the current meeting Participant Session.",
                parameters: toolParameters,
                output: { schema: protocolOutputSchema, render: renderOutcome },
                async execute(args, exec) {
                    return asJson(
                        await execute(args.input, {
                            validate: (value) =>
                                TurnSubmissionSchema(value as never) as unknown as TurnSubmissionV1,
                            callers: dependencies.callers,
                            runtime: dependencies.runtime.submitTurn.bind(dependencies.runtime),
                            exec
                        })
                    );
                }
            })
        ),
        dependencies.registry.register(
            defineTool({
                name: "convivium_pause_meeting",
                description:
                    "Pause a meeting as its Captain and revoke the active delivery when allowed.",
                parameters: toolParameters,
                output: { schema: protocolOutputSchema, render: renderOutcome },
                async execute(args, exec) {
                    return asJson(
                        await execute(args.input, {
                            validate: (value) =>
                                PauseMeetingInputSchema(value as never) as PauseMeetingInputV1,
                            callers: dependencies.callers,
                            runtime: dependencies.runtime.pause.bind(dependencies.runtime),
                            exec
                        })
                    );
                }
            })
        ),
        dependencies.registry.register(
            defineTool({
                name: "convivium_resume_meeting",
                description:
                    "Resume a meeting as its Captain from the latest committed meeting state.",
                parameters: toolParameters,
                output: { schema: protocolOutputSchema, render: renderOutcome },
                async execute(args, exec) {
                    return asJson(
                        await execute(args.input, {
                            validate: (value) =>
                                ResumeMeetingInputSchema(value as never) as ResumeMeetingInputV1,
                            callers: dependencies.callers,
                            runtime: dependencies.runtime.resume.bind(dependencies.runtime),
                            exec
                        })
                    );
                }
            })
        )
    ];
}

export function assertProtocolError(value: ProtocolErrorV1): ProtocolErrorV1 {
    return validateProtocolError(value);
}
