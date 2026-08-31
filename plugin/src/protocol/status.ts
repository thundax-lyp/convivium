import Schema from "@deepseek-ai/schemastery";
import type {
    LocalMeetingListItemV1,
    LocalMeetingListResponseV1,
    LocalMeetingListResultV1
} from "./types.js";

const requiredString = () => Schema.string().required();
const requiredNumber = () => Schema.number().required();
const requiredBoolean = () => Schema.boolean().required();
const requiredArray = <T>(schema: Schema<T>) => Schema.array(schema).required();
const enumOf = <T extends string>(values: readonly T[]) => Schema.union(values).required();
const optionalObject = <T>(schema: Schema<T>) => Schema.union([schema, Schema.const(undefined)]);

function assertExactKeys(value: object, expected: readonly string[], label: string): void {
    const actualKeys = Object.keys(value).sort();
    const expectedKeys = [...expected].sort();
    if (
        actualKeys.length !== expectedKeys.length ||
        actualKeys.some((key, index) => key !== expectedKeys[index])
    ) {
        throw new TypeError(`${label} has unexpected fields`);
    }
}

const localMeetingListItem = Schema.object({
    meetingId: requiredString(),
    teamId: requiredString(),
    topic: requiredString(),
    status: enumOf([
        "created",
        "running",
        "waiting",
        "paused",
        "converging",
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed",
        "archiving",
        "archived"
    ] as const),
    meetingVersion: requiredNumber(),
    updatedAt: requiredNumber()
});

export const LocalMeetingListItemSchema: Schema<unknown, LocalMeetingListItemV1> = Schema.transform(
    localMeetingListItem,
    (value) => {
        assertExactKeys(
            value,
            ["meetingId", "teamId", "topic", "status", "meetingVersion", "updatedAt"],
            "local meeting list item"
        );
        return value as LocalMeetingListItemV1;
    }
) as Schema<unknown, LocalMeetingListItemV1>;

const localMeetingListResult = Schema.object({
    meetings: requiredArray(LocalMeetingListItemSchema)
});

export const LocalMeetingListResultSchema: Schema<unknown, LocalMeetingListResultV1> =
    Schema.transform(localMeetingListResult, (value) => {
        assertExactKeys(value, ["meetings"], "local meeting list result");
        return value as LocalMeetingListResultV1;
    }) as Schema<unknown, LocalMeetingListResultV1>;

const localMeetingListResponse = Schema.object({
    protocolVersion: Schema.const(1).required(),
    ok: Schema.const(true).required(),
    result: LocalMeetingListResultSchema.required()
});

const compatibleLocalMeetingListResponse = Schema.object({
    protocolVersion: Schema.const(1).required(),
    ok: Schema.const(true).required(),
    result: Schema.object({
        meetings: requiredArray(localMeetingListItem)
    }).required()
});

export const LocalMeetingListResponseSchema: Schema<unknown, LocalMeetingListResponseV1> =
    Schema.transform(localMeetingListResponse, (value) => {
        assertExactKeys(value, ["protocolVersion", "ok", "result"], "local meeting list response");
        return value as LocalMeetingListResponseV1;
    }) as Schema<unknown, LocalMeetingListResponseV1>;

export const LocalMeetingListResponseConsumerSchema: Schema<unknown, LocalMeetingListResponseV1> =
    compatibleLocalMeetingListResponse as Schema<unknown, LocalMeetingListResponseV1>;

const continuationMaterial = Schema.object({
    sourceMeetingId: requiredString(),
    sourceKind: enumOf([
        "final_summary",
        "decision",
        "issue",
        "risk",
        "evidence",
        "artifact"
    ] as const),
    sourceObjectId: Schema.string(),
    summary: requiredString(),
    checksum: Schema.string()
});

const meetingLimits = Schema.object({
    maxTurns: requiredNumber(),
    maxSpeakersPerTurn: requiredNumber(),
    maxTotalMessages: requiredNumber(),
    maxDurationMs: Schema.number(),
    speakerAttemptTimeoutMs: Schema.number(),
    mailHandlingTimeoutMs: Schema.number()
});

