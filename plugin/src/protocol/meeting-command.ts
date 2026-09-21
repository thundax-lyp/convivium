import { z } from "zod";
import {
    RecommendIdentityActionV1Schema,
    RecordIdentityAdmissionResultActionV1Schema
} from "./meeting-identity.js";

const id = z.string().trim().min(1);
const text = z.string().trim().min(1);
const epoch = z.number().int().nonnegative();
const target = z.object({ id, text });
const objective = z.object({
    statement: text,
    requiredOutputs: z.array(target),
    acceptanceCriteria: z.array(target),
    hardConstraints: z.array(target),
    acceptableRiskLevel: z.enum(["low", "medium", "high"])
});
const initialIdentity = z.object({
    identityKey: id,
    definitionId: id,
    definitionVersion: text,
    displayName: text,
    roles: z.array(z.enum(["captain", "manager", "contributor", "evidence_reviewer"])),
    agendaResponsibilityIds: z.array(id),
    riskAuthority: z.boolean(),
    required: z.boolean()
});
const initialAgenda = z.object({
    id,
    title: text,
    question: text,
    requiredOutputIds: z.array(id),
    ownerIdentityKey: id.optional()
});
const limits = z.object({
    maxFormalMessages: z.number().int().nonnegative(),
    maxDurationMs: z.number().int().nonnegative(),
    taskDeadlineMs: z.number().int().nonnegative(),
    reviewDeadlineMs: z.number().int().nonnegative()
});
const continuation = z.object({ sourceArchiveId: id, selectedMaterialIds: z.array(id) });
export const CreateMeetingActionSchema = z.object({
    kind: z.literal("create_meeting"),
    objective,
    identities: z.array(initialIdentity),
    managerIdentityKey: id,
    evidenceReviewerIdentityKey: id,
    initialAgenda: z.array(initialAgenda),
    initialActiveAgendaId: id,
    limits,
    continuation: continuation.optional()
});
const evidenceText = z.object({ value: text, reason: text.optional() });
const evidenceClaim = z.object({
    id,
    statement: text,
    materialIds: z.array(id),
    qualification: text
});
const material = z.object({
    id,
    kind: z.enum([
        "document",
        "dataset",
        "experiment",
        "observation",
        "tool_output",
        "unknown",
        "not_applicable"
    ]),
    originator: text,
    originalSource: text,
    sourcePublishedAt: text,
    acquiredAt: text,
    version: text,
    locator: text,
    location: text,
    verificationConditions: text,
    limitations: text,
    sharedDependencies: z.array(text),
    reason: text.optional()
});
const evidence = z.object({
    observation: text,
    interpretation: text,
    method: text,
    falsifiers: z.array(evidenceText).min(1),
    uncertainties: z.array(evidenceText).min(1),
    limitations: z.array(evidenceText).min(1),
    claims: z.array(evidenceClaim).min(1),
    materials: z.array(material).min(1)
});
const reviewDimension = z.object({
    score: z.union([
        z.literal(0),
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal("unable_to_assess")
    ]),
    scope: text,
    reason: text,
    baselineEvidenceIds: z.array(id)
});
const reviewDimensions = z.object({
    source: reviewDimension,
    credibility: reviewDimension,
    completeness: reviewDimension,
    support: reviewDimension
});
export const OpenRoundActionV1Schema = z.object({
    kind: z.literal("open_round"),
    agendaId: id,
    planId: id,
    deadlineAt: epoch.optional()
});
export const SubmitManagerPlanActionV1Schema = z
    .object({
        kind: z.literal("submit_manager_plan"),
        agendaId: id,
        planKind: z.enum([
            "open_round",
            "continue_agenda",
            "stop_agenda",
            "raise_agenda_candidate",
            "wait_for_required_identity"
        ]),
        roundGoal: z.object({ question: text, evidenceGap: text, expectedOutput: text }).optional(),
        rationale: text,
        blockingReason: text.optional()
    })
    .superRefine((value, ctx) => {
        if ((value.planKind === "open_round") !== (value.roundGoal !== undefined))
            ctx.addIssue({ code: "custom", path: ["roundGoal"] });
    });
