import { DomainError } from "../errors.js";
import type { MeetingState, TransitionResult } from "../model.js";
import type { SubmittedQuestionInput } from "./types.js";

export function addSubmittedQuestions(
    state: MeetingState,
    participantId: string,
    agendaItemId: string,
    questions: readonly SubmittedQuestionInput[]
): TransitionResult<MeetingState> {
    if (!state.participants.some(({ id }) => id === participantId)) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            "question caller is not a meeting participant"
        );
    }
    if (
        !state.agenda.some(({ id }) => id === agendaItemId) ||
        state.activeAgendaItemId !== agendaItemId
    ) {
        throw new DomainError("INVALID_ENTITY_STATE", "question agenda is not active");
    }
    const existingIds = new Set(state.openQuestions.map(({ id }) => id));
    const inputIds = new Set<string>();
    for (const question of questions) {
        if (!question.id.trim() || existingIds.has(question.id) || inputIds.has(question.id)) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                "question id is invalid or already exists"
            );
        }
        inputIds.add(question.id);
    }
    for (const question of questions) {
        if (!question.text.trim()) {
            throw new DomainError("INVALID_ENTITY_STATE", "question text must not be empty");
        }
    }
    for (const question of questions) {
        if (
            question.directedTo !== undefined &&
            !state.participants.some(({ id }) => id === question.directedTo)
        ) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                "question target is not a meeting participant"
            );
        }
    }
    for (const question of questions) {
        const outputIds = question.affectedOutputIds ?? [];
        const criterionIds = question.affectedCriterionIds ?? [];
        const constraintIds = question.violatedConstraintIds ?? [];
        const valid =
            outputIds.every((id) =>
                state.objectiveContract.requiredOutputs.some((item) => item.id === id)
            ) &&
            criterionIds.every((id) =>
                state.objectiveContract.acceptanceCriteria.some((item) => item.id === id)
            ) &&
            constraintIds.every((id) =>
                state.objectiveContract.hardConstraints.some((item) => item.id === id)
            );
        if (!valid) {
            throw new DomainError(
                "INVALID_ARGUMENT",
                "question evidence does not belong to this Meeting"
            );
        }
        if (question.blocking) {
            const refs = outputIds.length + criterionIds.length + constraintIds.length;
            const unresolved =
                outputIds.some((id) =>
                    state.objectiveContract.requiredOutputs.some(
                        (item) => item.id === id && item.status !== "accepted"
                    )
                ) ||
                criterionIds.some((id) =>
                    state.objectiveContract.acceptanceCriteria.some(
                        (item) => item.id === id && !item.satisfied
                    )
                ) ||
                constraintIds.length > 0;
            if (refs === 0 || !unresolved) {
                throw new DomainError(
                    "INVALID_ARGUMENT",
                    "blocking question requires unresolved objective evidence"
                );
            }
        }
    }

    const addedQuestions = questions.map((question) => ({
        id: question.id,
        text: question.text.trim(),
        ...(question.directedTo === undefined ? {} : { directedTo: question.directedTo }),
        askedBy: participantId,
        agendaItemId,
        blocking: question.blocking,
        affectedOutputIds: [...(question.affectedOutputIds ?? [])],
        affectedCriterionIds: [...(question.affectedCriterionIds ?? [])],
        violatedConstraintIds: [...(question.violatedConstraintIds ?? [])],
        status: "open" as const,
        createdAt: question.createdAt
    }));
    const events = addedQuestions.map((question) => ({
        type: "question.added" as const,
        payload: {
            meetingId: state.id,
            questionId: question.id,
            askedBy: participantId,
            agendaItemId,
            blocking: question.blocking,
            meetingVersion: state.version
        }
    }));
    return {
        state: {
            ...state,
            openQuestions: [...state.openQuestions, ...addedQuestions],
            eventSeq: state.eventSeq + events.length
        },
        effect: { events }
    };
}