const objectiveContract = Schema.object({
    requiredOutputs: requiredArray(
        Schema.object({
            id: requiredString(),
            description: requiredString(),
            status: enumOf(["pending", "ready", "accepted"] as const)
        })
    ),
    acceptanceCriteria: requiredArray(
        Schema.object({
            id: requiredString(),
            description: requiredString(),
            satisfied: requiredBoolean()
        })
    ),
    hardConstraints: requiredArray(
        Schema.object({ id: requiredString(), description: requiredString() })
    ),
    requiredReviewers: requiredArray(requiredString()),
    riskAcceptanceAuthority: requiredArray(requiredString()),
    acceptableRiskLevel: enumOf(["low", "medium", "high"] as const)
});

const agendaItem = Schema.object({
    id: requiredString(),
    title: requiredString(),
    objective: requiredString(),
    inScope: requiredArray(requiredString()),
    outOfScope: requiredArray(requiredString()),
    completionCriteria: requiredArray(requiredString()),
    owner: Schema.string(),
    requiredParticipants: requiredArray(requiredString()),
    relatedTaskIds: requiredArray(requiredString()),
    status: enumOf([
        "pending",
        "discussing",
        "waiting",
        "resolved",
        "deferred",
        "blocked"
    ] as const),
    resolution: Schema.string()
});

const question = Schema.object({
    id: requiredString(),
    text: requiredString(),
    askedBy: Schema.string(),
    directedTo: Schema.string(),
    agendaItemId: Schema.string(),
    blocking: Schema.boolean(),
    status: enumOf(["open", "answered", "withdrawn", "deferred"] as const),
    answerMessageId: Schema.string()
});

const decision = Schema.object({
    id: requiredString(),
    agendaItemId: Schema.string(),
    proposalId: requiredString(),
    proposalRevision: requiredNumber(),
    statement: Schema.string(),
    rationale: Schema.string(),
    status: enumOf(["accepted", "superseded", "revoked"] as const),
    acceptedBy: Schema.array(requiredString()),
    dissentingPositionIds: Schema.array(requiredString())
});

const blockingFact = Schema.object({
    id: requiredString(),
    kind: enumOf(["question", "objection", "issue", "risk", "required_review"] as const),
    subjectId: requiredString(),
    summary: requiredString()
});

const handRaise = Schema.object({
    id: requiredString(),
    participantId: requiredString(),
    reason: requiredString(),
    summary: requiredString(),
    taskIds: requiredArray(requiredString()),
    replyToMessageId: Schema.string(),
    agendaItemId: Schema.string(),
    priority: enumOf(["normal", "high", "blocking"] as const)
});

const meetingTask = Schema.object({
    meetingTaskId: requiredString(),
    participantId: requiredString(),
    title: requiredString(),
    blocking: requiredBoolean(),
    status: enumOf(["requested", "queued", "running", "completed", "failed", "cancelled"] as const),
    resultSummary: Schema.string(),
    failureReason: Schema.string(),
    createdAt: requiredNumber(),
    queuedAt: Schema.number(),
    startedAt: Schema.number(),
    finishedAt: Schema.number()
});

const step = Schema.object({
    id: requiredString(),
    participantId: requiredString(),
    instruction: requiredString(),
    reason: requiredString(),
    status: enumOf([
        "pending",
        "assigned",
        "running",
        "submitted",
        "skipped",
        "revoked",
        "failed"
    ] as const)
});

const turn = Schema.object({
    id: requiredString(),
    seq: requiredNumber(),
    agendaItemId: requiredString(),
    intent: requiredString(),
    objective: requiredString(),
    expectedOutputs: requiredArray(requiredString()),
    prohibitedTopics: requiredArray(requiredString()),
    steps: requiredArray(step)
});

const message = Schema.object({
    id: requiredString(),
    seq: requiredNumber(),
    turnId: requiredString(),
    stepId: requiredString(),
    speaker: requiredString(),
    agendaItemId: requiredString(),
    kind: enumOf([
        "statement",
        "question",
        "answer",
        "proposal",
        "objection",
        "evidence",
        "review",
        "summary",
        "decision"
    ] as const),
    content: requiredString(),
    mentions: requiredArray(requiredString()),
    replyTo: Schema.string(),
    taskIds: requiredArray(requiredString()),
    createdAt: requiredNumber()
});

const termination = Schema.object({
    code: requiredString(),
    reason: requiredString(),
    decisionIds: requiredArray(requiredString()),
    unresolvedQuestionIds: requiredArray(requiredString())
});

