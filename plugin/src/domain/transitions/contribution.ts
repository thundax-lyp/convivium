import { DomainError } from "@/domain/errors.js";
import type {
    ContributionActor,
    DomainContributionCommand,
    ContributionTask
} from "@/domain/contribution.js";
import type { MeetingState, TransitionResult } from "@/domain/model.js";

export interface ContributionTransitionContext {
    now: number;
    actor: ContributionActor;
    newContributionId: string;
    newEvidenceId: string;
    completionFactId: (kind: string, index: number) => string;
}
export function applyContributionCommand(
    state: MeetingState,
    command: DomainContributionCommand,
    context: ContributionTransitionContext
): TransitionResult<MeetingState> {
    if (state.contributions === undefined)
        throw new DomainError("INVALID_STATE_TRANSITION", "Invalid contribution command.");
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
