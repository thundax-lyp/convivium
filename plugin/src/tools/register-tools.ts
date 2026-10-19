import { executeHandRaise } from "./hand-raise.ts";
import { registerResearchPlanningTool } from "./research-planning.ts";
import type { ResearchPlanning } from "@/research-planning/index.ts";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import {
    defineTool,
    validateJsonSchemaValue,
    type ParameterSchemaSpec,
    type ToolRuntime,
    type ValueSchemaSpec
} from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import type { CodexAcpProviderPort, ResolvedMeetingCaller } from "@/dsh/index.ts";
import {
    DisposeHandRaiseActionSchema,
    MeetingCommandSchema,
    ReadMeetingRequestSchema,
    ActivateAgendaActionSchema,
    OpenRoundActionSchema,
    SubmitManagerPlanActionSchema,
    PublishRoundActionSchema,
    EndMeetingActionSchema,
    RaiseHandActionSchema,
    DeclineHandActionSchema,
    RecommendIdentityActionSchema,
    SubmitEvidenceActionSchema,
    SubmitEvidenceReviewActionSchema,
    type MeetingCommandResult,
    type MeetingCommand,
    type MeetingReadResult,
    type ReadMeetingRequest,
    ReviewWorkerOutputSchema
} from "@/protocol/index.ts";
import type { MeetingCommandApplication } from "@/runtime/index.ts";

export interface TargetMeetingToolCallerResolver {
    resolve(agent: Agent, signal: AbortSignal): Promise<ResolvedMeetingCaller | undefined>;
}

export interface TargetMeetingToolReader {
    read(
        request: ReadMeetingRequest,
        caller: ResolvedMeetingCaller,
        signal: AbortSignal
    ): Promise<MeetingReadResult | undefined>;
}

export interface MeetingCommandToolDependencies {
    readonly researchPlanner?: (input: {
        agent: Agent;
        question: string;
        signal: AbortSignal;
    }) => Promise<ResearchPlanning>;
    readonly acpCodex?: CodexAcpProviderPort;
    readonly registry: Pick<ToolRuntime, "register">;
    readonly application: MeetingCommandApplication;
    readonly reviewWorkers: Pick<SubagentRuntime, "start">;
    readonly reviewPrompts: {
        resolve(input: {
            meetingId: string;
            versionId: string;
            caller: ResolvedMeetingCaller;
            signal: AbortSignal;
        }): Promise<{ prompt: string; claimId: string; roundId: string } | undefined>;
    };
    readonly callers: TargetMeetingToolCallerResolver;
    readonly reader: TargetMeetingToolReader;
}

const requiredString = (description: string) =>
    ({ type: "string", required: true, description }) as const;
const optionalString = (description: string) => ({ type: "string", description }) as const;
const optionalInteger = (description: string) => ({ type: "integer", description }) as const;
const requiredStringArray = (description: string) =>
    ({ type: "array", required: true, items: { type: "string" }, description }) as const;
const exactObject = (properties: ParameterSchemaSpec, description?: string) =>
    ({
        type: "object",
        properties,
        additionalProperties: false,
        ...(description === undefined ? {} : { description })
    }) as const;
const requiredObject = (properties: ParameterSchemaSpec, description?: string) =>
    ({ ...exactObject(properties, description), required: true }) as const;
const requiredObjectArray = (properties: ParameterSchemaSpec, description: string) =>
    ({
        type: "array",
        required: true,
        items: exactObject(properties),
        description
    }) as const;