const executionTermination = Schema.object({
    code: requiredString(),
    reason: requiredString(),
    decisionIds: requiredArray(requiredString()),
    unresolvedQuestionIds: requiredArray(requiredString()),
    dissentingPositionIds: requiredArray(requiredString()),
    blockingAgendaItemIds: requiredArray(requiredString()),
    finalMessage: requiredString(),
    endedAt: requiredNumber()
});

const proposal = Schema.object({
    id: requiredString(),
    agendaItemId: requiredString(),
    title: requiredString(),
    description: requiredString(),
    revision: requiredNumber(),
    status: enumOf(["draft", "under_review", "accepted", "rejected", "superseded"] as const),
    positions: requiredArray(
        Schema.object({
            id: requiredString(),
            participantId: requiredString(),
            position: enumOf(["support", "accept", "object", "needs_revision", "abstain"] as const),
            reason: Schema.string(),
            blocking: requiredBoolean(),
            proposalRevision: requiredNumber()
        })
    )
});

const waitState = Schema.object({
    reason: requiredString(),
    taskIds: requiredArray(requiredString()),
    participantIds: requiredArray(requiredString()),
    deadlineAt: Schema.number(),
    resumeAgendaItemId: Schema.string()
});

const active = Schema.object({
    meetingId: requiredString(),
    meetingVersion: requiredNumber(),
    topic: requiredString(),
    objective: requiredString(),
    continuationMaterials: requiredArray(continuationMaterial),
    limits: meetingLimits.required(),
    activeAgendaItem: optionalObject(agendaItem),
    messages: requiredArray(message),
    questions: requiredArray(question),
    proposals: requiredArray(proposal),
    acceptedDecisions: requiredArray(decision),
    blockingFacts: requiredArray(blockingFact),
    meetingTasks: requiredArray(meetingTask),
    status: enumOf(["created", "running", "waiting", "paused", "converging"] as const),
    currentTurn: optionalObject(turn),
    currentSpeakerId: Schema.string(),
    waitState: optionalObject(waitState),
    pendingHandRaises: requiredArray(handRaise),
    pauseControl: Schema.object({
        action: enumOf(["pause", "resume", "none"] as const),
        pausedAt: Schema.number(),
        pausedBy: optionalObject(
            Schema.object({
                kind: enumOf(["user", "captain", "local_host"] as const),
                actorId: requiredString(),
                displayName: Schema.string()
            })
        ),
        reason: Schema.string()
    }).required(),
    termination: Schema.never(),
    archive: Schema.never()
});

const terminal = Schema.object({
    meetingId: requiredString(),
    meetingVersion: requiredNumber(),
    topic: requiredString(),
    objective: requiredString(),
    continuationMaterials: requiredArray(continuationMaterial),
    limits: meetingLimits.required(),
    activeAgendaItem: optionalObject(agendaItem),
    messages: requiredArray(message),
    questions: requiredArray(question),
    proposals: requiredArray(proposal),
    acceptedDecisions: requiredArray(decision),
    blockingFacts: requiredArray(blockingFact),
    status: enumOf(["completed", "partial", "no_consensus", "cancelled", "failed"] as const),
    currentTurn: Schema.never(),
    currentSpeakerId: Schema.never(),
    pendingHandRaises: Schema.tuple([]).required(),
    meetingTasks: requiredArray(meetingTask),
    pauseControl: Schema.object({ action: Schema.const("none").required() }).required(),
    termination: executionTermination.required(),
    completionFactIds: requiredArray(requiredString()),
    archive: Schema.never()
});

const artifactRef = Schema.object({
    artifactId: requiredString(),
    title: requiredString(),
    version: Schema.string(),
    checksum: Schema.string(),
    sourceTaskId: Schema.string(),
    uri: Schema.string()
});

const completionFact = Schema.object({
    id: requiredString(),
    kind: requiredString(),
    subjectId: requiredString(),
    assertedBy: requiredString(),
    authority: Schema.string(),
    result: requiredString(),
    evidenceMessageIds: requiredArray(requiredString()),
    taskIds: requiredArray(requiredString()),
    reason: Schema.string(),
    status: enumOf(["active", "superseded", "revoked"] as const)
});

const archiveIssue = Schema.object({
    id: requiredString(),
    title: requiredString(),
    description: requiredString(),
    disposition: enumOf([
        "blocking",
        "follow_up",
        "parking_lot",
        "accepted_risk",
        "out_of_scope"
    ] as const),
    status: enumOf([
        "open",
        "waiting",
        "resolved",
        "accepted",
        "deferred",
        "accepted_risk",
        "out_of_scope"
    ] as const),
    rationale: Schema.string(),
    ownerId: Schema.string(),
    relatedTaskIds: requiredArray(requiredString())
});

