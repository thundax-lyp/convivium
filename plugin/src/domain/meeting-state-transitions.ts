import type {
    EpochMs,
    ManagerPlan,
    MeetingRole,
    MeetingState,
    OpaqueId,
    RiskLevel,
    RoundGoal,
    TargetDomainFactPayload
} from "./meeting-state.js";
export type { TargetDomainFactPayload } from "./meeting-state.js";
import { validateMeetingState } from "./meeting-state-validation.js";
import { z } from "zod";
import { recalculateMeetingCompletion } from "@/domain/transitions/outcome.js";

export type TargetDomainActor =
    { kind: "captain_user"; id: OpaqueId } | { kind: "identity"; id: OpaqueId };

export type TargetAgendaInput = {
    id: OpaqueId;
    title: string;
    question: string;
    requiredOutputIds: readonly OpaqueId[];
    ownerId?: OpaqueId;
};

export type TargetMeetingAction =
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
          promotedAgenda?: TargetAgendaInput;
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
          requiresEvidenceReview: boolean;
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
          planKind: ManagerPlan["kind"];
          roundGoal?: RoundGoal;
          rationale: string;
          blockingReason?: string;
      };

export type TargetDomainFact = {
    id: OpaqueId;
    kind: TargetMeetingAction["kind"];
    actorId: OpaqueId;
    occurredAt: EpochMs;
    relatedIds: readonly OpaqueId[];
    payload: TargetDomainFactPayload;
};

export type TargetTransitionResult =
    | { kind: "accepted"; state: MeetingState; facts: readonly [TargetDomainFact] }
    | {
          kind: "rejected";
          state: MeetingState;
          code:
              | "INVALID_ARGUMENT"
              | "UNAUTHORIZED"
              | "MEETING_TERMINAL"
              | "NOT_FOUND"
              | "INVALID_STATE"
              | "LIMIT_EXCEEDED"
              | "PRECONDITION_FAILED";
          facts: readonly [];
      };

type RejectionCode =
    | "INVALID_ARGUMENT"
    | "UNAUTHORIZED"
    | "MEETING_TERMINAL"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "LIMIT_EXCEEDED"
    | "PRECONDITION_FAILED";

const invalid = (state: MeetingState, code: RejectionCode): TargetTransitionResult => ({
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
    requiresEvidenceReview: z.boolean(),
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
        roundGoal: z
            .object({
                question: z.string().refine((value) => value.trim().length > 0),
                evidenceGap: z.string().refine((value) => value.trim().length > 0),
                expectedOutput: z.string().refine((value) => value.trim().length > 0)
            })
            .optional(),
        rationale: z.string().refine((value) => value.trim().length > 0),
        blockingReason: z
            .string()
            .refine((value) => value.trim().length > 0)
            .optional()
    })
    .superRefine((value, ctx) => {
        if (!optionalDefined(value, "blockingReason"))
            ctx.addIssue({ code: "custom", path: ["blockingReason"] });
        if ((value.planKind === "open_round") !== (value.roundGoal !== undefined))
            ctx.addIssue({ code: "custom", path: ["roundGoal"] });
    });

type TransitionChanges = {
    agenda?: MeetingState["agenda"];
    agendaCandidates?: MeetingState["agendaCandidates"];
    questions?: MeetingState["questions"];
    issues?: MeetingState["issues"];
    managerPlans?: MeetingState["managerPlans"];
    lifecycle?: MeetingState["lifecycle"];
    evidencePackages?: MeetingState["evidencePackages"];
    reviewClaims?: MeetingState["reviewClaims"];
    relatedIds: readonly OpaqueId[];
    payload?: TargetDomainFactPayload;
    recalculateCompletion?: boolean;
};

type TransitionContext = {
    state: MeetingState;
    actor: TargetDomainActor;
    now: EpochMs;
    factId: OpaqueId;
};

