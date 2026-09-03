import Schema from "@deepseek-ai/schemastery";
import { ProtocolVersionSchema } from "./schema.js";
import type {
    CreateMeetingInputV1,
    FinishMeetingMailInputV1,
    SendMeetingMessageInputV1
} from "./types.js";

const string = () => Schema.string().required();
const nonEmptyString = () => Schema.string().pattern(/\S/).required();
const number = () => Schema.number().required();
const boolean = () => Schema.boolean().required();
const array = <T>(schema: Schema<T>) => Schema.array(schema).required();
const enumOf = <T extends string>(values: readonly T[]) => Schema.union(values).required();
const optionalEnumOf = <T extends string>(values: readonly T[]) => Schema.union(values);
const optionalObject = <T>(schema: Schema<T>) => Schema.union([schema, Schema.const(undefined)]);

function assertExactKeys(value: object, expected: readonly string[], label: string): void {
    const actual = Object.keys(value).sort();
    const required = [...expected].sort();
    if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
        throw new TypeError(`${label} has unexpected fields`);
    }
}

const participantSpec = Schema.object({
    participantKey: string(),
    sourceMemberName: Schema.string(),
    displayName: string(),
    role: Schema.string()
});

const objectiveContractSpec = Schema.object({
    requiredOutputs: array(Schema.object({ key: string(), description: string() })),
    acceptanceCriteria: array(Schema.object({ key: string(), description: string() })),
    hardConstraints: array(Schema.object({ key: string(), description: string() })),
    requiredReviewerKeys: array(string()),
    riskAcceptanceAuthorityKeys: array(string()),
    acceptableRiskLevel: enumOf(["low", "medium", "high"] as const)
});

const agendaItemSpec = Schema.object({
    key: string(),
    title: string(),
    objective: string(),
    inScope: array(string()),
    outOfScope: array(string()),
    completionCriteria: array(string()),
    ownerKey: Schema.string(),
    requiredParticipantKeys: array(string()),
    relatedTaskIds: Schema.array(string())
});

const continuationSelection = Schema.object({
    sourceMeetingId: string(),
    includeFinalSummary: boolean(),
    decisionIds: array(string()),
    unresolvedIssueIds: array(string()),
    riskIds: array(string()),
    evidenceIds: array(string()),
    artifactIds: array(string())
});

const publicLimits = Schema.object({
    maxTurns: Schema.number(),
    maxSpeakersPerTurn: Schema.number(),
    maxTotalMessages: Schema.number(),
    maxDurationMs: Schema.number(),
    speakerAttemptTimeoutMs: Schema.number(),
    mailHandlingTimeoutMs: Schema.number()
});

const createMeetingInputSchema = Schema.object({
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

export const CreateMeetingInputSchema: Schema<unknown, CreateMeetingInputV1> = Schema.transform(
    createMeetingInputSchema,
    (value) => {
        if (!Array.isArray(value.agenda) || value.agenda.length === 0) {
            throw new TypeError("At least one agenda item is required");
        }
        return value as CreateMeetingInputV1;
    }
) as Schema<unknown, CreateMeetingInputV1>;

export const MeetingStatusInputSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string()
});

export const PauseMeetingInputSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    expectedMeetingVersion: number(),
    requestId: string(),
    reason: string()
});

export const ResumeMeetingInputSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    expectedMeetingVersion: number(),
    requestId: string()
});

export const CaptainRiskDispositionInputSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    expectedMeetingVersion: number(),
    requestId: string(),
    issueId: string(),
    decision: enumOf(["accept", "reject"] as const),
    reason: string(),
    evidenceMessageIds: array(string())
});

const reassignTurnInputSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    expectedMeetingVersion: number(),
    currentAttemptId: string(),
    action: enumOf(["reassign", "skip"] as const),
    replacementParticipantId: Schema.string(),
    reason: string(),
    requestId: string()
});

export const EndMeetingInputSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    expectedMeetingVersion: number(),
    outcome: enumOf(["completed", "partial", "no_consensus", "cancelled"] as const),
    reason: string(),
    acceptedDecisionIds: array(string()),
    deferredAgendaItemIds: array(string()),
    waivers: array(
        Schema.object({
            subjectId: string(),
            kind: enumOf(["required_review", "agenda_item"] as const),
            reason: string()
        })
    ),
    requestId: string()
});

