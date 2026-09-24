import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    defineTool,
    type ParameterSchemaSpec,
    type ToolRuntime,
    type ValueSchemaSpec
} from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import type { ResolvedMeetingCaller } from "@/dsh/index.js";
import {
    CreateMeetingActionSchema,
    DisposeHandRaiseActionSchema,
    MeetingCommandSchema,
    ReadMeetingRequestSchema,
    OpenRoundActionSchema,
    SubmitManagerPlanActionSchema,
    PublishRoundActionSchema,
    RaiseHandActionSchema,
    RecommendIdentityActionSchema,
    SubmitEvidenceActionSchema,
    SubmitReviewBatchActionSchema,
    type MeetingCommandResult,
    type MeetingCommand,
    type MeetingReadResult,
    type ReadMeetingRequest
} from "@/protocol/index.js";
import type { MeetingCommandApplication } from "@/runtime/index.js";

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
    readonly registry: Pick<ToolRuntime, "register">;
    readonly application: MeetingCommandApplication;
    readonly callers: TargetMeetingToolCallerResolver;
    readonly reader: TargetMeetingToolReader;
    readonly onMeetingCreated?: (meetingId: string, parent: Agent) => void;
}

const requiredString = (description: string) =>
    ({ type: "string", required: true, description }) as const;
const optionalString = (description: string) => ({ type: "string", description }) as const;
const requiredInteger = (description: string) =>
    ({ type: "integer", required: true, description }) as const;
const optionalInteger = (description: string) => ({ type: "integer", description }) as const;
const requiredBoolean = (description: string) =>
    ({ type: "boolean", required: true, description }) as const;
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

const targetSchema = {
    id: requiredString("Stable target identifier."),
    text: requiredString("Target text.")
};
const evidenceTextSchema = {
    value: requiredString("Evidence statement."),
    reason: optionalString("Optional qualification or reason.")
};
const reviewDimensionSchema = {
    score: {
        oneOf: [
            { type: "integer", enum: [0, 1, 2, 3] },
            { type: "string", const: "unable_to_assess" }
        ],
        required: true,
        description: "Dimension score or unable_to_assess."
    },
    scope: requiredString("Scope assessed by this dimension."),
    reason: requiredString("Reason for the score."),
    baselineEvidenceIds: requiredStringArray("Baseline evidence identifiers used.")
} satisfies ParameterSchemaSpec;