const completeTransition = (
    context: TransitionContext,
    action: TargetMeetingAction,
    changes: TransitionChanges
): TargetTransitionResult => {
    const { state, actor, now, factId } = context;
    let nextState: MeetingState = {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        ...(changes.agenda === undefined ? {} : { agenda: changes.agenda }),
        ...(changes.agendaCandidates === undefined
            ? {}
            : { agendaCandidates: changes.agendaCandidates }),
        ...(changes.questions === undefined ? {} : { questions: changes.questions }),
        ...(changes.issues === undefined ? {} : { issues: changes.issues }),
        ...(changes.managerPlans === undefined ? {} : { managerPlans: changes.managerPlans }),
        ...(changes.lifecycle === undefined ? {} : { lifecycle: changes.lifecycle }),
        ...(changes.evidencePackages === undefined
            ? {}
            : { evidencePackages: changes.evidencePackages }),
        ...(changes.reviewClaims === undefined ? {} : { reviewClaims: changes.reviewClaims })
    };
    if (changes.recalculateCompletion)
        nextState = recalculateMeetingCompletion(nextState, actor.id, now);
    if (validateMeetingState(nextState).kind !== "valid")
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
                relatedIds: changes.relatedIds,
                payload: changes.payload ?? {
                    kind: "references",
                    relatedIds: changes.relatedIds
                }
            }
        ]
    };
};

const hasRole = (state: MeetingState, actorId: OpaqueId, role: MeetingRole): boolean => {
    return state.identities.some(
        (identity) => identity.id === actorId && identity.roles.includes(role)
    );
};

const validateActionRequest = (
    state: MeetingState,
    action: TargetMeetingAction,
    actor: TargetDomainActor,
    generatedId?: OpaqueId
): RejectionCode | undefined => {
    if (action.kind === "pause_meeting" || action.kind === "resume_meeting") {
        if (typeof action.reason !== "string" || action.reason.trim().length === 0)
            return "INVALID_ARGUMENT";
        return actor.kind === "captain_user" ? undefined : "UNAUTHORIZED";
    }
    if (action.kind === "activate_agenda") {
        if (
            !validId(action.agendaId) ||
            typeof action.reason !== "string" ||
            action.reason.trim().length === 0 ||
            !["completed", "deferred", "closed"].includes(action.previousDisposition)
        )
            return "INVALID_ARGUMENT";
        return actor.kind === "captain_user" ? undefined : "UNAUTHORIZED";
    }
    const requiresGeneratedId = [
        "raise_agenda_candidate",
        "record_question",
        "record_issue",
        "plan_next_step"
    ].includes(action.kind);
    const schemas = {
        raise_agenda_candidate: raiseActionSchema,
        dispose_agenda_candidate: disposeActionSchema,
        record_question: recordQuestionSchema,
        resolve_question: resolveQuestionSchema,
        record_issue: recordIssueSchema,
        dispose_issue: disposeIssueSchema,
        plan_next_step: planNextStepSchema
    } as const;
    if (!(action.kind in schemas)) return "INVALID_ARGUMENT";
    const schema = schemas[action.kind as keyof typeof schemas];
    if (!schema.safeParse(action).success || (requiresGeneratedId && !validId(generatedId)))
        return "INVALID_ARGUMENT";
    const captainActions: readonly TargetMeetingAction["kind"][] = [
        "dispose_agenda_candidate",
        "resolve_question",
        "dispose_issue"
    ];
    if (captainActions.includes(action.kind))
        return actor.kind === "captain_user" ? undefined : "UNAUTHORIZED";
    if (actor.kind !== "identity" || !state.identities.some((identity) => identity.id === actor.id))
        return "UNAUTHORIZED";
    if (action.kind === "plan_next_step" && !hasRole(state, actor.id, "manager"))
        return "UNAUTHORIZED";
    return undefined;
};

