import type {
    EpochMs,
    ManagerPlanV1,
    MeetingState,
    OpaqueId,
    RiskLevel
} from "./meeting-state-v1.js";
import { validateMeetingStateV1 } from "./meeting-state-v1-validation.js";
import { z } from "zod";

export type TargetDomainActorV1 =
    { kind: "local_controller"; id: OpaqueId } | { kind: "identity"; id: OpaqueId };

export type TargetAgendaInputV1 = {
    id: OpaqueId;
    title: string;
    question: string;
    requiredOutputIds: readonly OpaqueId[];
    requiredReviewerIds: readonly OpaqueId[];
    ownerId?: OpaqueId;
};

export type TargetMeetingActionV1 =
    | { kind: "pause_meeting" | "resume_meeting"; reason: string }
    | {
          kind: "activate_agenda";
          agendaId: OpaqueId;
          previousDisposition: "completed" | "deferred" | "closed";
          reason: string;
      }
    | {
          kind: "raise_agenda_candidate";
          title: string;
          reason: string;
          sourceMessageId?: OpaqueId;
      }
    | {
          kind: "dispose_agenda_candidate";
          candidateId: OpaqueId;
          disposition: "promoted" | "parked" | "rejected";
          reason: string;
          promotedAgenda?: TargetAgendaInputV1;
      }
    | {
          kind: "record_question";
          agendaId: OpaqueId;
          text: string;
          affectedOutputIds: readonly OpaqueId[];
          affectedCriterionIds: readonly OpaqueId[];
          affectedConstraintIds: readonly OpaqueId[];
          blocking: boolean;
      }
    | {
          kind: "resolve_question";
          questionId: OpaqueId;
          status: "answered" | "withdrawn" | "deferred";
          rationale: string;
          evidenceIds: readonly OpaqueId[];
      }
    | {
          kind: "record_issue";
          agendaId: OpaqueId;
          description: string;
          riskLevel: RiskLevel;
          classification: "blocking" | "follow_up" | "pending_discussion" | "out_of_scope";
          affectedOutputIds: readonly OpaqueId[];
          affectedCriterionIds: readonly OpaqueId[];
          affectedConstraintIds: readonly OpaqueId[];
          requiredReviewerIds: readonly OpaqueId[];
          blocking: boolean;
          rationale: string;
      }
    | {
          kind: "dispose_issue";
          issueId: OpaqueId;
          status: "resolved" | "deferred" | "out_of_scope";
          rationale: string;
          evidenceIds: readonly OpaqueId[];
      }
    | {
          kind: "plan_next_step";
          agendaId: OpaqueId;
          planKind: ManagerPlanV1["kind"];
          rationale: string;
          blockingReason?: string;
      };

export type TargetDomainFactPayloadV1 =
    | { kind: "references"; relatedIds: readonly OpaqueId[] }
    | {
          kind: "question_disposition";
          questionId: OpaqueId;
          oldStatus: "open" | "deferred";
          newStatus: "answered" | "withdrawn" | "deferred";
          oldBlocking: boolean;
          newBlocking: boolean;
          rationale: string;
          evidenceIds: readonly OpaqueId[];
      }
    | {
          kind: "issue_disposition";
          issueId: OpaqueId;
          oldStatus: "open" | "deferred";
          newStatus: "resolved" | "deferred" | "out_of_scope";
          oldBlocking: boolean;
          newBlocking: boolean;
          rationale: string;
          evidenceIds: readonly OpaqueId[];
      };

export type TargetDomainFactV1 = {
    id: OpaqueId;
    kind: TargetMeetingActionV1["kind"];
    actorId: OpaqueId;
    occurredAt: EpochMs;
    relatedIds: readonly OpaqueId[];
    payload: TargetDomainFactPayloadV1;
};

