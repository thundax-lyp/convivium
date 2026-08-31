import { DomainError } from "../errors.js";
import type { MeetingIssue, MeetingState, TransitionResult } from "../model.js";
import type { SubmittedIssueInput } from "./types.js";

function unique(values: readonly string[]): boolean {
    return new Set(values).size === values.length;
}

export function addSubmittedIssues(
    state: MeetingState,
    participantId: string,
    agendaItemId: string,
    issues: readonly SubmittedIssueInput[]
): TransitionResult<MeetingState> {
    if (!state.participants.some(({ id }) => id === participantId))
        throw new DomainError("INVALID_ENTITY_STATE", "issue caller is not a meeting participant");
    if (state.activeAgendaItemId !== agendaItemId)
        throw new DomainError("INVALID_ENTITY_STATE", "issue agenda is not active");

    const existingIds = new Set(state.issues.map(({ id }) => id));
    const outputIds = new Set(state.objectiveContract.requiredOutputs.map(({ id }) => id));
    const criterionIds = new Set(state.objectiveContract.acceptanceCriteria.map(({ id }) => id));
    const constraintIds = new Set(state.objectiveContract.hardConstraints.map(({ id }) => id));
    const inputIds = new Set<string>();
    for (const issue of issues) {
        if (!issue.id.trim() || existingIds.has(issue.id) || inputIds.has(issue.id))
            throw new DomainError("INVALID_ENTITY_STATE", "issue id is invalid or already exists");
        inputIds.add(issue.id);
        if (!issue.title.trim() || !issue.description.trim())
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                "issue title and description must not be empty"
            );
        if (
            !unique(issue.affectedOutputIds) ||
            !unique(issue.affectedCriterionIds) ||
            !unique(issue.violatedConstraintIds) ||
            issue.affectedOutputIds.some((id) => !outputIds.has(id)) ||
            issue.affectedCriterionIds.some((id) => !criterionIds.has(id)) ||
            issue.violatedConstraintIds.some((id) => !constraintIds.has(id))
        )
            throw new DomainError("INVALID_ENTITY_STATE", "issue blocking evidence is invalid");
    }
    const added: MeetingIssue[] = issues.map((issue) => {
        const blocking =
            issue.affectedOutputIds.length > 0 ||
            issue.affectedCriterionIds.length > 0 ||
            issue.violatedConstraintIds.length > 0;
        return {
            id: issue.id,
            title: issue.title.trim(),
            description: issue.description.trim(),
            sourceMessageId: "",
            agendaItemId,
            affectedOutputIds: issue.affectedOutputIds,
            affectedCriterionIds: issue.affectedCriterionIds,
            violatedConstraintIds: issue.violatedConstraintIds,
            blockingObjectionIds: [],
            blocking,
            impact: issue.impact,
            urgency: issue.urgency,
            reversibility: issue.safeDefaultAvailable ? "reversible" : "partially_reversible",
            safeDefaultAvailable: issue.safeDefaultAvailable,
            disposition: blocking ? "blocking" : "follow_up",
            status: "open",
            relatedTaskIds: []
        };
    });
    const sourceMessageId = state.transcript.at(-1)?.id;
    if (sourceMessageId === undefined)
        throw new DomainError("INVALID_ENTITY_STATE", "issue source message is missing");
    const withSource = added.map((issue) => ({ ...issue, sourceMessageId }));
    const events = withSource.map((issue) => ({
        type: "issue.added" as const,
        payload: {
            meetingId: state.id,
            issueId: issue.id,
            blocking: issue.blocking,
            meetingVersion: state.version
        }
    }));
    return {
        state: {
            ...state,
            issues: [...state.issues, ...withSource],
            eventSeq: state.eventSeq + events.length
        },
        effect: { events }
    };
}