const transitionMeetingControl = (
    context: TransitionContext,
    action: Extract<
        TargetMeetingAction,
        { kind: "pause_meeting" | "resume_meeting" | "activate_agenda" }
    >
): TargetTransitionResult => {
    const { state, actor, now } = context;
    if (action.kind !== "activate_agenda") {
        const expected = action.kind === "pause_meeting" ? "running" : "paused";
        const nextStatus = action.kind === "pause_meeting" ? "paused" : "running";
        if (state.lifecycle.status !== expected) return invalid(state, "INVALID_STATE");
        if (
            action.kind === "resume_meeting" &&
            state.lifecycle.reason === "message budget exhausted"
        )
            return invalid(state, "LIMIT_EXCEEDED");
        return completeTransition(context, action, {
            lifecycle: {
                ...state.lifecycle,
                status: nextStatus,
                changedAt: now,
                changedBy: actor.id,
                reason: action.reason
            },
            ...(action.kind === "pause_meeting"
                ? {
                      evidencePackages: state.evidencePackages.map((pkg) => ({
                          ...pkg,
                          versions: pkg.versions.map((version) =>
                              ["submitted", "validating"].includes(version.status)
                                  ? { ...version, status: "validation_cancelled" as const }
                                  : version
                          )
                      })),
                      reviewClaims: []
                  }
                : {}),
            relatedIds: [state.id]
        });
    }
    if (state.lifecycle.status !== "running") return invalid(state, "INVALID_STATE");
    const target = state.agenda.find((agenda) => agenda.id === action.agendaId);
    if (!target) return invalid(state, "NOT_FOUND");
    const old = state.agenda.find((agenda) => agenda.status === "active");
    if (!old || target.status !== "pending") return invalid(state, "INVALID_STATE");
    if (target.id === old.id) return invalid(state, "PRECONDITION_FAILED");
    if (state.rounds.some((round) => round.agendaId === old.id && round.status === "open"))
        return invalid(state, "PRECONDITION_FAILED");
    return completeTransition(context, action, {
        agenda: state.agenda.map((agenda) =>
            agenda.id === old.id
                ? { ...agenda, status: action.previousDisposition }
                : agenda.id === target.id
                  ? { ...agenda, status: "active" }
                  : agenda
        ),
        relatedIds: [state.id, old.id, target.id]
    });
};

const transitionAgendaCandidate = (
    context: TransitionContext,
    action: Extract<
        TargetMeetingAction,
        { kind: "raise_agenda_candidate" | "dispose_agenda_candidate" }
    >,
    generatedId: OpaqueId
): TargetTransitionResult => {
    const { state } = context;
    if (action.kind === "raise_agenda_candidate") {
        if (state.agendaCandidates.some((candidate) => candidate.id === generatedId))
            return invalid(state, "PRECONDITION_FAILED");
        if (
            action.sourceMessageId !== undefined &&
            !state.messages.some((message) => message.id === action.sourceMessageId)
        )
            return invalid(state, "NOT_FOUND");
        return completeTransition(context, action, {
            agendaCandidates: [
                ...state.agendaCandidates,
                {
                    id: generatedId,
                    title: action.title,
                    reason: action.reason,
                    ...(action.sourceMessageId === undefined
                        ? {}
                        : { sourceMessageId: action.sourceMessageId }),
                    status: "pending"
                }
            ],
            relatedIds: [state.id, generatedId]
        });
    }
    const candidate = state.agendaCandidates.find((item) => item.id === action.candidateId);
    if (!candidate) return invalid(state, "NOT_FOUND");
    if (candidate.status !== "pending") return invalid(state, "INVALID_STATE");
    if (action.disposition !== "promoted" && action.promotedAgenda !== undefined)
        return invalid(state, "PRECONDITION_FAILED");
    let agenda = state.agenda;
    const relatedIds: OpaqueId[] = [state.id, action.candidateId];
    if (action.disposition === "promoted") {
        const promoted = action.promotedAgenda;
        if (!promoted) return invalid(state, "PRECONDITION_FAILED");
        if (state.agenda.some((item) => item.id === promoted.id))
            return invalid(state, "PRECONDITION_FAILED");
        const outputIds = new Set(state.objective.requiredOutputs.map((item) => item.id));
        if (promoted.requiredOutputIds.some((id) => !outputIds.has(id)))
            return invalid(state, "NOT_FOUND");
        if (
            promoted.ownerId !== undefined &&
            !state.identities.some((identity) => identity.id === promoted.ownerId)
        )
            return invalid(state, "NOT_FOUND");
        agenda = [...state.agenda, { ...promoted, status: "pending" }];
        relatedIds.push(promoted.id);
    }
    return completeTransition(context, action, {
        agenda,
        agendaCandidates: state.agendaCandidates.map((item) =>
            item.id === action.candidateId ? { ...item, status: action.disposition } : item
        ),
        relatedIds
    });
};