const evidenceTextSchema = {
    value: requiredString("Evidence statement."),
    reason: optionalString("Optional qualification or reason.")
};
const actionSchemas = {
    activate_agenda: exactObject({
        kind: { type: "string", const: "activate_agenda", required: true },
        agendaId: requiredString(
            "Existing pending agenda identifier returned by read_meeting; never a candidate."
        ),
        previousDisposition: {
            type: "string",
            enum: ["completed", "deferred", "closed"],
            required: true,
            description:
                "Disposition of the old active agenda. Use deferred for unresolved local blockers; completed requires completion evidence."
        },
        reason: requiredString(
            "Why the current agenda is closing or deferred and this authorized agenda can proceed. Wait for any preceding plan command to succeed, then use its committed version; never batch both writes with the same version."
        )
    }),
    open_round: exactObject({
        kind: { type: "string", const: "open_round", required: true },
        agendaId: requiredString("Active agenda identifier returned by read_meeting."),
        planId: requiredString("Accepted open_round plan identifier."),
        deadlineAt: optionalInteger("Optional absolute Unix epoch deadline in milliseconds.")
    }),
    submit_manager_plan: exactObject({
        kind: { type: "string", const: "submit_manager_plan", required: true },
        agendaId: requiredString("Active agenda identifier returned by read_meeting."),
        planKind: {
            type: "string",
            enum: [
                "open_round",
                "continue_agenda",
                "stop_agenda",
                "raise_agenda_candidate",
                "wait_for_required_identity"
            ],
            required: true
        },
        roundGoal: exactObject(
            {
                question: requiredString("Question the round must answer."),
                researchObjectIds: {
                    type: "array",
                    items: { type: "string" },
                    description:
                        "Accepted research object IDs advanced in this round; required for research-planned meetings."
                },
                evidenceGap: requiredString("Evidence gap the round must close."),
                expectedOutput: requiredString("Concrete output expected from the round.")
            },
            "Required exactly when planKind is open_round."
        ),
        rationale: requiredString(
            "Why this plan advances the objective. For local blockers, state affected conclusions, unblock conditions and remaining feasible work; do not equate one blocked path with an exhausted Meeting."
        ),
        blockingReason: optionalString(
            "Persist a local blocker and its cause, including when opening independent work. This does not end the Meeting, resolve the blocker or activate another agenda."
        )
    }),
    dispose_hand_raise: exactObject({
        kind: { type: "string", const: "dispose_hand_raise", required: true },
        roundId: requiredString("Open round identifier."),
        contributorId: requiredString("Contributor identity identifier."),
        disposition: {
            type: "string",
            enum: ["accepted", "rejected", "deferred"],
            required: true
        },
        reason: requiredString("Reason for the disposition.")
    }),
    publish_round: exactObject({
        kind: { type: "string", const: "publish_round", required: true },
        roundId: requiredString("Round identifier to publish.")
    }),
    raise_hand: exactObject({
        kind: { type: "string", const: "raise_hand", required: true },
        roundId: requiredString("Open round identifier."),
        purpose: requiredString("Purpose of the proposed contribution.")
    }),
    decline_hand: exactObject({
        kind: { type: "string", const: "decline_hand", required: true },
        roundId: requiredString("Open round identifier."),
        reason: requiredString("Why this contributor will not raise a hand this round.")
    }),
    submit_evidence: exactObject({
        kind: { type: "string", const: "submit_evidence", required: true },
        contributionId: requiredString("Accepted contribution identifier."),
        evidence: requiredObject({
            summary: requiredString(
                "Author-written viewpoint summary covering the judgment, supporting evidence and material limits. Published verbatim as the formal message after review."
            ),
            observation: requiredString("Observed facts."),
            interpretation: requiredString("Interpretation separated from observation."),
            method: requiredString("Method used to obtain or assess the evidence."),
            falsifiers: requiredObjectArray(evidenceTextSchema, "Non-empty falsifier list."),
            uncertainties: requiredObjectArray(evidenceTextSchema, "Non-empty uncertainty list."),
            limitations: requiredObjectArray(evidenceTextSchema, "Non-empty limitation list."),
            claims: requiredObjectArray(
                {
                    id: requiredString("Claim identifier."),
                    statement: requiredString("Claim statement."),
                    materialIds: requiredStringArray("Supporting material identifiers."),
                    qualification: requiredString("Claim qualification.")
                },
                "Non-empty evidence claim list."
            ),
            materials: requiredObjectArray(
                {
                    id: requiredString("Material identifier."),
                    kind: {
                        type: "string",
                        enum: [
                            "document",
                            "dataset",
                            "experiment",
                            "observation",
                            "tool_output",
                            "unknown",
                            "not_applicable"
                        ],
                        required: true
                    },
                    originator: requiredString("Material originator."),
                    originalSource: requiredString("Original source."),
                    sourcePublishedAt: requiredString("Source publication time."),
                    acquiredAt: requiredString("Acquisition time."),
                    version: requiredString("Material version."),
                    locator: requiredString("Stable source locator."),
                    location: requiredString("Location within the source."),
                    verificationConditions: requiredString("Verification conditions."),
                    limitations: requiredString("Material limitations."),
                    sharedDependencies: requiredStringArray("Shared dependency identifiers."),
                    reason: optionalString("Optional material qualification.")
                },
                "Non-empty evidence material list."
            )
        })
    }),
    recommend_identity: exactObject({
        kind: { type: "string", const: "recommend_identity", required: true },
        candidateId: requiredString("Catalog candidate identifier."),
        definitionId: requiredString("Candidate Agent definition identifier."),
        catalogId: requiredString("Catalog identifier from read_meeting."),
        catalogVersion: requiredString("Catalog version from read_meeting."),
        agendaId: requiredString("Agenda requiring the identity."),
        rationale: requiredString("Reason this identity is or is not suitable."),
        expectedContribution: requiredString("Expected contribution from the identity."),
        evidenceGap: requiredString("Evidence gap the identity would address."),
        decision: { type: "string", enum: ["admit", "reject"], required: true }
    }),
    end_meeting: exactObject({
        kind: { type: "string", const: "end_meeting", required: true },
        outcome: {
            type: "string",
            enum: ["completed", "partial", "no_consensus"],
            required: true,
            description: "Normal termination outcome; completed requires validated objective facts."
        },
        reason: requiredString("Evidence-based reason and unresolved limits for ending."),
        completionFactIds: requiredStringArray("Active completion fact identifiers."),
        unresolvedQuestionIds: requiredStringArray("Open or deferred question identifiers."),
        unresolvedIssueIds: requiredStringArray("Open or deferred issue identifiers.")
    })
} satisfies Record<string, ValueSchemaSpec>;