export const MeetingTaskRequestSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    attemptId: string(),
    requestId: string(),
    title: nonEmptyString(),
    description: nonEmptyString(),
    blocking: boolean()
});

export const MeetingTaskStatusInputSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    meetingTaskId: string()
});

export const MeetingTaskStartInputSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    meetingTaskId: string(),
    requestId: string()
});

export const MeetingTaskFinishInputSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: string(),
    meetingTaskId: string(),
    requestId: string(),
    executionId: string(),
    status: enumOf(["completed", "failed"] as const),
    resultSummary: Schema.string(),
    failureReason: Schema.string()
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

const questionClaim = Schema.object({
    text: nonEmptyString(),
    directedTo: Schema.string(),
    blocking: boolean(),
    affectedOutputIds: Schema.array(string()).default([]),
    affectedCriterionIds: Schema.array(string()).default([]),
    violatedConstraintIds: Schema.array(string()).default([])
});

const proposalClaim = Schema.object({
    proposalId: Schema.string(),
    expectedRevision: Schema.number(),
    title: string(),
    description: string()
});

const positionClaim = Schema.object({
    proposalId: string(),
    proposalRevision: number(),
    position: enumOf(["support", "accept", "object", "needs_revision", "abstain"] as const),
    reason: Schema.string(),
    blocking: boolean()
});

const issueClaim = Schema.object({
    title: string(),
    description: string(),
    affectedOutputIds: array(string()),
    affectedCriterionIds: array(string()),
    violatedConstraintIds: array(string()),
    impact: enumOf(["none", "low", "medium", "high", "critical"] as const),
    urgency: enumOf(["now", "before_release", "later"] as const),
    safeDefaultAvailable: boolean(),
    riskLevel: enumOf(["low", "medium", "high"] as const)
});

const decisionProposalClaim = Schema.object({
    proposalId: string(),
    proposalRevision: number(),
    statement: string(),
    rationale: string()
});

export const CaptainDecisionAcceptanceInputSchema = Schema.object({
    protocolVersion: Schema.const(1).required(),
    meetingId: nonEmptyString(),
    expectedMeetingVersion: number(),
    requestId: nonEmptyString(),
    decisionCandidateId: nonEmptyString(),
    reason: nonEmptyString(),
    evidenceMessageIds: array(string())
});

const captainDecisionDispositionInput = Schema.object({
    protocolVersion: Schema.const(1).required(),
    meetingId: nonEmptyString(),
    expectedMeetingVersion: number(),
    requestId: nonEmptyString(),
    decisionId: nonEmptyString(),
    action: enumOf(["supersede", "revoke"] as const),
    reason: nonEmptyString(),
    evidenceMessageIds: array(nonEmptyString()),
    replacementCandidateId: Schema.string()
});

export const CaptainDecisionDispositionInputSchema = Schema.transform(
    captainDecisionDispositionInput,
    (value) => {
        const expected = [
            "protocolVersion",
            "meetingId",
            "expectedMeetingVersion",
            "requestId",
            "decisionId",
            "action",
            "reason",
            "evidenceMessageIds",
            ...(value.action === "supersede" ? ["replacementCandidateId"] : [])
        ];
        assertExactKeys(value, expected, "captain decision disposition input");
        if (value.action === "supersede" && !value.replacementCandidateId?.trim()) {
            throw new TypeError("supersede requires replacementCandidateId");
        }
        return value;
    }
);

const agendaCandidateClaim = Schema.object({
    title: string(),
    reason: string(),
    relationToActiveAgenda: enumOf(["related", "adjacent", "unrelated"] as const),
    urgency: enumOf(["now", "before_release", "later"] as const),
    suggestedParticipants: array(string())
});

const meetingChanges = Schema.object({
    questions: Schema.array(questionClaim),
    proposals: Schema.array(proposalClaim),
    positions: Schema.array(positionClaim),
    issues: Schema.array(issueClaim),
    decisionProposals: Schema.array(decisionProposalClaim),
    agendaCandidates: Schema.array(agendaCandidateClaim)
});

