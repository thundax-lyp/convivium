import Schema from "@deepseek-ai/schemastery";
import { MeetingProtocolErrorCodeSchema, ProtocolVersionSchema } from "./schema.js";

const string = () => Schema.string().required();
const nonEmptyString = () => Schema.string().pattern(/\S/).required();
const number = () => Schema.number().required();
const array = <T>(schema: Schema<T>) => Schema.array(schema).required();
const enumOf = <T extends string>(values: readonly T[]) => Schema.union(values).required();

export const CreateMeetingResultSchema = Schema.object({
    meetingId: string(),
    meetingVersion: number(),
    status: enumOf(["created", "running"] as const),
    participants: array(Schema.object({ participantKey: string(), participantId: string() }))
});

export const ManagerPlanResultSchema = Schema.object({
    turnId: nonEmptyString(),
    firstStepId: nonEmptyString(),
    firstAttemptId: nonEmptyString()
});

const meetingStatus = enumOf([
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
] as const);

export const TurnSubmissionResultSchema = Schema.object({
    messageId: string(),
    messageSeq: number(),
    turnStatus: enumOf(["running", "completed", "truncated"] as const),
    nextStepId: Schema.string(),
    meetingStatus: meetingStatus
});

export const HandRaiseResultSchema = Schema.object({
    handRaiseId: string(),
    status: enumOf(["pending", "accepted", "deferred", "consumed", "rejected"] as const)
});

export const MeetingControlResultSchema = Schema.object({
    status: enumOf(["paused", "running", "waiting"] as const),
    changed: Schema.boolean().required()
});

export const CaptainRiskDispositionResultSchema = Schema.object({
    requestId: string(),
    issueId: string(),
    disposition: enumOf(["accepted", "rejected"] as const),
    completionFactId: string(),
    meetingStatus: meetingStatus
});

export const ReassignTurnResultSchema = Schema.object({
    revokedAttemptId: string(),
    replacementAttemptId: Schema.string(),
    action: enumOf(["reassign", "skip"] as const)
});

export const EndMeetingResultSchema = Schema.object({
    status: enumOf(["completed", "partial", "no_consensus", "cancelled"] as const),
    terminationCode: string()
});

const meetingTaskStatus = enumOf([
    "requested",
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled"
] as const);

const meetingTaskProjection = Schema.object({
    meetingTaskId: string(),
    participantId: string(),
    title: string(),
    blocking: Schema.boolean().required(),
    status: meetingTaskStatus,
    resultSummary: Schema.string(),
    failureReason: Schema.string(),
    createdAt: number(),
    queuedAt: Schema.number(),
    startedAt: Schema.number(),
    finishedAt: Schema.number()
});

export const MeetingTaskResultSchema = Schema.object({
    requestId: string(),
    meetingTaskId: string(),
    participantId: string(),
    originatingSpeakerAttemptId: string(),
    status: meetingTaskStatus
});

export const MeetingTaskStatusResultSchema = Schema.object({
    task: meetingTaskProjection.required(),
    observedMeetingVersion: number(),
    meetingTerminal: Schema.boolean().required(),
    mayExecute: Schema.boolean().required()
});

export const MeetingTaskStartResultSchema = Schema.object({
    requestId: string(),
    meetingTaskId: string(),
    status: enumOf(["running"] as const)
});

export const MeetingTaskFinishResultSchema = Schema.object({
    requestId: string(),
    meetingTaskId: string(),
    status: enumOf(["completed", "failed"] as const),
    handRaiseId: string()
});

export const ProtocolErrorResultSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    ok: Schema.const(false).required(),
    code: MeetingProtocolErrorCodeSchema,
    message: string(),
    retryable: Schema.boolean().required()
});
