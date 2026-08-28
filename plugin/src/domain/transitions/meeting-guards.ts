import { isObjectiveSatisfied } from "../completion.js";
import { DomainError } from "../errors.js";
import type { MeetingState, MeetingStatus } from "../model.js";

export const terminationCodesByStatus: Readonly<Record<MeetingStatus, readonly string[]>> = {
    created: [],
    running: [],
    waiting: [],
    paused: [],
    converging: [],
    completed: ["objective_satisfied"],
    partial: ["captain_accepted", "max_turns", "message_limit", "time_limit"],
    no_consensus: ["no_consensus"],
    cancelled: ["user_cancelled"],
    failed: ["all_participants_unavailable", "internal_error"],
    archiving: [],
    archived: []
};

export function assertCompletionReady(state: MeetingState, to: MeetingStatus): void {
    if (to !== "completed") return;
    if (!isObjectiveSatisfied(state)) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} is not ready to complete`,
            { entityType: "meeting", entityId: state.id, to, meetingVersion: state.version }
        );
    }
}

export function terminationReferencesBelongToMeeting(
    state: MeetingState,
    termination: MeetingState["termination"]
): boolean {
    return Boolean(
        termination &&
        termination.decisionIds.every((id) =>
            state.decisions.some((decision) => decision.id === id)
        ) &&
        termination.unresolvedQuestionIds.every((id) =>
            state.openQuestions.some((question) => question.id === id)
        ) &&
        termination.blockingAgendaItemIds.every((id) =>
            state.agenda.some((item) => item.id === id)
        ) &&
        termination.dissentingPositionIds.every((id) =>
            state.proposals.some((proposal) =>
                proposal.positions?.some((position) => position.id === id)
            )
        )
    );
}
