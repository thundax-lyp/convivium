import { z } from "zod";
import { validateMeetingStateV1, type MeetingState } from "@/domain/index.js";
import {
    RecommendIdentityActionV1Schema,
    RecordIdentityAdmissionResultActionV1Schema
} from "./meeting-identity-v1.js";

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
const createMeeting = z.object({
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
const actions = [
    createMeeting,
    RecommendIdentityActionV1Schema,
    RecordIdentityAdmissionResultActionV1Schema,
    z.object({ kind: z.literal("open_round"), agendaId: id, deadlineAt: epoch.optional() }),
    z.object({ kind: z.literal("raise_hand"), roundId: id, purpose: text }),
    z.object({
        kind: z.literal("dispose_hand_raise"),
        roundId: id,
        contributorId: id,
        disposition: z.enum(["accepted", "rejected", "deferred"]),
        reason: text
    }),
    z.object({ kind: z.literal("submit_evidence"), contributionId: id, evidence }),
    z
        .object({
            kind: z.literal("submit_review_batch"),
            reviews: z
                .array(z.object({ versionId: id, dimensions: reviewDimensions, scope: text }))
                .min(1)
        })
        .superRefine((value, ctx) => {
            const ids = value.reviews.map((review) => review.versionId);
            if (new Set(ids).size !== ids.length)
                ctx.addIssue({ code: "custom", path: ["reviews"] });
        }),
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
    z.object({ kind: z.literal("publish_round"), roundId: id }),
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
export const MeetingCommandV1Schema = z.object({
    protocolVersion: z.literal(1),
    meetingId: nonEmpty,
    expectedMeetingVersion: z.number().int().nonnegative(),
    requestId: nonEmpty,
    action
});
export type MeetingCommandV1 = z.infer<typeof MeetingCommandV1Schema>;
export type MeetingActionV1 = z.infer<typeof MeetingActionV1Schema>;

export const ListMeetingsRequestV1Schema = z.object({ protocolVersion: z.literal(1) });
export type ListMeetingsRequestV1 = z.infer<typeof ListMeetingsRequestV1Schema>;
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

const targetMeetingStateFields = [
    "id",
    "version",
    "createdAt",
    "updatedAt",
    "objective",
    "lifecycle",
    "identities",
    "identityRecommendations",
    "agenda",
    "agendaCandidates",
    "rounds",
    "opportunityRequests",
    "pendingHandRaises",
    "contributions",
    "evidenceReviewerId",
    "completionDeclarations",
    "evidencePackages",
    "registrations",
    "reviews",
    "reviewDeliveries",
    "publications",
    "messages",
    "proposals",
    "positions",
    "decisionCandidates",
    "decisions",
    "questions",
    "issues",
    "riskDispositions",
    "tasks",
    "managerPlans",
    "privateMails",
    "completionFacts",
    "limits"
] as const;

function isTargetMeetingState(value: unknown): value is MeetingState {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return targetMeetingStateFields.every((field) =>
        Object.prototype.hasOwnProperty.call(value, field)
    );
}

export function encodeMeetingStateV1(state: unknown): Uint8Array {
    if (!isTargetMeetingState(state) || validateMeetingStateV1(state).kind !== "valid")
        throw new Error("INCOMPATIBLE_VERSION");
    return new TextEncoder().encode(JSON.stringify(state));
}

export function decodeMeetingStateV1(bytes: Uint8Array): MeetingState {
    try {
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!isTargetMeetingState(value) || validateMeetingStateV1(value).kind !== "valid")
            throw new Error("INCOMPATIBLE_VERSION");
        return value;
    } catch (error) {
        if (error instanceof Error && error.message === "INCOMPATIBLE_VERSION") throw error;
        throw new Error("INCOMPATIBLE_VERSION", { cause: error });
    }
}