const affectedObjectiveExists = (
    state: MeetingState,
    action: {
        affectedOutputIds: readonly OpaqueId[];
        affectedCriterionIds: readonly OpaqueId[];
        affectedConstraintIds: readonly OpaqueId[];
    }
): boolean => {
    const outputIds = new Set(state.objective.requiredOutputs.map((item) => item.id));
    const criterionIds = new Set(state.objective.acceptanceCriteria.map((item) => item.id));
    const constraintIds = new Set(state.objective.hardConstraints.map((item) => item.id));
    return (
        action.affectedOutputIds.every((id) => outputIds.has(id)) &&
        action.affectedCriterionIds.every((id) => criterionIds.has(id)) &&
        action.affectedConstraintIds.every((id) => constraintIds.has(id))
    );
};

const hasUnsatisfiedAffectedObjective = (
    state: MeetingState,
    action: {
        affectedOutputIds: readonly OpaqueId[];
        affectedCriterionIds: readonly OpaqueId[];
        affectedConstraintIds: readonly OpaqueId[];
    }
): boolean => {
    const affected = new Set([
        ...action.affectedOutputIds,
        ...action.affectedCriterionIds,
        ...action.affectedConstraintIds
    ]);
    return [
        ...state.objective.requiredOutputs,
        ...state.objective.acceptanceCriteria,
        ...state.objective.hardConstraints
    ].some((target) => affected.has(target.id) && target.status !== "satisfied");
};

const transitionQuestion = (
    context: TransitionContext,
    action: Extract<TargetMeetingAction, { kind: "record_question" | "resolve_question" }>,
    generatedId: OpaqueId
): TargetTransitionResult => {
    const { state, actor } = context;
    if (action.kind === "record_question") {
        if (!state.agenda.some((agenda) => agenda.id === action.agendaId))
            return invalid(state, "NOT_FOUND");
        if (state.questions.some((question) => question.id === generatedId))
            return invalid(state, "PRECONDITION_FAILED");
        if (!affectedObjectiveExists(state, action)) return invalid(state, "NOT_FOUND");
        if (action.blocking && !hasUnsatisfiedAffectedObjective(state, action))
            return invalid(state, "PRECONDITION_FAILED");
        return completeTransition(context, action, {
            questions: [
                ...state.questions,
                {
                    id: generatedId,
                    actorId: actor.id,
                    agendaId: action.agendaId,
                    text: action.text,
                    affectedOutputIds: action.affectedOutputIds,
                    affectedCriterionIds: action.affectedCriterionIds,
                    affectedConstraintIds: action.affectedConstraintIds,
                    blocking: action.blocking,
                    status: "open"
                }
            ],
            relatedIds: [state.id, generatedId]
        });
    }
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
    return completeTransition(context, action, {
        questions: state.questions.map((item) =>
            item.id === question.id
                ? { ...item, status: action.status, blocking: newBlocking }
                : item
        ),
        relatedIds: [state.id, action.questionId, ...action.evidenceIds],
        payload: {
            kind: "question_disposition",
            questionId: question.id,
            oldStatus: question.status as "open" | "deferred",
            newStatus: action.status,
            oldBlocking: question.blocking,
            newBlocking,
            rationale: action.rationale,
            evidenceIds: action.evidenceIds
        }
    });
};

const transitionIssue = (
    context: TransitionContext,
    action: Extract<TargetMeetingAction, { kind: "record_issue" | "dispose_issue" }>,
    generatedId: OpaqueId
): TargetTransitionResult => {
    const { state, actor } = context;
    if (action.kind === "record_issue") {
        if (!state.agenda.some((item) => item.id === action.agendaId))
            return invalid(state, "NOT_FOUND");
        if (state.issues.some((issue) => issue.id === generatedId))
            return invalid(state, "PRECONDITION_FAILED");
        if (!affectedObjectiveExists(state, action)) return invalid(state, "NOT_FOUND");
        const qualifies =
            action.riskLevel === "high" ||
            hasUnsatisfiedAffectedObjective(state, action) ||
            action.requiresEvidenceReview;
        if (
            (action.classification === "blocking") !== action.blocking ||
            (action.riskLevel === "high" && !action.blocking) ||
            (action.blocking && !qualifies)
        )
            return invalid(state, "PRECONDITION_FAILED");
        return completeTransition(context, action, {
            issues: [
                ...state.issues,
                {
                    id: generatedId,
                    actorId: actor.id,
                    agendaId: action.agendaId,
                    description: action.description,
                    riskLevel: action.riskLevel,
                    classification: action.classification,
                    affectedOutputIds: action.affectedOutputIds,
                    affectedCriterionIds: action.affectedCriterionIds,
                    affectedConstraintIds: action.affectedConstraintIds,
                    requiresEvidenceReview: action.requiresEvidenceReview,
                    blocking: action.blocking,
                    status: "open",
                    rationale: action.rationale
                }
            ],
            relatedIds: [state.id, generatedId]
        });
    }
    if (state.lifecycle.status !== "running") return invalid(state, "INVALID_STATE");
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
    return completeTransition(context, action, {
        issues: state.issues.map((item) =>
            item.id === issue.id ? { ...item, status: action.status, blocking: newBlocking } : item
        ),
        relatedIds: [state.id, action.issueId, ...action.evidenceIds],
        payload: {
            kind: "issue_disposition",
            issueId: issue.id,
            oldStatus: issue.status as "open" | "deferred",
            newStatus: action.status,
            oldBlocking: issue.blocking,
            newBlocking,
            rationale: action.rationale,
            evidenceIds: action.evidenceIds
        },
        recalculateCompletion: true
    });
};