const readToolParameters = {
    input: {
        ...exactObject({
            protocolVersion: { type: "integer", const: 1, required: true },
            meetingId: requiredString("Meeting identifier supplied by the notice.")
        }),
        required: true,
        description:
            "Meeting read request with protocolVersion and the meetingId supplied by the notice. The tool-call arguments must have exactly one top-level field named input."
    }
} as const;

const reviewWorkerParameters = {
    input: {
        ...exactObject({
            meetingId: requiredString("Meeting identifier supplied by the review request."),
            versionId: requiredString("Immutable evidence version assigned to this worker.")
        }),
        required: true,
        description: "One machine-validated review-worker request."
    }
} as const;

type ActionSchema = { safeParse(value: unknown): { success: boolean; data?: unknown } };
type ToolDefinition = {
    readonly name: string;
    readonly kind: keyof typeof actionSchemas;
    readonly schema: ActionSchema;
};

const commandToolParameters = (kind: keyof typeof actionSchemas): ParameterSchemaSpec => ({
    protocolVersion: {
        type: "integer",
        const: 1,
        required: true,
        description: "Meeting protocol version."
    },
    meetingId: requiredString("Target Meeting identifier."),
    expectedMeetingVersion: {
        type: "integer",
        required: true,
        description: "Current version returned by convivium_read_meeting."
    },
    requestId: requiredString(
        "Unique idempotency key; reuse only when retrying the exact same command."
    ),
    action: { ...actionSchemas[kind], required: true }
});

function rejected(
    code: "INVALID_ARGUMENT" | "UNAUTHORIZED" | "REVIEWER_CONFLICT",
    message: string
): MeetingCommandResult {
    return { kind: "rejected", error: { code, message } };
}