export type TargetTransitionResultV1 =
    | { kind: "accepted"; state: MeetingState; facts: readonly [TargetDomainFactV1] }
    | {
          kind: "rejected";
          state: MeetingState;
          code:
              | "INVALID_ARGUMENT"
              | "UNAUTHORIZED"
              | "MEETING_TERMINAL"
              | "NOT_FOUND"
              | "INVALID_STATE"
              | "PRECONDITION_FAILED";
          facts: readonly [];
      };

type RejectionCode =
    | "INVALID_ARGUMENT"
    | "UNAUTHORIZED"
    | "MEETING_TERMINAL"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "PRECONDITION_FAILED";

const invalid = (state: MeetingState, code: RejectionCode): TargetTransitionResultV1 => ({
    kind: "rejected",
    state,
    code,
    facts: []
});

const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;
const validId = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;
const validTime = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nonEmptyIdArraySchema = z
    .array(z.string().refine((value) => value.trim().length > 0))
    .min(1)
    .superRefine((values, ctx) => {
        if (new Set(values).size !== values.length)
            ctx.addIssue({ code: "custom", message: "duplicate id" });
    });
const optionalDefined = (value: Record<string, unknown>, key: string) =>
    !Object.prototype.hasOwnProperty.call(value, key) || value[key] !== undefined;
const promotedAgendaSchema = z
    .object({
        id: z.string().refine((value) => value.trim().length > 0),
        title: z.string().refine((value) => value.trim().length > 0),
        question: z.string().refine((value) => value.trim().length > 0),
        requiredOutputIds: nonEmptyIdArraySchema,
        requiredReviewerIds: nonEmptyIdArraySchema,
        ownerId: z
            .string()
            .refine((value) => value.trim().length > 0)
            .optional()
    })
    .superRefine((value, ctx) => {
        if (!optionalDefined(value, "ownerId")) ctx.addIssue({ code: "custom", path: ["ownerId"] });
    });
const raiseActionSchema = z
    .object({
        kind: z.literal("raise_agenda_candidate"),
        title: z.string().refine((value) => value.trim().length > 0),
        reason: z.string().refine((value) => value.trim().length > 0),
        sourceMessageId: z
            .string()
            .refine((value) => value.trim().length > 0)
            .optional()
    })
    .superRefine((value, ctx) => {
        if (!optionalDefined(value, "sourceMessageId"))
            ctx.addIssue({ code: "custom", path: ["sourceMessageId"] });
    });
const disposeActionSchema = z
    .object({
        kind: z.literal("dispose_agenda_candidate"),
        candidateId: z.string().refine((value) => value.trim().length > 0),
        disposition: z.enum(["promoted", "parked", "rejected"]),
        reason: z.string().refine((value) => value.trim().length > 0),
        promotedAgenda: promotedAgendaSchema.optional()
    })
    .superRefine((value, ctx) => {
        if (!optionalDefined(value, "promotedAgenda"))
            ctx.addIssue({ code: "custom", path: ["promotedAgenda"] });
    });
const uniqueActionIds = z
    .array(z.string().refine((value) => value.trim().length > 0))
    .superRefine((values, ctx) => {
        if (new Set(values).size !== values.length)
            ctx.addIssue({ code: "custom", message: "duplicate id" });
    });
