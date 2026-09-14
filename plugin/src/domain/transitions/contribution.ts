import { DomainError } from "@/domain/errors.js";
import type { DomainCompletionClaims } from "@/domain/completion.js";
import type {
    ContributionActor,
    DomainContributionCommand,
    ContributionTask
} from "@/domain/contribution.js";
import { assertContributionEvidenceMessages } from "@/domain/contribution.js";
import type { MeetingState, TransitionResult } from "@/domain/model.js";
import { applyPublicSubmission, assertPublicMinutes } from "./public-submission.js";

export interface ContributionTransitionContext {
    now: number;
    actor: ContributionActor;
    newContributionId: string;
    newEvidenceId: string;
    completionFactId: (kind: string, index: number) => string;
}

function assertCompletionEvidenceSupport(
    state: MeetingState,
    claims: DomainCompletionClaims
): void {
    for (const messageIds of [
        ...(claims.outputClaims ?? []).map((claim) => claim.evidenceMessageIds),
        ...(claims.criterionClaims ?? []).map((claim) => claim.evidenceMessageIds),
        ...(claims.agendaResolution === undefined
            ? []
            : [claims.agendaResolution.evidenceMessageIds]),
        ...(claims.review?.result === "approved" ? [claims.review.evidenceMessageIds] : [])
    ])
        assertContributionEvidenceMessages(state, messageIds);
}
export function applyContributionCommand(
    state: MeetingState,
    command: DomainContributionCommand,
    context: ContributionTransitionContext
): TransitionResult<MeetingState> {
    if (state.contributions === undefined)
        throw new DomainError("INVALID_STATE_TRANSITION", "Invalid contribution command.");
    if (command.action === "boundary_review") {
        if (context.actor.kind !== "manager")
            throw new DomainError(
                "INVALID_STATE_TRANSITION",
                "Only the Manager can review contributions."
            );
        const task = state.contributions.tasks[command.contributionId];
        const draft = task?.drafts[String(command.draftRevision)];
        if (
            task === undefined ||
            draft === undefined ||
            task.phase !== "boundary_review" ||
            task.generation !== command.generation ||
            task.currentDraftRevision !== command.draftRevision ||
            task.agendaItemId !== state.activeAgendaItemId ||
            task.deadlineAt <= context.now ||
            command.checkedThroughSeq !== state.messageSeq
        )
            throw new DomainError("STALE_ATTEMPT", "Contribution review is stale.");
        const review = {
            draftRevision: command.draftRevision,
            decision: command.decision,
            reason: command.reason,
            checkedThroughSeq: command.checkedThroughSeq,
            actor: "manager",
            reviewedAt: context.now
        };
        if (command.decision === "return") {
            const returnCount = task.returnCount + 1;
            const next = {
                ...task,
                generation: task.generation + 1,
                phase: returnCount > 2 ? ("captain_action" as const) : ("returned" as const),
                returnCount,
                deadlineAt: context.now + 600_000,
                updatedAt: context.now,
                reason: command.reason,
                boundaryReviews: [...task.boundaryReviews, review]
            };
            return {
                state: {
                    ...state,
                    contributions: {
                        ...state.contributions,
                        tasks: { ...state.contributions.tasks, [task.id]: next }
                    },
                    eventSeq: state.eventSeq + 1
                },
                effect: {
                    events: [
                        {
                            type: "contribution.boundary_reviewed",
                            payload: {
                                contributionId: task.id,
                                generation: task.generation,
                                draftRevision: command.draftRevision,
                                decision: "return",
                                actor: "manager",
                                at: context.now
                            }
                        }
                    ]
                }
            };
        }
        if (state.transcript.some(({ id }) => id === draft.message.id))
            throw new DomainError("STALE_ATTEMPT", "Contribution draft was already published.");
        if (task.requiresEvidenceReview && draft.citations.length === 0)
            throw new DomainError(
                "INVALID_STATE_TRANSITION",
                "Evidence-reviewed contributions require citations."
            );
        if (draft.claims.completion !== undefined)
            assertCompletionEvidenceSupport(state, draft.claims.completion);
        assertPublicMinutes(state, draft.message, 0, command.checkedThroughSeq);
        const message = {
            ...draft.message,
            seq: state.messageSeq + 1,
            contributionId: task.id,
            contributionRevision: draft.revision,
            speaker: task.participantId,
            agendaItemId: task.agendaItemId,
            createdAt: context.now
        };
        const published = applyPublicSubmission(
            {
                ...state,
                transcript: [...state.transcript, message],
                messageSeq: message.seq
            },
            task.participantId,
            {
                claims: draft.claims,
                authorizedTaskIds: [],
                completionFactId: context.completionFactId,
                agendaItemId: task.agendaItemId,
                message,
                now: context.now
            }
        );
        const next = {
            ...task,
            phase: "published" as const,
            deadlineAt: context.now + 600_000,
            updatedAt: context.now,
            messageId: message.id,
            reason: undefined,
            reviewStatus:
                task.requiresEvidenceReview && draft.citations.length > 0
                    ? ("pending" as const)
                    : ("not_required" as const),
            boundaryReviews: [...task.boundaryReviews, review]
        };
        const managerNoticeSeq = state.contributions.managerNoticeSeq + 1;
        const events = [
            {
                type: "contribution.boundary_reviewed" as const,
                payload: {
                    contributionId: task.id,
                    generation: task.generation,
                    draftRevision: command.draftRevision,
                    decision: "approve" as const,
                    actor: "manager",
                    at: context.now
                }
            },
            {
                type: "message.added" as const,
                payload: {
                    meetingId: state.id,
                    messageId: message.id,
                    meetingVersion: state.version + 1
                }
            },
            {
                type: "contribution.manager_notified" as const,
                payload: {
                    noticeSeq: managerNoticeSeq,
                    contextThroughSeq: message.seq,
                    actor: "manager",
                    at: context.now
                }
            },
            ...published.effect.events
        ];
        return {
            state: {
                ...published.state,
                version: state.version + 1,
                updatedAt: context.now,
                eventSeq: state.eventSeq + events.length,
                contributions: {
                    ...state.contributions,
                    managerNoticeSeq,
                    managerDeadlineAt: context.now + 600_000,
                    tasks: { ...state.contributions.tasks, [task.id]: next }
                }
            },
            effect: { events }
        };
    }
    if (command.action === "evidence_review") {
        const task = state.contributions.tasks[command.contributionId];
        const draft = task?.drafts[String(command.draftRevision)];
        if (context.actor.kind !== "participant")
            throw new DomainError(
                "UNAUTHORIZED_CALLER",
                "Only the independent reviewer can review evidence."
            );
        const reviewerId = context.actor.participantId;
        if (reviewerId !== state.contributions.reviewerId)
            throw new DomainError(
                "UNAUTHORIZED_CALLER",
                "Only the independent reviewer can review evidence."
            );
        if (
            task === undefined ||
            draft === undefined ||
            task.phase !== "published" ||
            task.reviewStatus !== "pending" ||
            task.generation !== command.generation ||
            task.currentDraftRevision !== command.draftRevision ||
            task.deadlineAt <= context.now
        )
            throw new DomainError("STALE_ATTEMPT", "Contribution evidence review is stale.");
        const citations = new Set(
            draft.citations.map((citation) => `${citation.evidenceKey}\0${citation.claim}`)
        );
        const reviews = new Set(
            command.reviews.map((review) => `${review.evidenceKey}\0${review.claim}`)
        );
        if (
            command.reviews.length !== citations.size ||
            reviews.size !== command.reviews.length ||
            [...reviews].some((key) => !citations.has(key))
        )
            throw new DomainError(
                "INVALID_STATE_TRANSITION",
                "Evidence reviews must exactly cover contribution citations."
            );
        if (
            draft.citations.some(
                (citation) =>
                    state.contributions!.evidence[citation.evidenceKey]?.submittedBy === reviewerId
            )
        )
            throw new DomainError(
                "UNAUTHORIZED_CALLER",
                "Only the independent reviewer can review evidence."
            );
        const evidenceReviews = command.reviews.map((review) => ({
            ...review,
            draftRevision: command.draftRevision,
            actor: reviewerId,
            reviewedAt: context.now
        }));
        const next = {
            ...task,
            reviewStatus: "complete" as const,
            updatedAt: context.now,
            evidenceReviews: [...task.evidenceReviews, ...evidenceReviews]
        };
        const managerNoticeSeq = state.contributions.managerNoticeSeq + 1;
        return {
            state: {
                ...state,
                contributions: {
                    ...state.contributions,
                    managerNoticeSeq,
                    managerDeadlineAt: context.now + 600_000,
                    tasks: { ...state.contributions.tasks, [task.id]: next }
                },
                eventSeq: state.eventSeq + 2
            },
            effect: {
                events: [
                    {
                        type: "contribution.evidence_reviewed",
                        payload: {
                            contributionId: task.id,
                            generation: task.generation,
                            draftRevision: command.draftRevision,
                            verdicts: command.reviews.map((review) => review.verdict),
                            actor: reviewerId,
                            at: context.now
                        }
                    },
                    {
                        type: "contribution.manager_notified",
                        payload: {
                            noticeSeq: managerNoticeSeq,
                            contextThroughSeq: state.messageSeq,
                            actor: "manager",
                            at: context.now
                        }
                    }
                ]
            }
        };
    }
    if (command.action === "save_evidence" || command.action === "submit") {
        const task = state.contributions.tasks[command.contributionId];
        if (
            context.actor.kind !== "participant" ||
            context.actor.participantId !== task?.participantId ||
            task.generation !== command.generation ||
            task.deadlineAt <= context.now
        )
            throw new DomainError("STALE_ATTEMPT", "Contribution attempt is stale.");
        if (command.action === "save_evidence") {
            if (task.phase !== "preparing" && task.phase !== "returned")
                throw new DomainError(
                    "INVALID_STATE_TRANSITION",
                    "Evidence cannot be saved in this phase."
                );
            const evidenceId = command.evidenceId ?? context.newEvidenceId;
            const previous = Object.values(state.contributions.evidence).filter(
                (item) => item.evidenceId === evidenceId
            );
            const revision = previous.length + 1;
            if (command.expectedEvidenceRevision !== revision - 1)
                throw new DomainError("STALE_ATTEMPT", "Evidence revision is stale.");
            const evidence = {
                ...command.material,
                evidenceId,
                revision,
                key: `${evidenceId}:${revision}`,
                submittedBy: task.participantId,
                submittedAt: context.now
            };
            return {
                state: {
                    ...state,
                    contributions: {
                        ...state.contributions,
                        evidence: { ...state.contributions.evidence, [evidence.key]: evidence }
                    },
                    eventSeq: state.eventSeq + 1
                },
                effect: {
                    events: [
                        {
                            type: "contribution.evidence_saved",
                            payload: {
                                contributionId: task.id,
                                generation: task.generation,
                                evidenceKey: evidence.key,
                                actor: task.participantId,
                                at: context.now
                            }
                        }
                    ]
                }
            };
        }
        if (
            (task.phase !== "preparing" && task.phase !== "returned") ||
            task.currentDraftRevision !== command.expectedDraftRevision ||
            command.draft.revision !== command.expectedDraftRevision + 1
        )
            throw new DomainError("STALE_ATTEMPT", "Draft revision is stale.");
        if (command.draft.claims.completion !== undefined)
            assertCompletionEvidenceSupport(state, command.draft.claims.completion);
        const draft = { ...command.draft, citations: [...command.draft.citations] };
        const next = {
            ...task,
            phase: "boundary_review" as const,
            currentDraftRevision: draft.revision,
            drafts: { ...task.drafts, [String(draft.revision)]: draft },
            deadlineAt: context.now + 600000,
            updatedAt: context.now
        };
        return {
            state: {
                ...state,
                contributions: {
                    ...state.contributions,
                    tasks: { ...state.contributions.tasks, [task.id]: next }
                },
                eventSeq: state.eventSeq + 1
            },
            effect: {
                events: [
                    {
                        type: "contribution.submitted",
                        payload: {
                            contributionId: task.id,
                            generation: task.generation,
                            draftRevision: draft.revision,
                            actor: task.participantId,
                            at: context.now
                        }
                    }
                ]
            }
        };
    }
    if (context.actor.kind !== "manager")
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "Only the Manager can assign contributions."
        );
    if (
        !state.participants.some(({ id }) => id === command.participantId) ||
        state.activeAgendaItemId !== command.agendaItemId
    )
        throw new DomainError(
            "INVALID_ARGUMENT",
            "Contribution assignment does not belong to this meeting."
        );
    if (
        Object.values(state.contributions.tasks).some(
            (task) =>
                task.participantId === command.participantId &&
                !["published", "cancelled"].includes(task.phase)
        )
    )
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "Participant already has an active contribution."
        );
    const task: ContributionTask = {
        id: context.newContributionId,
        participantId: command.participantId,
        agendaItemId: command.agendaItemId,
        instruction: command.instruction,
        targetIds: [...command.targetIds],
        requiredForCompletion: command.requiredForCompletion,
        requiresEvidenceReview: command.requiresEvidenceReview,
        generation: 1,
        phase: "preparing",
        basedOnSeq: state.messageSeq,
        deadlineAt: context.now + 600000,
        createdAt: context.now,
        updatedAt: context.now,
        currentDraftRevision: 0,
        returnCount: 0,
        drafts: {},
        boundaryReviews: [],
        evidenceReviews: [],
        reviewStatus: "not_required"
    };
    return {
        state: {
            ...state,
            contributions: {
                ...state.contributions,
                tasks: { ...state.contributions.tasks, [task.id]: task }
            },
            eventSeq: state.eventSeq + 1
        },
        effect: {
            events: [
                {
                    type: "contribution.assigned",
                    payload: {
                        contributionId: task.id,
                        generation: 1,
                        actor: "manager",
                        at: context.now
                    }
                }
            ]
        }
    };
}
