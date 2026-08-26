import z from "@deepseek-ai/schemastery";
import { ProtocolVersionSchema } from "./schema.js";

const string = () => z.string().required();
const number = () => z.number().required();
const boolean = () => z.boolean().required();
const array = <T>(schema: z<T>) => z.array(schema).required();
const enumOf = <T extends string>(values: readonly T[]) => z.union(values).required();
const optionalEnumOf = <T extends string>(values: readonly T[]) => z.union(values);
const optionalObject = <T>(schema: z<T>) => z.union([schema, z.const(undefined)]);

const participantSpec = z.object({
    participantKey: string(),
    sourceMemberName: z.string(),
    displayName: string(),
    role: z.string()
});

const objectiveContractSpec = z.object({
    requiredOutputs: array(z.object({ key: string(), description: string() })),
    acceptanceCriteria: array(z.object({ key: string(), description: string() })),
    hardConstraints: array(z.object({ key: string(), description: string() })),
    requiredReviewerKeys: array(string()),
    riskAcceptanceAuthorityKeys: array(string()),
    acceptableRiskLevel: enumOf(["low", "medium", "high"] as const)
});

const agendaItemSpec = z.object({
    key: string(),
    title: string(),
    objective: string(),
    inScope: array(string()),
    outOfScope: array(string()),
    completionCriteria: array(string()),
    ownerKey: z.string(),
    requiredParticipantKeys: array(string()),
    relatedTaskIds: z.array(string())
});

const continuationSelection = z.object({
    sourceMeetingId: string(),
    includeFinalSummary: boolean(),
    decisionIds: array(string()),
    unresolvedIssueIds: array(string()),
    riskIds: array(string()),
    evidenceIds: array(string()),
    artifactIds: array(string())
});

const publicLimits = z.object({
    maxTurns: number(),
    maxSpeakersPerTurn: number(),
    maxTotalMessages: number(),
    maxDurationMs: z.number(),
    speakerAttemptTimeoutMs: z.number(),
    mailHandlingTimeoutMs: z.number()
});

export const CreateMeetingInputSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    requestId: string(),
    teamId: string(),
    topic: string(),
    objective: string(),
    objectiveContract: objectiveContractSpec.required(),
    agenda: array(agendaItemSpec),
    participants: array(participantSpec),
    continuation: optionalObject(continuationSelection),
    selectionMode: optionalEnumOf(["round_robin", "rule_based", "manager", "hybrid"] as const),
    limits: optionalObject(publicLimits)
});

export const MeetingStatusInputSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string()
});

export const PauseMeetingInputSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    expectedMeetingVersion: number(),
    requestId: string(),
    reason: string()
});

export const ResumeMeetingInputSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    expectedMeetingVersion: number(),
    requestId: string()
});

export const CaptainRiskDispositionInputSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    expectedMeetingVersion: number(),
    requestId: string(),
    issueId: string(),
    decision: enumOf(["accept", "reject"] as const),
    reason: string(),
    evidenceMessageIds: array(string())
});

export const ReassignTurnInputSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    expectedMeetingVersion: number(),
    currentAttemptId: string(),
    action: enumOf(["reassign", "skip"] as const),
    replacementParticipantId: z.string(),
    reason: string(),
    requestId: string()
});

export const EndMeetingInputSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    expectedMeetingVersion: number(),
    outcome: enumOf(["completed", "partial", "no_consensus", "cancelled"] as const),
    reason: string(),
    acceptedDecisionIds: array(string()),
    deferredAgendaItemIds: array(string()),
    waivers: array(
        z.object({
            subjectId: string(),
            kind: enumOf(["required_review", "agenda_item"] as const),
            reason: string()
        })
    ),
    requestId: string()
});

export const BackgroundTaskRequestSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    attemptId: string(),
    requestId: string(),
    action: enumOf(["create", "associate"] as const),
    title: z.string(),
    description: z.string(),
    existingTaskId: z.string(),
    blocking: boolean()
});

const publicMessageKind = enumOf([
    "statement",
    "question",
    "answer",
    "proposal",
    "objection",
    "evidence",
    "review",
    "summary",
    "decision"
] as const);

const questionClaim = z.object({
    text: string(),
    directedTo: z.string(),
    blocking: boolean()
});

const proposalClaim = z.object({
    proposalId: z.string(),
    expectedRevision: z.number(),
    title: string(),
    description: string()
});

const positionClaim = z.object({
    proposalId: string(),
    proposalRevision: number(),
    position: enumOf(["support", "accept", "object", "needs_revision", "abstain"] as const),
    reason: z.string(),
    blocking: boolean()
});