const transitionManagerPlan = (
    context: TransitionContext,
    action: Extract<TargetMeetingAction, { kind: "plan_next_step" }>,
    generatedId: OpaqueId
): TargetTransitionResult => {
    const { state, actor, now } = context;
    if (!state.agenda.some((agenda) => agenda.id === action.agendaId))
        return invalid(state, "NOT_FOUND");
    if (state.rounds.some((round) => round.status === "open"))
        return invalid(state, "PRECONDITION_FAILED");
    const oldPlan = state.managerPlans.find(
        (plan) => plan.agendaId === action.agendaId && plan.status === "active"
    );
    return completeTransition(context, action, {
        managerPlans: [
            ...state.managerPlans.map((plan) =>
                plan.agendaId === action.agendaId && plan.status === "active"
                    ? { ...plan, status: "superseded" as const }
                    : plan
            ),
            {
                id: generatedId,
                agendaId: action.agendaId,
                managerId: actor.id,
                kind: action.planKind,
                ...(action.roundGoal === undefined ? {} : { roundGoal: action.roundGoal }),
                rationale: action.rationale,
                ...(action.blockingReason === undefined
                    ? {}
                    : { blockingReason: action.blockingReason }),
                createdAt: now,
                status: "active" as const
            }
        ],
        relatedIds: [state.id, generatedId, action.agendaId, ...(oldPlan ? [oldPlan.id] : [])]
    });
};

const dispatchTransition = (
    context: TransitionContext,
    action: TargetMeetingAction,
    generatedId?: OpaqueId
): TargetTransitionResult => {
    switch (action.kind) {
        case "pause_meeting":
        case "resume_meeting":
        case "activate_agenda":
            return transitionMeetingControl(context, action);
        case "raise_agenda_candidate":
        case "dispose_agenda_candidate":
            return transitionAgendaCandidate(context, action, generatedId as OpaqueId);
        case "record_question":
        case "resolve_question":
            return transitionQuestion(context, action, generatedId as OpaqueId);
        case "record_issue":
        case "dispose_issue":
            return transitionIssue(context, action, generatedId as OpaqueId);
        case "plan_next_step":
            return transitionManagerPlan(context, action, generatedId as OpaqueId);
    }
};

export const transitionMeetingState = (
    state: MeetingState,
    action: TargetMeetingAction,
    actor: TargetDomainActor,
    now: EpochMs,
    factId: OpaqueId,
    generatedId?: OpaqueId
): TargetTransitionResult => {
    if (
        validateMeetingState(state).kind !== "valid" ||
        !record(action) ||
        !validId(factId) ||
        !validTime(now) ||
        !record(actor) ||
        !["captain_user", "identity"].includes(actor.kind as string) ||
        !validId(actor.id)
    )
        return invalid(state, "INVALID_ARGUMENT");
    const requestError = validateActionRequest(state, action, actor, generatedId);
    if (requestError) return invalid(state, requestError);
    if (["terminal", "archiving", "archived"].includes(state.lifecycle.status))
        return invalid(state, "MEETING_TERMINAL");
    return dispatchTransition({ state, actor, now, factId }, action, generatedId);
};