const recordQuestionSchema = z.object({
    kind: z.literal("record_question"),
    agendaId: z.string().refine((value) => value.trim().length > 0),
    text: z.string().refine((value) => value.trim().length > 0),
    affectedOutputIds: uniqueActionIds,
    affectedCriterionIds: uniqueActionIds,
    affectedConstraintIds: uniqueActionIds,
    blocking: z.boolean()
});
const resolveQuestionSchema = z.object({
    kind: z.literal("resolve_question"),
    questionId: z.string().refine((value) => value.trim().length > 0),
    status: z.enum(["answered", "withdrawn", "deferred"]),
    rationale: z.string().refine((value) => value.trim().length > 0),
    evidenceIds: uniqueActionIds.min(1)
});
const recordIssueSchema = z.object({
    kind: z.literal("record_issue"),
    agendaId: z.string().refine((value) => value.trim().length > 0),
    description: z.string().refine((value) => value.trim().length > 0),
    riskLevel: z.enum(["low", "medium", "high"]),
    classification: z.enum(["blocking", "follow_up", "pending_discussion", "out_of_scope"]),
    affectedOutputIds: uniqueActionIds,
    affectedCriterionIds: uniqueActionIds,
    affectedConstraintIds: uniqueActionIds,
    requiredReviewerIds: uniqueActionIds,
    blocking: z.boolean(),
    rationale: z.string().refine((value) => value.trim().length > 0)
});
const disposeIssueSchema = z.object({
    kind: z.literal("dispose_issue"),
    issueId: z.string().refine((value) => value.trim().length > 0),
    status: z.enum(["resolved", "deferred", "out_of_scope"]),
    rationale: z.string().refine((value) => value.trim().length > 0),
    evidenceIds: uniqueActionIds.min(1)
});
const planNextStepSchema = z
    .object({
        kind: z.literal("plan_next_step"),
        agendaId: z.string().refine((value) => value.trim().length > 0),
        planKind: z.enum([
            "open_round",
            "continue_agenda",
            "stop_agenda",
            "raise_agenda_candidate",
            "wait_for_required_identity"
        ]),
        rationale: z.string().refine((value) => value.trim().length > 0),
        blockingReason: z
            .string()
            .refine((value) => value.trim().length > 0)
            .optional()
    })
    .superRefine((value, ctx) => {
        if (!optionalDefined(value, "blockingReason"))
            ctx.addIssue({ code: "custom", path: ["blockingReason"] });
    });