const issueClaim = z.object({
    title: string(),
    description: string(),
    affectedOutputIds: array(string()),
    affectedCriterionIds: array(string()),
    violatedConstraintIds: array(string()),
    impact: enumOf(["none", "low", "medium", "high", "critical"] as const),
    urgency: enumOf(["now", "before_release", "later"] as const),
    safeDefaultAvailable: boolean()
});

const decisionProposalClaim = z.object({
    proposalId: string(),
    proposalRevision: number(),
    statement: string(),
    rationale: string()
});

const agendaCandidateClaim = z.object({
    title: string(),
    reason: string(),
    relationToActiveAgenda: enumOf(["related", "adjacent", "unrelated"] as const),
    urgency: enumOf(["now", "before_release", "later"] as const),
    suggestedParticipants: array(string())
});

const meetingChanges = z.object({
    questions: z.array(questionClaim),
    proposals: z.array(proposalClaim),
    positions: z.array(positionClaim),
    issues: z.array(issueClaim),
    decisionProposals: z.array(decisionProposalClaim),
    agendaCandidates: z.array(agendaCandidateClaim)
});

const completionClaims = z.object({
    outputClaims: z.array(
        z.object({
            subjectId: string(),
            evidenceMessageIds: array(string()),
            taskIds: array(string())
        })
    ),
    criterionClaims: z.array(
        z.object({
            subjectId: string(),
            evidenceMessageIds: array(string()),
            taskIds: array(string())
        })
    ),
    agendaResolution: optionalObject(
        z.object({
            agendaItemId: string(),
            resolution: string(),
            evidenceMessageIds: array(string())
        })
    ),
    review: optionalObject(
        z.object({
            outputId: string(),
            result: enumOf(["approved", "changes_required"] as const),
            reason: string(),
            evidenceMessageIds: array(string())
        })
    ),
    questionResolutions: z.array(z.object({ questionId: string(), answerMessageId: string() })),
    riskAcceptance: optionalObject(
        z.object({
            issueId: string(),
            decision: enumOf(["accept", "reject"] as const),
            reason: string(),
            evidenceMessageIds: array(string())
        })
    )
});

export const ManagerPlanSubmissionSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    planningAttemptId: string(),
    observedMeetingVersion: number(),
    requestId: string(),
    agendaItemId: string(),
    intent: string(),
    objective: string(),
    expectedOutputs: array(string()),
    prohibitedTopics: array(string()),
    steps: array(z.object({ participantId: string(), instruction: string(), reason: string() }))
});

export const TurnSubmissionSchema: z<any> = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    turnId: string(),
    stepId: string(),
    attemptId: string(),
    deliveryId: string(),
    agendaItemId: string(),
    kind: publicMessageKind,
    content: string(),
    mentions: array(string()),
    replyTo: z.string(),
    taskIds: array(string()),
    agendaRelation: enumOf([
        "on_topic",
        "supporting_context",
        "new_topic_candidate",
        "blocking_interrupt"
    ] as const),
    changes: meetingChanges.required(),
    completionClaims: optionalObject(completionClaims)
});

export const HandRaiseSubmissionSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    requestId: string(),
    reason: enumOf([
        "task_completed",
        "new_evidence",
        "answer_ready",
        "blocking_objection",
        "correction",
        "user_requested"
    ] as const),
    summary: string(),
    taskIds: array(string()),
    replyToMessageId: z.string(),
    agendaItemId: z.string(),
    priority: enumOf(["normal", "high", "blocking"] as const)
});

export const MeetingScopedMailSchema = z.object({
    recipient: z.object({
        kind: z.const("meeting_participant").required(),
        meetingId: string(),
        participantId: string()
    }),
    meetingContext: z.object({
        meetingId: string(),
        agendaItemId: z.string(),
        contextFromSeq: number(),
        contextThroughSeq: number(),
        relevantMessageIds: array(string()),
        snapshotSummary: z.string()
    }),
    replyToMailId: z.string()
});

export function validateCommandInput<T>(schema: z<T>, value: unknown): T {
    return schema(value as T);
}

export function validateBackgroundTaskRequest(value: unknown) {
    const result = validateCommandInput(BackgroundTaskRequestSchema, value);
    if (
        result.action === "create" &&
        (!result.title || !result.description || result.existingTaskId)
    ) {
        throw new TypeError("create background task requires title and description only");
    }
    if (
        result.action === "associate" &&
        (!result.existingTaskId || result.title || result.description)
    ) {
        throw new TypeError("associate background task requires existingTaskId only");
    }
    return result;
}

export function validateReassignTurnInput(value: unknown) {
    const result = validateCommandInput(ReassignTurnInputSchema, value);
    if (result.action === "reassign" && !result.replacementParticipantId) {
        throw new TypeError("reassign requires replacementParticipantId");
    }
    if (result.action === "skip" && result.replacementParticipantId) {
        throw new TypeError("skip must not provide replacementParticipantId");
    }
    return result;
}
