import type { MeetingState } from "./model.js";

export type TurnCompletionKind = "completed" | "partial" | "continue";

export interface TurnCompletionJudgment {
    kind: TurnCompletionKind;
    reason: "objective_satisfied" | "max_turns" | "message_limit" | "time_limit" | "continue";
}

function objectiveSatisfied(state: MeetingState): boolean {
    return (
        state.objectiveContract.requiredOutputs.every((output) => output.status === "accepted") &&
        state.objectiveContract.acceptanceCriteria.every((criterion) => criterion.satisfied) &&
        state.objectiveContract.requiredReviewers.every((reviewerId) =>
            state.completionFacts.some(
                (fact) =>
                    fact.reviewerId === reviewerId &&
                    fact.status === "active" &&
                    fact.result === "approved"
            )
        ) &&
        state.agenda.every((item) => item.status === "resolved" || item.status === "deferred") &&
        state.issues.every(
            (issue) =>
                !issue.blocking ||
                ["resolved", "deferred", "accepted_risk", "out_of_scope"].includes(issue.status)
        ) &&
        state.openQuestions.every(
            (question) =>
                question.status === "answered" ||
                question.status === "withdrawn" ||
                question.status === "deferred"
        )
    );
}

export function judgeTurnCompletion(state: MeetingState, now: number): TurnCompletionJudgment {
    if (objectiveSatisfied(state)) return { kind: "completed", reason: "objective_satisfied" };
    if (state.turnSeq >= state.limits.maxTurns) return { kind: "partial", reason: "max_turns" };
    if (state.messageSeq >= state.limits.maxTotalMessages)
        return { kind: "partial", reason: "message_limit" };
    if (
        state.limits.maxDurationMs !== undefined &&
        now - state.createdAt >= state.limits.maxDurationMs
    ) {
        return { kind: "partial", reason: "time_limit" };
    }
    return { kind: "continue", reason: "continue" };
}