export const RaiseHandActionV1Schema = z.object({
    kind: z.literal("raise_hand"),
    roundId: id,
    purpose: text
});
export const DisposeHandRaiseActionSchema = z.object({
    kind: z.literal("dispose_hand_raise"),
    roundId: id,
    contributorId: id,
    disposition: z.enum(["accepted", "rejected", "deferred"]),
    reason: text
});
export const SubmitEvidenceActionV1Schema = z.object({
    kind: z.literal("submit_evidence"),
    contributionId: id,
    evidence
});
export const ClaimReviewBatchActionSchema = z.object({
    kind: z.literal("claim_review_batch"),
    sourceEffectId: id,
    roundId: id,
    versionIds: z
        .array(id)
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length)
});
export const ReleaseReviewBatchClaimActionV1Schema = z.object({
    kind: z.literal("release_review_batch_claim"),
    roundId: id,
    claimId: id,
    reason: z.enum(["turn_timed_out", "turn_interrupted", "dispatch_failed"])
});
export const SubmitReviewBatchActionV1Schema = z
    .object({
        kind: z.literal("submit_review_batch"),
        roundId: id,
        claimId: id,
        reviews: z
            .array(z.object({ versionId: id, dimensions: reviewDimensions, scope: text }))
            .min(1)
    })
    .superRefine((value, ctx) => {
        const ids = value.reviews.map((review) => review.versionId);
        if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["reviews"] });
    });
export const PublishRoundActionV1Schema = z.object({
    kind: z.literal("publish_round"),
    roundId: id
});
export const PauseMeetingActionV1Schema = z.object({
    kind: z.literal("pause_meeting"),
    reason: text
});
export const ResumeMeetingActionV1Schema = z.object({
    kind: z.literal("resume_meeting"),
    reason: text
});

const actions = [
    CreateMeetingActionSchema,
    RecommendIdentityActionV1Schema,
    RecordIdentityAdmissionResultActionV1Schema,
    SubmitManagerPlanActionV1Schema,
    OpenRoundActionV1Schema,
    RaiseHandActionV1Schema,
    DisposeHandRaiseActionSchema,
    SubmitEvidenceActionV1Schema,
    z.object({
        kind: z.literal("close_contribution"),
        contributionId: id,
        exit: z.enum(["withdrawn", "submission_missing", "timed_out"]),
        reason: text
    }),
    ClaimReviewBatchActionSchema,
    ReleaseReviewBatchClaimActionV1Schema,
    SubmitReviewBatchActionV1Schema,
    z
        .object({
            kind: z.literal("record_review_delivery"),
            reviewId: id,
            status: z.enum(["sent", "failed"]),
            failureReason: text.optional()
        })
        .superRefine((value, ctx) => {
            if (value.status === "sent" && value.failureReason !== undefined)
                ctx.addIssue({ code: "custom", path: ["failureReason"] });
            if (value.status === "failed" && value.failureReason === undefined)
                ctx.addIssue({ code: "custom", path: ["failureReason"] });
        }),
    PublishRoundActionV1Schema,
    PauseMeetingActionV1Schema,
    ResumeMeetingActionV1Schema,
    z.object({
        kind: z.literal("end_meeting"),
        outcome: z.enum(["completed", "partial", "no_consensus", "cancelled", "failed"]),
        reason: text,
        decisionIds: z.array(id),
        completionFactIds: z.array(id),
        unresolvedQuestionIds: z.array(id),
        unresolvedIssueIds: z.array(id)
    }),
    z.object({ kind: z.literal("start_archive") }),
    z
        .object({
            kind: z.literal("record_archive_session_result"),
            sessionOwnershipId: id,
            status: z.enum(["closed", "failed"]),
            failureReason: text.optional()
        })
        .superRefine((value, ctx) => {
            if (value.status === "closed" && value.failureReason !== undefined)
                ctx.addIssue({ code: "custom", path: ["failureReason"] });
            if (value.status === "failed" && value.failureReason === undefined)
                ctx.addIssue({ code: "custom", path: ["failureReason"] });
        })
] as const;
export const MeetingActionV1Schema = z.discriminatedUnion("kind", actions);
const nonEmpty = z.string().trim().min(1);
const action = MeetingActionV1Schema;
export const MeetingCommandV1Schema = z
    .object({
        protocolVersion: z.literal(1),
        meetingId: nonEmpty,
        expectedMeetingVersion: z.number().int().nonnegative().optional(),
        requestId: nonEmpty,
        action
    })
    .superRefine((value, ctx) => {
        if (
            value.action.kind === "create_meeting" &&
            (value.meetingId !== "new" || value.expectedMeetingVersion !== 0)
        )
            ctx.addIssue({
                code: "custom",
                path: [value.meetingId !== "new" ? "meetingId" : "expectedMeetingVersion"]
            });
        if (
            value.action.kind !== "create_meeting" &&
            value.action.kind !== "submit_review_batch" &&
            value.expectedMeetingVersion === undefined
        )
            ctx.addIssue({ code: "custom", path: ["expectedMeetingVersion"] });
        if (
            value.action.kind === "submit_review_batch" &&
            value.expectedMeetingVersion !== undefined
        )
            ctx.addIssue({ code: "custom", path: ["expectedMeetingVersion"] });
    });