const actionSchemas = {
    create_meeting: exactObject({
        kind: { type: "string", const: "create_meeting", required: true },
        objective: requiredObject({
            statement: requiredString("Meeting objective statement."),
            requiredOutputs: requiredObjectArray(targetSchema, "Required output targets."),
            acceptanceCriteria: requiredObjectArray(targetSchema, "Acceptance criteria."),
            hardConstraints: requiredObjectArray(targetSchema, "Hard constraints."),
            acceptableRiskLevel: {
                type: "string",
                enum: ["low", "medium", "high"],
                required: true
            }
        }),
        identities: requiredObjectArray(
            {
                identityKey: requiredString("Identity key unique within the creation request."),
                definitionId: requiredString("Versioned Agent definition identifier."),
                definitionVersion: requiredString("Agent definition version."),
                displayName: requiredString("Identity display name."),
                roles: {
                    type: "array",
                    required: true,
                    items: {
                        type: "string",
                        enum: ["captain", "manager", "contributor", "evidence_reviewer"]
                    }
                },
                agendaResponsibilityIds: requiredStringArray(
                    "Agenda identifiers assigned to this identity."
                ),
                riskAuthority: requiredBoolean("Whether this identity can accept risk."),
                required: requiredBoolean("Whether this identity is required.")
            },
            "Initial Meeting identities."
        ),
        managerIdentityKey: requiredString("Identity key for the Manager."),
        evidenceReviewerIdentityKey: requiredString("Identity key for the Evidence Reviewer."),
        initialAgenda: requiredObjectArray(
            {
                id: requiredString("Agenda identifier."),
                title: requiredString("Agenda title."),
                question: requiredString("Agenda question."),
                requiredOutputIds: requiredStringArray("Required output identifiers."),
                ownerIdentityKey: optionalString("Optional owner identity key.")
            },
            "Initial agenda items."
        ),
        initialActiveAgendaId: requiredString("Initially active agenda identifier."),
        limits: requiredObject({
            maxFormalMessages: requiredInteger("Maximum formal message count."),
            maxDurationMs: requiredInteger("Maximum Meeting duration in milliseconds."),
            taskDeadlineMs: requiredInteger("Contribution deadline duration in milliseconds."),
            reviewDeadlineMs: requiredInteger("Review deadline duration in milliseconds.")
        }),
        continuation: exactObject({
            sourceArchiveId: requiredString("Source archive identifier."),
            selectedMaterialIds: requiredStringArray("Selected source material identifiers.")
        })
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
                evidenceGap: requiredString("Evidence gap the round must close."),
                expectedOutput: requiredString("Concrete output expected from the round.")
            },
            "Required exactly when planKind is open_round."
        ),
        rationale: requiredString("Why this is the next valid plan."),
        blockingReason: optionalString("Current blocking condition, when applicable.")
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
    submit_evidence: exactObject({
        kind: { type: "string", const: "submit_evidence", required: true },
        contributionId: requiredString("Accepted contribution identifier."),
        evidence: requiredObject({
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
    submit_review_batch: exactObject({
        kind: { type: "string", const: "submit_review_batch", required: true },
        roundId: requiredString("Round identifier covered by the claim."),
        claimId: requiredString("Active ReviewBatchClaim identifier."),
        reviews: requiredObjectArray(
            {
                versionId: requiredString("Evidence version identifier."),
                dimensions: requiredObject({
                    source: requiredObject(reviewDimensionSchema),
                    credibility: requiredObject(reviewDimensionSchema),
                    completeness: requiredObject(reviewDimensionSchema),
                    support: requiredObject(reviewDimensionSchema)
                }),
                scope: requiredString("Overall review scope.")
            },
            "Complete non-empty review set for the claimed versions."
        )
    }),
    recommend_identity: exactObject({
        kind: { type: "string", const: "recommend_identity", required: true },
        candidateId: requiredString("Catalog candidate identifier."),
        definitionId: requiredString("Candidate Agent definition identifier."),
        definitionVersion: requiredString("Candidate Agent definition version."),
        catalogId: requiredString("Catalog identifier from read_meeting."),
        catalogVersion: requiredString("Catalog version from read_meeting."),
        agendaId: requiredString("Agenda requiring the identity."),
        rationale: requiredString("Reason this identity is or is not suitable."),
        expectedContribution: requiredString("Expected contribution from the identity."),
        evidenceGap: requiredString("Evidence gap the identity would address."),
        decision: { type: "string", enum: ["admit", "reject"], required: true }
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

type ActionSchema = { safeParse(value: unknown): { success: boolean; data?: unknown } };
type ToolDefinition = {
    readonly name: string;
    readonly kind: keyof typeof actionSchemas;
    readonly schema: ActionSchema;
};

const commandToolParameters = (kind: keyof typeof actionSchemas): ParameterSchemaSpec => ({
    input: {
        ...exactObject({
            protocolVersion: {
                type: "integer",
                const: 1,
                required: true,
                description: "Meeting protocol version."
            },
            meetingId:
                kind === "create_meeting"
                    ? {
                          type: "string" as const,
                          const: "new",
                          required: true as const,
                          description: 'Use the literal "new".'
                      }
                    : requiredString("Target Meeting identifier."),
            ...(kind === "submit_review_batch"
                ? {}
                : {
                      expectedMeetingVersion: {
                          type: "integer" as const,
                          ...(kind === "create_meeting" ? { const: 0 as const } : {}),
                          required: true as const,
                          description:
                              kind === "create_meeting"
                                  ? "Use 0 when creating a Meeting."
                                  : "Current version returned by convivium_read_meeting."
                      }
                  }),
            requestId: requiredString(
                "Unique idempotency key; reuse only when retrying the exact same command."
            ),
            action: { ...actionSchemas[kind], required: true }
        }),
        required: true,
        description: "Complete action-specific MeetingCommand object."
    }
});

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
            parameters: commandToolParameters(definition.kind),
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

const registerReadTool = (dependencies: MeetingCommandToolDependencies): (() => void) => {
    return dependencies.registry.register(
        defineTool({
            name: "convivium_read_meeting",
            description:
                "Read the current caller-visible Meeting objective, agenda, progress, and allowed controls after receiving a Meeting notice.",
            parameters: readToolParameters,
            output: {
                schema: { type: "json" },
                render: (_args, value) => [{ type: "text" as const, text: JSON.stringify(value) }]
            },
            async execute(args, exec) {
                const request = ReadMeetingRequestSchema.safeParse(args.input);
                if (!request.success)
                    return rejected(
                        "INVALID_ARGUMENT",
                        "Expected a valid Meeting read request."
                    ) as unknown as JsonValue;
                if (exec.agent === undefined)
                    return rejected(
                        "UNAUTHORIZED",
                        "A Meeting tool requires an Agent caller."
                    ) as unknown as JsonValue;
                const caller = await dependencies.callers.resolve(exec.agent, exec.signal);
                if (caller === undefined || caller.meetingId !== request.data.meetingId)
                    return rejected(
                        "UNAUTHORIZED",
                        "The caller is not an active identity of the requested Meeting."
                    ) as unknown as JsonValue;
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

export function registerMeetingTools(
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
    const [create, ...commands] = definitions;
    return [
        registerTool(dependencies, create!),
        registerReadTool(dependencies),
        ...commands.map((definition) => registerTool(dependencies, definition))
    ];
}