function parseCommand(
    input: unknown,
    definition: ToolDefinition
): MeetingCommand | MeetingCommandResult {
    const parsed = MeetingCommandSchema.safeParse(input);
    if (!parsed.success || parsed.data.action.kind !== definition.kind) {
        return rejected("INVALID_ARGUMENT", `Expected ${definition.kind} command input.`);
    }
    const action = definition.schema.safeParse(parsed.data.action);
    if (!action.success) {
        return rejected("INVALID_ARGUMENT", `Expected valid ${definition.kind} command input.`);
    }
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
            parameters: commandToolParameters(definition.kind),
            output: {
                schema: { type: "json" },
                render: (_args, value) => [{ type: "text" as const, text: JSON.stringify(value) }]
            },
            async execute(args, exec) {
                const command = parseCommand(args, definition);
                if ("kind" in command) {
                    return command as unknown as JsonValue;
                }
                if (exec.agent === undefined) {
                    return rejected(
                        "UNAUTHORIZED",
                        "A Meeting tool requires an Agent caller."
                    ) as unknown as JsonValue;
                }
                const caller = await dependencies.callers.resolve(exec.agent, exec.signal);
                if (caller === undefined) {
                    return rejected(
                        "UNAUTHORIZED",
                        "The caller is not an active Meeting identity."
                    ) as unknown as JsonValue;
                }
                if (command.action.kind === "raise_hand") {
                    return (await executeHandRaise(
                        dependencies,
                        command,
                        caller,
                        exec.agent,
                        exec.signal
                    )) as unknown as JsonValue;
                }
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

const registerReadTool = (dependencies: MeetingCommandToolDependencies): (() => void) => {
    return dependencies.registry.register(
        defineTool({
            name: "convivium_read_meeting",
            description:
                "Read the current caller-visible Meeting objective, agenda, progress, and allowed controls after receiving a Meeting notice.",
            parameters: readToolParameters,
            output: {
                schema: { type: "json" },
                render: (_args, value) => {
                    if (value === null || typeof value !== "object" || Array.isArray(value)) {
                        return [{ type: "text" as const, text: JSON.stringify(value) }];
                    }
                    const { meetingId, version, evidenceReviews, reviewDeliveries, ...rest } =
                        value;
                    return [
                        {
                            type: "text" as const,
                            text: JSON.stringify({
                                meetingId,
                                version,
                                evidenceReviews,
                                reviewDeliveries,
                                ...rest
                            })
                        }
                    ];
                }
            },
            async execute(args, exec) {
                const request = ReadMeetingRequestSchema.safeParse(args.input);
                if (!request.success) {
                    return rejected(
                        "INVALID_ARGUMENT",
                        "Expected a valid Meeting read request."
                    ) as unknown as JsonValue;
                }
                if (exec.agent === undefined) {
                    return rejected(
                        "UNAUTHORIZED",
                        "A Meeting tool requires an Agent caller."
                    ) as unknown as JsonValue;
                }
                const caller = await dependencies.callers.resolve(exec.agent, exec.signal);
                if (caller === undefined || caller.meetingId !== request.data.meetingId) {
                    return rejected(
                        "UNAUTHORIZED",
                        "The caller is not an active identity of the requested Meeting."
                    ) as unknown as JsonValue;
                }
                const result = await dependencies.reader.read(request.data, caller, exec.signal);
                return (result ??
                    rejected(
                        "UNAUTHORIZED",
                        "The caller cannot read the requested Meeting."
                    )) as unknown as JsonValue;
            }
        })
    );
};

const registerReviewWorkerTool = (dependencies: MeetingCommandToolDependencies): (() => void) => {
    const tasks = new Map<
        string,
        { meetingId: string; claimId: string; result: Promise<JsonValue> }
    >();
    const dispose = dependencies.registry.register(
        defineTool({
            name: "convivium_run_review_worker",
            description:
                "Run one isolated review worker, validate its structured result and submit the Review under the active reviewer claim. Returns the submission receipt or rejection, not a Review to copy.",
            parameters: reviewWorkerParameters,
            output: {
                schema: { type: "json" },
                render: (_args, value) => [{ type: "text" as const, text: JSON.stringify(value) }]
            },
            async execute(args, exec) {
                const input = args.input as Record<string, unknown>;
                const meetingId = input.meetingId;
                const versionId = input.versionId;
                if (typeof meetingId !== "string" || typeof versionId !== "string") {
                    return rejected(
                        "INVALID_ARGUMENT",
                        "Expected meetingId and versionId strings."
                    ) as unknown as JsonValue;
                }
                if (exec.agent === undefined) {
                    return rejected(
                        "UNAUTHORIZED",
                        "A review worker requires an Agent caller."
                    ) as unknown as JsonValue;
                }
                const caller = await dependencies.callers.resolve(exec.agent, exec.signal);
                if (
                    caller === undefined ||
                    caller.meetingId !== meetingId ||
                    caller.role !== "evidence_reviewer"
                ) {
                    return rejected(
                        "UNAUTHORIZED",
                        "Only the active Evidence Reviewer may run a review worker."
                    ) as unknown as JsonValue;
                }
                const prompt = await dependencies.reviewPrompts.resolve({
                    meetingId,
                    versionId,
                    caller,
                    signal: exec.signal
                });
                if (prompt === undefined) {
                    return rejected(
                        "REVIEWER_CONFLICT",
                        "The active claim and immutable review input are unavailable."
                    ) as unknown as JsonValue;
                }
                const block = dependencies.acpCodex?.blockFor(exec.agent.id);
                if (block) {
                    return { kind: "failed", code: block.code };
                }
                const previous = tasks.get(exec.agent.id);
                if (previous?.meetingId === meetingId && previous.claimId === prompt.claimId) {
                    return previous.result;
                }
                const parent = exec.agent;
                const result = (async (): Promise<JsonValue> => {
                    const run = await dependencies.reviewWorkers.start("spawn", {
                        label: `convivium:review:${versionId}`,
                        prompt: [{ type: "text", text: prompt.prompt }],
                        parent,
                        signal: exec.signal,
                        outputSchema: ReviewWorkerOutputSchema,
                        toolFilter: { allow: [] }
                    });
                    try {
                        const result = await run.result;
                        exec.signal.throwIfAborted();
                        const block = dependencies.acpCodex?.blockFor(parent.id);
                        if (block) {
                            return { kind: "failed", code: block.code };
                        }
                        if (
                            result.stopReason !== "completed" ||
                            result.structured === undefined ||
                            typeof result.structured !== "object" ||
                            result.structured === null ||
                            (result.structured as { versionId?: unknown }).versionId !== versionId
                        ) {
                            return {
                                kind: "failed",
                                code:
                                    result.stopReason === "completed"
                                        ? "REVIEW_WORKER_VERSION_MISMATCH"
                                        : "REVIEW_WORKER_NOT_COMPLETED"
                            } as JsonValue;
                        }
                        const output = result.structured as Record<string, unknown>;
                        if (
                            validateJsonSchemaValue(ReviewWorkerOutputSchema, output).length !== 0
                        ) {
                            return {
                                kind: "failed",
                                code: "REVIEW_WORKER_OUTPUT_INVALID"
                            } as JsonValue;
                        }
                        const parsed = SubmitEvidenceReviewActionSchema.safeParse({
                            kind: "submit_evidence_review",
                            roundId: prompt.roundId,
                            claimId: prompt.claimId,
                            versionId: output.versionId,
                            dimensions: output.dimensions,
                            scope: output.scope
                        });
                        if (!parsed.success) {
                            return {
                                kind: "failed",
                                code: "REVIEW_WORKER_OUTPUT_INVALID"
                            } as JsonValue;
                        }
                        return (await dependencies.application.execute(
                            {
                                protocolVersion: 1,
                                meetingId,
                                requestId: `evidence-review:${prompt.claimId}`,
                                action: parsed.data
                            },
                            { caller: caller.caller },
                            exec.signal
                        )) as unknown as JsonValue;
                    } finally {
                        await run.dispose();
                    }
                })();
                tasks.set(exec.agent.id, { meetingId, claimId: prompt.claimId, result });
                return result;
            }
        })
    );
    return () => {
        tasks.clear();
        dispose();
    };
};

export function registerMeetingTools(
    dependencies: MeetingCommandToolDependencies
): readonly (() => void)[] {
    const definitions: readonly ToolDefinition[] = [
        {
            name: "convivium_activate_agenda",
            kind: "activate_agenda",
            schema: ActivateAgendaActionSchema
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
        { name: "convivium_end_meeting", kind: "end_meeting", schema: EndMeetingActionSchema },
        { name: "convivium_raise_hand", kind: "raise_hand", schema: RaiseHandActionSchema },
        { name: "convivium_decline_hand", kind: "decline_hand", schema: DeclineHandActionSchema },
        {
            name: "convivium_submit_evidence",
            kind: "submit_evidence",
            schema: SubmitEvidenceActionSchema
        },
        {
            name: "convivium_recommend_identity",
            kind: "recommend_identity",
            schema: RecommendIdentityActionSchema
        }
    ];
    return [
        registerReadTool(dependencies),
        registerResearchPlanningTool(dependencies),
        registerReviewWorkerTool(dependencies),
        ...definitions.map((definition) => registerTool(dependencies, definition))
    ];
}