const archiveAgendaCandidate = Schema.object({
    id: requiredString(),
    title: requiredString(),
    reason: requiredString(),
    status: enumOf(["pending", "promoted", "parked", "rejected"] as const)
});

export const MeetingArchivePackageSchema = Schema.object({
    schemaVersion: Schema.const(1).required(),
    meetingId: requiredString(),
    teamId: requiredString(),
    sourceMeetingId: Schema.string(),
    objectiveContract: objectiveContract.required(),
    finalSummary: requiredString(),
    artifactRefs: requiredArray(artifactRef),
    acceptedDecisions: requiredArray(decision),
    proposals: requiredArray(proposal),
    completionFacts: requiredArray(completionFact),
    agenda: requiredArray(agendaItem),
    issues: requiredArray(archiveIssue),
    unresolvedQuestions: requiredArray(question),
    parkingLot: requiredArray(archiveAgendaCandidate),
    formalTranscript: requiredArray(message),
    participantProvenance: requiredArray(
        Schema.object({
            participantId: requiredString(),
            displayName: requiredString(),
            role: Schema.string(),
            templateVersion: Schema.string()
        })
    ),
    termination: termination.required(),
    endedAt: requiredNumber(),
    materializedAt: requiredNumber()
});

const archiving = Schema.object({
    meetingId: requiredString(),
    meetingVersion: requiredNumber(),
    topic: requiredString(),
    objective: requiredString(),
    continuationMaterials: requiredArray(continuationMaterial),
    limits: meetingLimits.required(),
    status: Schema.const("archiving").required(),
    currentTurn: Schema.never(),
    currentSpeakerId: Schema.never(),
    pendingHandRaises: Schema.tuple([]).required(),
    meetingTasks: requiredArray(meetingTask),
    pauseControl: Schema.object({ action: Schema.const("none").required() }).required(),
    termination: termination.required(),
    archive: Schema.object({
        package: MeetingArchivePackageSchema.required(),
        archivedAt: Schema.never()
    }).required()
});

const archived = Schema.object({
    meetingId: requiredString(),
    meetingVersion: requiredNumber(),
    topic: requiredString(),
    objective: requiredString(),
    continuationMaterials: requiredArray(continuationMaterial),
    limits: meetingLimits.required(),
    status: Schema.const("archived").required(),
    currentTurn: Schema.never(),
    currentSpeakerId: Schema.never(),
    pendingHandRaises: Schema.tuple([]).required(),
    meetingTasks: requiredArray(meetingTask),
    pauseControl: Schema.object({ action: Schema.const("none").required() }).required(),
    termination: termination.required(),
    archive: Schema.object({
        package: MeetingArchivePackageSchema.required(),
        archivedAt: requiredNumber()
    }).required()
});

const structuralMeetingStatusResultSchema = Schema.union([active, terminal, archiving, archived]);

export const MeetingStatusResultSchema: Schema<Record<string, unknown>> = Schema.transform(
    structuralMeetingStatusResultSchema,
    (value) => {
        if (
            (value.status === "archiving" || value.status === "archived") &&
            (value.archive as { package: { meetingId: string } }).package.meetingId !==
                value.meetingId
        ) {
            throw new TypeError("archive package meetingId does not match meetingId");
        }
        if (value.status === "paused") {
            const pauseControl = value.pauseControl as {
                action: string;
                pausedAt?: number;
                pausedBy?: unknown;
                reason?: string;
            };
            if (pauseControl.action !== "resume") {
                throw new TypeError("paused status has an invalid pause control action");
            }
            if (
                pauseControl.pausedAt === undefined ||
                pauseControl.pausedBy === undefined ||
                !pauseControl.reason?.trim()
            ) {
                throw new TypeError("paused status requires complete pause metadata");
            }
        }
        const expectedPauseAction =
            value.status === "paused"
                ? "resume"
                : ["created", "running", "waiting"].includes(value.status as string)
                  ? "pause"
                  : "none";
        if ((value.pauseControl as { action: string }).action !== expectedPauseAction) {
            throw new TypeError(`${value.status} status has an invalid pause control action`);
        }
        return value;
    }
);
