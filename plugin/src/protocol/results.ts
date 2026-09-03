import Schema from "@deepseek-ai/schemastery";
import { MeetingProtocolErrorCodeSchema, ProtocolVersionSchema } from "./schema.js";

const string = () => Schema.string().required();
const optionalString = () => Schema.union([Schema.string(), Schema.const(undefined)]);
const nonEmptyString = () => Schema.string().pattern(/\S/).required();
const number = () => Schema.number().required();
const array = <T>(schema: Schema<T>) => Schema.array(schema).required();
const enumOf = <T extends string>(values: readonly T[]) => Schema.union(values).required();

function assertExactKeys(value: object, expected: readonly string[], label: string): void {
    const actual = Object.keys(value).sort();
    const required = [...expected].sort();
    if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
        throw new TypeError(`${label} has unexpected fields`);
    }
}

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

export const CaptainDecisionAcceptanceResultSchema = Schema.object({
    requestId: string(),
    decisionCandidateId: string(),
    decisionId: string(),
    proposalId: string(),
    proposalRevision: number(),
    completionFactId: string()
});

const captainDecisionDispositionResult = Schema.object({
    requestId: string(),
    decisionId: string(),
    action: enumOf(["supersede", "revoke"] as const),
    completionFactId: string(),
    replacementDecisionId: Schema.string()
});

export const CaptainDecisionDispositionResultSchema: Schema<Record<string, unknown>> =
    Schema.transform(captainDecisionDispositionResult, (value) => {
        const expected = [
            "requestId",
            "decisionId",
            "action",
            "completionFactId",
            ...(value.action === "supersede" ? ["replacementDecisionId"] : [])
        ];
        assertExactKeys(value, expected, "captain decision disposition result");
        if (value.action === "supersede" && !value.replacementDecisionId?.trim()) {
            throw new TypeError("supersede requires replacementDecisionId");
        }
        return value as Record<string, unknown>;
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

const meetingTaskFinishResultBase = Schema.object({
    requestId: string(),
    meetingTaskId: string(),
    status: enumOf(["completed", "failed"] as const),
    handRaiseId: optionalString()
});

export const MeetingTaskFinishResultSchema: Schema<Record<string, unknown>> = Schema.transform(
    meetingTaskFinishResultBase,
    (value) => {
        if (value.status === "completed") {
            if (typeof value.handRaiseId !== "string" || value.handRaiseId.length === 0) {
                throw new Error("completed MeetingTask results require handRaiseId");
            }
        } else if (value.handRaiseId !== undefined) {
            throw new Error("failed MeetingTask results must omit handRaiseId");
        }
        return value;
    },
    true
);

export const ProtocolErrorResultSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    ok: Schema.const(false).required(),
    code: MeetingProtocolErrorCodeSchema,
    message: string(),
    retryable: Schema.boolean().required()
});
