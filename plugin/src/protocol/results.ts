import z from "@deepseek-ai/schemastery";
import { MeetingProtocolErrorCodeSchema, ProtocolVersionSchema } from "./schema.js";

const string = () => z.string().required();
const number = () => z.number().required();
const array = <T>(schema: z<T>) => z.array(schema).required();
const enumOf = <T extends string>(values: readonly T[]) => z.union(values).required();

export const CreateMeetingResultSchema = z.object({
    meetingId: string(),
    meetingVersion: number(),
    status: enumOf(["created", "running"] as const),
    participants: array(z.object({ participantKey: string(), participantId: string() }))
});

export const ManagerPlanResultSchema = z.object({
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

export const TurnSubmissionResultSchema = z.object({
    messageId: string(),
    messageSeq: number(),
    turnStatus: enumOf(["running", "completed", "truncated"] as const),
    nextStepId: z.string(),
    meetingStatus: meetingStatus
});

export const HandRaiseResultSchema = z.object({
    handRaiseId: string(),
    status: enumOf(["pending", "accepted", "deferred", "consumed", "rejected"] as const)
});

export const MeetingControlResultSchema = z.object({
    status: enumOf(["paused", "running", "waiting"] as const),
    changed: z.boolean().required()
});

export const CaptainRiskDispositionResultSchema = z.object({
    requestId: string(),
    issueId: string(),
    disposition: enumOf(["accepted", "rejected"] as const),
    completionFactId: string(),
    meetingStatus: meetingStatus
});

export const ReassignTurnResultSchema = z.object({
    revokedAttemptId: string(),
    replacementAttemptId: z.string(),
    action: enumOf(["reassign", "skip"] as const)
});

export const EndMeetingResultSchema = z.object({
    status: enumOf(["completed", "partial", "no_consensus", "cancelled"] as const),
    terminationCode: string()
});

export const BackgroundTaskResultSchema = z.object({
    requestId: string(),
    taskId: string(),
    taskAttemptId: string(),
    association: enumOf(["created", "associated"] as const),
    originatingMeetingId: string(),
    originatingParticipantId: string(),
    originatingSpeakerAttemptId: string()
});

export const ProtocolErrorResultSchema = z.object({
    protocolVersion: ProtocolVersionSchema,
    ok: z.const(false).required(),
    code: MeetingProtocolErrorCodeSchema,
    message: string(),
    retryable: z.boolean().required()
});
