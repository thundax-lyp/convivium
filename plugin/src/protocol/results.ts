import Schema from "@deepseek-ai/schemastery";
import { MeetingProtocolErrorCodeSchema, ProtocolVersionSchema } from "./schema.js";

const string = () => Schema.string().required();
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
    turnId: string(),
    firstStepId: string(),
    firstAttemptId: string()
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

export const BackgroundTaskResultSchema = Schema.object({
    requestId: string(),
    taskId: string(),
    taskAttemptId: string(),
    association: enumOf(["created", "associated"] as const),
    originatingMeetingId: string(),
    originatingParticipantId: string(),
    originatingSpeakerAttemptId: string()
});

export const ProtocolErrorResultSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    ok: Schema.const(false).required(),
    code: MeetingProtocolErrorCodeSchema,
    message: string(),
    retryable: Schema.boolean().required()
});