const completionClaims = Schema.object({
    outputClaims: Schema.array(
        Schema.object({
            subjectId: string(),
            evidenceMessageIds: array(string()),
            taskIds: array(string())
        })
    ),
    criterionClaims: Schema.array(
        Schema.object({
            subjectId: string(),
            evidenceMessageIds: array(string()),
            taskIds: array(string())
        })
    ),
    agendaResolution: optionalObject(
        Schema.object({
            agendaItemId: string(),
            resolution: string(),
            evidenceMessageIds: array(string())
        })
    ),
    review: optionalObject(
        Schema.object({
            outputId: string(),
            result: enumOf(["approved", "changes_required"] as const),
            reason: string(),
            evidenceMessageIds: array(string())
        })
    ),
    questionResolutions: Schema.array(
        Schema.object({ questionId: string(), answerMessageId: string() })
    ),
    riskAcceptance: optionalObject(
        Schema.object({
            issueId: string(),
            decision: enumOf(["accept", "reject"] as const),
            reason: string(),
            evidenceMessageIds: array(string())
        })
    )
});

const managerPlanStep = Schema.object({
    participantId: nonEmptyString(),
    instruction: nonEmptyString(),
    reason: nonEmptyString()
});
// Schemastery skips array minimum checks when an object element has its default {}.
managerPlanStep.meta.default = undefined;

export const ManagerPlanSubmissionSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: nonEmptyString(),
    planningAttemptId: nonEmptyString(),
    observedMeetingVersion: number(),
    requestId: nonEmptyString(),
    agendaItemId: nonEmptyString(),
    intent: nonEmptyString(),
    objective: nonEmptyString(),
    expectedOutputs: array(string()),
    prohibitedTopics: array(string()),
    steps: array(managerPlanStep).min(1)
});

export const TurnSubmissionSchema: Schema<Record<string, unknown>> = Schema.object({
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
    replyTo: Schema.string(),
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

export const HandRaiseSubmissionSchema = Schema.object({
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
    replyToMessageId: Schema.string(),
    agendaItemId: Schema.string(),
    priority: enumOf(["normal", "high", "blocking"] as const)
});

export const MeetingScopedMailSchema = Schema.object({
    recipient: Schema.object({
        kind: Schema.const("meeting_participant").required(),
        meetingId: string(),
        participantId: string()
    }).required(),
    meetingContext: Schema.object({
        meetingId: string(),
        agendaItemId: Schema.string(),
        contextFromSeq: number(),
        contextThroughSeq: number(),
        relevantMessageIds: array(string()),
        snapshotSummary: Schema.string()
    }).required(),
    replyToMailId: Schema.string()
});

export const SendMeetingMessageInputSchema: Schema<unknown, SendMeetingMessageInputV1> =
    Schema.object({
        protocolVersion: ProtocolVersionSchema,
        meetingId: string(),
        expectedMeetingVersion: number(),
        requestId: nonEmptyString(),
        recipient: Schema.object({
            kind: Schema.const("meeting_participant").required(),
            meetingId: string(),
            participantId: string()
        }).required(),
        content: nonEmptyString(),
        meetingContext: Schema.object({
            meetingId: string(),
            agendaItemId: Schema.string(),
            contextFromSeq: number(),
            contextThroughSeq: number(),
            relevantMessageIds: array(string()),
            snapshotSummary: Schema.string()
        }).required(),
        replyToMailId: Schema.string()
    }) as Schema<unknown, SendMeetingMessageInputV1>;

export const FinishMeetingMailInputSchema: Schema<unknown, FinishMeetingMailInputV1> =
    Schema.object({
        protocolVersion: ProtocolVersionSchema,
        meetingId: string(),
        mailId: string(),
        handlingAttemptId: string(),
        deliveryId: string(),
        requestId: nonEmptyString(),
        status: enumOf(["processed", "obsolete", "failed"] as const)
    }) as Schema<unknown, FinishMeetingMailInputV1>;

export function validateCommandInput<T>(schema: Schema<T>, value: unknown): T {
    return schema(value as T);
}

export function validateReassignTurnInput(value: unknown) {
    const result = validateCommandInput(reassignTurnInputSchema, value);
    const hasReplacementParticipantId = Object.prototype.hasOwnProperty.call(
        result,
        "replacementParticipantId"
    );
    if (
        result.action === "reassign" &&
        (!hasReplacementParticipantId || !result.replacementParticipantId)
    ) {
        throw new TypeError("reassign requires replacementParticipantId");
    }
    if (result.action === "skip" && hasReplacementParticipantId) {
        throw new TypeError("skip must not provide replacementParticipantId");
    }
    return result;
}