export function transitionMeetingStateV1(
    state: MeetingState,
    action: TargetMeetingActionV1,
    actor: TargetDomainActorV1,
    now: EpochMs,
    factId: OpaqueId,
    _generatedId?: OpaqueId
): TargetTransitionResultV1 {
    if (
        validateMeetingStateV1(state).kind !== "valid" ||
        !record(action) ||
        !validId(factId) ||
        !validTime(now) ||
        !record(actor) ||
        !["local_controller", "identity"].includes(actor.kind as string) ||
        !validId(actor.id)
    )
        return invalid(state, "INVALID_ARGUMENT");
    const generatedId = _generatedId;
    const candidateId = generatedId as string;

    if (action.kind === "pause_meeting" || action.kind === "resume_meeting") {
        if (typeof action.reason !== "string" || action.reason.trim().length === 0)
            return invalid(state, "INVALID_ARGUMENT");
        if (actor.kind !== "local_controller") return invalid(state, "UNAUTHORIZED");
    } else if (action.kind === "activate_agenda") {
        if (
            !validId(action.agendaId) ||
            typeof action.reason !== "string" ||
            action.reason.trim().length === 0 ||
            !["completed", "deferred", "closed"].includes(action.previousDisposition)
        )
            return invalid(state, "INVALID_ARGUMENT");
        if (actor.kind !== "identity") return invalid(state, "UNAUTHORIZED");
        const captain = state.identities.find(
            (identity) => identity.id === actor.id && identity.roles.includes("captain")
        );
        if (!captain) return invalid(state, "UNAUTHORIZED");
    } else if (action.kind === "raise_agenda_candidate") {
        if (!raiseActionSchema.safeParse(action).success || !validId(generatedId))
            return invalid(state, "INVALID_ARGUMENT");
        if (
            actor.kind !== "identity" ||
            !state.identities.some((identity) => identity.id === actor.id)
        )
            return invalid(state, "UNAUTHORIZED");
    } else if (action.kind === "dispose_agenda_candidate") {
        if (!disposeActionSchema.safeParse(action).success)
            return invalid(state, "INVALID_ARGUMENT");
        if (
            actor.kind !== "identity" ||
            !state.identities.some(
                (identity) => identity.id === actor.id && identity.roles.includes("captain")
            )
        )
            return invalid(state, "UNAUTHORIZED");
    } else if (action.kind === "record_question") {
        if (!recordQuestionSchema.safeParse(action).success || !validId(generatedId))
            return invalid(state, "INVALID_ARGUMENT");
        if (
            actor.kind !== "identity" ||
            !state.identities.some((identity) => identity.id === actor.id)
        )
            return invalid(state, "UNAUTHORIZED");
    } else if (action.kind === "resolve_question") {
        if (!resolveQuestionSchema.safeParse(action).success)
            return invalid(state, "INVALID_ARGUMENT");
        if (
            actor.kind !== "identity" ||
            !state.identities.some(
                (identity) => identity.id === actor.id && identity.roles.includes("captain")
            )
        )
            return invalid(state, "UNAUTHORIZED");
    } else if (action.kind === "record_issue") {
        if (!recordIssueSchema.safeParse(action).success || !validId(generatedId))
            return invalid(state, "INVALID_ARGUMENT");
        if (
            actor.kind !== "identity" ||
            !state.identities.some((identity) => identity.id === actor.id)
        )
            return invalid(state, "UNAUTHORIZED");
    } else if (action.kind === "dispose_issue") {
        if (!disposeIssueSchema.safeParse(action).success)
            return invalid(state, "INVALID_ARGUMENT");
        if (
            actor.kind !== "identity" ||
            !state.identities.some(
                (identity) => identity.id === actor.id && identity.roles.includes("captain")
            )
        )
            return invalid(state, "UNAUTHORIZED");
    } else if (action.kind === "plan_next_step") {
        if (!planNextStepSchema.safeParse(action).success || !validId(generatedId))
            return invalid(state, "INVALID_ARGUMENT");
        if (
            actor.kind !== "identity" ||
            !state.identities.some(
                (identity) => identity.id === actor.id && identity.roles.includes("manager")
            )
        )
            return invalid(state, "UNAUTHORIZED");
    } else return invalid(state, "INVALID_ARGUMENT");
    if (["terminal", "archiving", "archived"].includes(state.lifecycle.status))
        return invalid(state, "MEETING_TERMINAL");

    let nextStatus: MeetingState["lifecycle"]["status"] = state.lifecycle.status;
    let relatedIds: readonly OpaqueId[] = [];
    let nextAgenda = state.agenda;
    let nextCandidates = state.agendaCandidates;
    let nextIdentities = state.identities;
    let nextQuestions = state.questions;
    let nextIssues = state.issues;
    let nextPlans = state.managerPlans;
    let nextLifecycle = state.lifecycle;
    let factPayload: TargetDomainFactPayloadV1 | undefined;
    if (action.kind === "pause_meeting" || action.kind === "resume_meeting") {
        const expected = action.kind === "pause_meeting" ? "running" : "paused";
        nextStatus = action.kind === "pause_meeting" ? "paused" : "running";
        if (state.lifecycle.status !== expected) return invalid(state, "INVALID_STATE");
        relatedIds = [state.id];
    } else if (action.kind === "activate_agenda") {
        if (state.lifecycle.status !== "running") return invalid(state, "INVALID_STATE");
        const agendaAction = action as Extract<TargetMeetingActionV1, { kind: "activate_agenda" }>;
        const target = state.agenda.find((agenda) => agenda.id === agendaAction.agendaId);
        if (!target) return invalid(state, "NOT_FOUND");
        const oldIndex = state.agenda.findIndex((agenda) => agenda.status === "active");
        const old = oldIndex < 0 ? undefined : state.agenda[oldIndex];
        if (!old || target.status !== "pending") return invalid(state, "INVALID_STATE");
        if (target.id === old.id) return invalid(state, "PRECONDITION_FAILED");
        if (state.rounds.some((round) => round.agendaId === old.id && round.status === "open"))
            return invalid(state, "PRECONDITION_FAILED");
        nextStatus = "running";
        relatedIds = [state.id, old.id, target.id];
        nextAgenda = state.agenda.map((agenda) =>
            agenda.id === old.id
                ? { ...agenda, status: agendaAction.previousDisposition }
                : agenda.id === target.id
                  ? { ...agenda, status: "active" }
                  : agenda
        );
    } else if (action.kind === "raise_agenda_candidate") {
        if (state.agendaCandidates.some((candidate) => candidate.id === candidateId))
            return invalid(state, "PRECONDITION_FAILED");
        if (
            action.sourceMessageId !== undefined &&
            !state.messages.some((message) => message.id === action.sourceMessageId)
        )
            return invalid(state, "NOT_FOUND");
        nextCandidates = [
            ...state.agendaCandidates,
            {
                id: candidateId,
                title: action.title,
                reason: action.reason,
                ...(action.sourceMessageId === undefined
                    ? {}
                    : { sourceMessageId: action.sourceMessageId }),
                status: "pending" as const
            }
        ];
        relatedIds = [state.id, candidateId];
    } else if (action.kind === "dispose_agenda_candidate") {
        const candidate = state.agendaCandidates.find((item) => item.id === action.candidateId);
        if (!candidate) return invalid(state, "NOT_FOUND");
        if (candidate.status !== "pending") return invalid(state, "INVALID_STATE");
        if (action.disposition !== "promoted" && action.promotedAgenda !== undefined)
            return invalid(state, "PRECONDITION_FAILED");
        if (action.disposition === "promoted") {
            const promoted = action.promotedAgenda;
            if (!promoted) return invalid(state, "PRECONDITION_FAILED");
            if (state.agenda.some((agenda) => agenda.id === promoted.id))
                return invalid(state, "PRECONDITION_FAILED");
            const outputIds = new Set(state.objective.requiredOutputs.map((item) => item.id));
            if (promoted.requiredOutputIds.some((id) => !outputIds.has(id)))
                return invalid(state, "NOT_FOUND");
            if (
                promoted.ownerId !== undefined &&
                !state.identities.some((identity) => identity.id === promoted.ownerId)
            )
                return invalid(state, "NOT_FOUND");
            for (const reviewerId of promoted.requiredReviewerIds) {
                const reviewer = state.identities.find((identity) => identity.id === reviewerId);
                if (!reviewer) return invalid(state, "NOT_FOUND");
                if (!reviewer.roles.includes("evidence_reviewer"))
                    return invalid(state, "PRECONDITION_FAILED");
                if (reviewer.reviewResponsibilityIds.includes(promoted.id))
                    return invalid(state, "PRECONDITION_FAILED");
            }
            nextAgenda = [...state.agenda, { ...promoted, status: "pending" as const }];
            nextIdentities = state.identities.map((identity) =>
                promoted.requiredReviewerIds.includes(identity.id)
                    ? {
                          ...identity,
                          reviewResponsibilityIds: [
                              ...identity.reviewResponsibilityIds,
                              promoted.id
                          ]
                      }
                    : identity
            );
            relatedIds = [
                state.id,
                action.candidateId,
                promoted.id,
                ...promoted.requiredReviewerIds
            ];
        } else relatedIds = [state.id, action.candidateId];
        nextCandidates = state.agendaCandidates.map((item) =>
            item.id === action.candidateId ? { ...item, status: action.disposition } : item
        );
    } else if (action.kind === "record_question") {
        if (!state.agenda.some((agenda) => agenda.id === action.agendaId))
            return invalid(state, "NOT_FOUND");
        if (state.questions.some((question) => question.id === candidateId))
            return invalid(state, "PRECONDITION_FAILED");
        const outputIds = new Set(state.objective.requiredOutputs.map((item) => item.id));
        const criterionIds = new Set(state.objective.acceptanceCriteria.map((item) => item.id));
        const constraintIds = new Set(state.objective.hardConstraints.map((item) => item.id));
        if (
            action.affectedOutputIds.some((id) => !outputIds.has(id)) ||
            action.affectedCriterionIds.some((id) => !criterionIds.has(id)) ||
            action.affectedConstraintIds.some((id) => !constraintIds.has(id))
        )
            return invalid(state, "NOT_FOUND");
        const affected = [
            ...action.affectedOutputIds,
            ...action.affectedCriterionIds,
            ...action.affectedConstraintIds
        ];
        if (
            action.blocking &&
            !affected.some((id) =>
                [
                    ...state.objective.requiredOutputs,
                    ...state.objective.acceptanceCriteria,
                    ...state.objective.hardConstraints
                ].some((target) => target.id === id && target.status !== "satisfied")
            )
        )
            return invalid(state, "PRECONDITION_FAILED");
        nextQuestions = [
            ...state.questions,
            {
                id: candidateId,
                actorId: actor.id,
                agendaId: action.agendaId,
                text: action.text,
                affectedOutputIds: action.affectedOutputIds,
                affectedCriterionIds: action.affectedCriterionIds,
                affectedConstraintIds: action.affectedConstraintIds,
                blocking: action.blocking,
                status: "open"
            }
        ];
        relatedIds = [state.id, candidateId];
    } else if (action.kind === "resolve_question") {
        const question = state.questions.find((item) => item.id === action.questionId);
        if (!question) return invalid(state, "NOT_FOUND");
        if (question.status !== "open" && question.status !== "deferred")
            return invalid(state, "INVALID_STATE");
        const versions = new Set(
            state.evidencePackages.flatMap((pack) => pack.versions.map((version) => version.id))
        );
        const published = new Set(
            state.publications.flatMap((publication) => publication.finalVersionIds)
        );
        if (action.evidenceIds.some((id) => !versions.has(id))) return invalid(state, "NOT_FOUND");
        if (action.evidenceIds.some((id) => !published.has(id)))
            return invalid(state, "PRECONDITION_FAILED");
        const newBlocking = action.status === "deferred" ? question.blocking : false;
        nextQuestions = state.questions.map((item) =>
            item.id === question.id
                ? { ...item, status: action.status, blocking: newBlocking }
                : item
        );
        relatedIds = [state.id, action.questionId, ...action.evidenceIds];
        factPayload = {
            kind: "question_disposition" as const,
            questionId: question.id,
            oldStatus: question.status as "open" | "deferred",
            newStatus: action.status,
            oldBlocking: question.blocking,
            newBlocking,
            rationale: action.rationale,
            evidenceIds: action.evidenceIds
        };
    } else if (action.kind === "record_issue") {
        const agenda = state.agenda.find((item) => item.id === action.agendaId);
        if (!agenda) return invalid(state, "NOT_FOUND");
        if (state.issues.some((issue) => issue.id === candidateId))
            return invalid(state, "PRECONDITION_FAILED");
        const outputIds = new Set(state.objective.requiredOutputs.map((item) => item.id));
        const criterionIds = new Set(state.objective.acceptanceCriteria.map((item) => item.id));
        const constraintIds = new Set(state.objective.hardConstraints.map((item) => item.id));
        if (
            action.affectedOutputIds.some((id) => !outputIds.has(id)) ||
            action.affectedCriterionIds.some((id) => !criterionIds.has(id)) ||
            action.affectedConstraintIds.some((id) => !constraintIds.has(id)) ||
            action.requiredReviewerIds.some((id) => !agenda.requiredReviewerIds.includes(id))
        )
            return invalid(state, "NOT_FOUND");
        const affected = [
            ...action.affectedOutputIds,
            ...action.affectedCriterionIds,
            ...action.affectedConstraintIds
        ];
        const qualifies =
            action.riskLevel === "high" ||
            affected.some((id) =>
                [
                    ...state.objective.requiredOutputs,
                    ...state.objective.acceptanceCriteria,
                    ...state.objective.hardConstraints
                ].some((target) => target.id === id && target.status !== "satisfied")
            ) ||
            action.requiredReviewerIds.length > 0;
        if (
            (action.classification === "blocking") !== action.blocking ||
            (action.riskLevel === "high" && !action.blocking) ||
            (action.blocking && !qualifies)
        )
            return invalid(state, "PRECONDITION_FAILED");
        nextIssues = [
            ...state.issues,
            {
                id: candidateId,
                agendaId: action.agendaId,
                description: action.description,
                riskLevel: action.riskLevel,
                classification: action.classification,
                affectedOutputIds: action.affectedOutputIds,
                affectedCriterionIds: action.affectedCriterionIds,
                affectedConstraintIds: action.affectedConstraintIds,
                requiredReviewerIds: action.requiredReviewerIds,
                blocking: action.blocking,
                status: "open" as const,
                rationale: action.rationale
            }
        ];
        relatedIds = [state.id, candidateId];
    } else if (action.kind === "dispose_issue") {
        const issue = state.issues.find((item) => item.id === action.issueId);
        if (!issue) return invalid(state, "NOT_FOUND");
        if (issue.status !== "open" && issue.status !== "deferred")
            return invalid(state, "INVALID_STATE");
        const versions = new Set(
            state.evidencePackages.flatMap((pack) => pack.versions.map((version) => version.id))
        );
        const published = new Set(
            state.publications.flatMap((publication) => publication.finalVersionIds)
        );
        if (action.evidenceIds.some((id) => !versions.has(id))) return invalid(state, "NOT_FOUND");
        if (action.evidenceIds.some((id) => !published.has(id)))
            return invalid(state, "PRECONDITION_FAILED");
        const newBlocking = action.status === "deferred" ? issue.blocking : false;
        nextIssues = state.issues.map((item) =>
            item.id === issue.id ? { ...item, status: action.status, blocking: newBlocking } : item
        );
        relatedIds = [state.id, action.issueId, ...action.evidenceIds];
        factPayload = {
            kind: "issue_disposition",
            issueId: issue.id,
            oldStatus: issue.status as "open" | "deferred",
            newStatus: action.status,
            oldBlocking: issue.blocking,
            newBlocking,
            rationale: action.rationale,
            evidenceIds: action.evidenceIds
        };
    } else if (action.kind === "plan_next_step") {
        if (!state.agenda.some((agenda) => agenda.id === action.agendaId))
            return invalid(state, "NOT_FOUND");
        if (state.rounds.some((round) => round.status === "open"))
            return invalid(state, "PRECONDITION_FAILED");
        const oldPlan = state.managerPlans.find(
            (plan) => plan.agendaId === action.agendaId && plan.status === "active"
        );
        nextPlans = [
            ...state.managerPlans.map((plan) =>
                plan.agendaId === action.agendaId && plan.status === "active"
                    ? { ...plan, status: "superseded" as const }
                    : plan
            ),
            {
                id: candidateId,
                agendaId: action.agendaId,
                managerId: actor.id,
                kind: action.planKind,
                rationale: action.rationale,
                ...(action.blockingReason === undefined
                    ? {}
                    : { blockingReason: action.blockingReason }),
                createdAt: now,
                status: "active" as const
            }
        ];
        relatedIds = [state.id, candidateId, action.agendaId, ...(oldPlan ? [oldPlan.id] : [])];
    }

    if (action.kind === "pause_meeting" || action.kind === "resume_meeting")
        nextLifecycle = {
            ...state.lifecycle,
            status: nextStatus,
            changedAt: now,
            changedBy: actor.id,
            reason: action.reason
        };

    const nextState: MeetingState = {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        agenda: nextAgenda,
        agendaCandidates: nextCandidates,
        identities: nextIdentities,
        questions: nextQuestions,
        issues: nextIssues,
        managerPlans: nextPlans,
        lifecycle: nextLifecycle
    };
    if (validateMeetingStateV1(nextState).kind !== "valid")
        return invalid(state, "PRECONDITION_FAILED");
    return {
        kind: "accepted",
        state: nextState,
        facts: [
            {
                id: factId,
                kind: action.kind,
                actorId: actor.id,
                occurredAt: now,
                relatedIds,
                payload: factPayload ?? { kind: "references", relatedIds }
            }
        ]
    };
}