export type MeetingCommandV1 = z.infer<typeof MeetingCommandV1Schema>;
export type MeetingActionV1 = z.infer<typeof MeetingActionV1Schema>;

export const ListMeetingsRequestSchema = z.object({ protocolVersion: z.literal(1) });
export type ListMeetingsRequest = z.infer<typeof ListMeetingsRequestSchema>;
export const ReadMeetingRequestV1Schema = z.object({
    protocolVersion: z.literal(1),
    meetingId: id
});
export type ReadMeetingRequestV1 = z.infer<typeof ReadMeetingRequestV1Schema>;

const effect = z.object({
    id,
    kind: z.enum([
        "refresh",
        "session_mail",
        "agent_notice",
        "review_delivery",
        "markdown_projection",
        "archive",
        "identity_provision"
    ]),
    status: z.literal("queued")
});
const error = z.object({
    code: z.enum([
        "INVALID_ARGUMENT",
        "MEETING_NOT_FOUND",
        "UNAUTHORIZED",
        "STALE_AUTHORIZATION",
        "IDEMPOTENCY_CONFLICT",
        "MEETING_TERMINAL",
        "VERSION_CONFLICT",
        "NOT_FOUND",
        "INVALID_STATE",
        "PRECONDITION_FAILED",
        "REVIEWER_CONFLICT",
        "ROUND_NOT_CLOSABLE",
        "LIMIT_EXCEEDED",
        "RECOVERY_UNAVAILABLE",
        "STORAGE_UNAVAILABLE",
        "INCOMPATIBLE_VERSION"
    ]),
    message: text,
    currentMeetingVersion: z.number().int().nonnegative().optional(),
    targetKind: text.optional(),
    targetId: id.optional()
});
export const MeetingCommandResultV1Schema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("accepted"),
        meetingId: id,
        committedVersion: z.number().int().nonnegative(),
        receiptId: id,
        factIds: z.array(id),
        relatedIds: z.array(id).optional(),
        effects: z.array(effect),
        identityDecision: z
            .object({
                recommendationId: id,
                decision: z.enum(["admit", "reject"]),
                status: z.enum(["provisioning", "rejected", "active", "failed"]),
                identityId: id.optional(),
                failureCode: z.string().optional()
            })
            .optional()
    }),
    z.object({ kind: z.literal("rejected"), error })
]);
export type MeetingCommandResultV1 = z.infer<typeof MeetingCommandResultV1Schema>;
