import type { MeetingState, OpaqueId } from "@/domain/meeting-state.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-validation.js";
import { isObjectiveSatisfiedV1 } from "./outcome.js";
import { rejectedTransitionV1, type MeetingTransitionResult } from "./result.js";

export interface EndMeetingInput {
    terminationId: OpaqueId;
    outcome: "completed" | "partial" | "no_consensus" | "cancelled" | "failed";
    reason: string;
    decisionIds: readonly OpaqueId[];
    completionFactIds: readonly OpaqueId[];
    unresolvedQuestionIds: readonly OpaqueId[];
    unresolvedIssueIds: readonly OpaqueId[];
    actorId: OpaqueId;
    now: number;
}
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const sameIds = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && left.every((value, index) => value === right[index]);
const nonTerminalContributionStatuses = new Set([
    "preparing",
    "registered",
    "under_review",
    "awaiting_response"
]);

export function endMeetingV1(state: MeetingState, input: EndMeetingInput): MeetingTransitionResult {
    if (validateMeetingStateV1(state).kind === "invalid")
        return rejectedTransitionV1(state, "INVALID_ARGUMENT", "invalid meeting state");
    if (!(
        "running" === state.lifecycle.status ||
        "paused" === state.lifecycle.status ||
        "converging" === state.lifecycle.status
    ))
        return rejectedTransitionV1(state, "MEETING_TERMINAL", "meeting is not endable");
    if (state.rounds.some((round) => round.status === "open"))
        return rejectedTransitionV1(state, "INVALID_STATE", "an open round remains");
    if (
        !input.terminationId.trim() ||
        !input.reason.trim() ||
        !input.actorId.trim() ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0 ||
        !unique(input.decisionIds) ||
        !unique(input.completionFactIds) ||
        !unique(input.unresolvedQuestionIds) ||
        !unique(input.unresolvedIssueIds) ||
        [
            ...input.decisionIds,
            ...input.completionFactIds,
            ...input.unresolvedQuestionIds,
            ...input.unresolvedIssueIds
        ].some((id) => !id.trim())
    )
        return rejectedTransitionV1(state, "INVALID_ARGUMENT", "invalid end meeting input");
    if (state.termination !== undefined || state.rounds.some((round) => round.status === "open"))
        return rejectedTransitionV1(state, "INVALID_STATE", "meeting is already ending");
    const decisionIds = state.decisions
        .filter((item) => item.status === "accepted")
        .map((item) => item.id);
    const completionFactIds = state.completionFacts
        .filter((item) => item.status === "active")
        .map((item) => item.id);
    const unresolvedQuestionIds = state.questions
        .filter((item) => item.status === "open" || item.status === "deferred")
        .map((item) => item.id);
    const unresolvedIssueIds = state.issues
        .filter((item) => item.status === "open" || item.status === "deferred")
        .map((item) => item.id);
    if (
        !sameIds(input.decisionIds, decisionIds) ||
        !sameIds(input.completionFactIds, completionFactIds) ||
        !sameIds(input.unresolvedQuestionIds, unresolvedQuestionIds) ||
        !sameIds(input.unresolvedIssueIds, unresolvedIssueIds)
    )
        return rejectedTransitionV1(
            state,
            "PRECONDITION_FAILED",
            "termination facts do not match state"
        );
    const unclosedContributionIds = state.contributions
        .filter((item) => nonTerminalContributionStatuses.has(item.status))
        .map((item) => item.id);
    if (
        input.outcome === "completed" &&
        (!isObjectiveSatisfiedV1(state) ||
            unresolvedQuestionIds.length > 0 ||
            unresolvedIssueIds.length > 0 ||
            unclosedContributionIds.length > 0)
    )
        return rejectedTransitionV1(state, "PRECONDITION_FAILED", "meeting is not complete");
    const next: MeetingState = {
        ...structuredClone(state),
        version: state.version + 1,
        updatedAt: input.now,
        lifecycle: { status: "terminal", changedAt: input.now, changedBy: input.actorId },
        identityRecommendations: state.identityRecommendations.map((item) =>
            item.status === "provisioning"
                ? {
                      ...item,
                      status: "failed" as const,
                      resolvedAt: input.now,
                      failureCode: "ADMISSION_CONFLICT"
                  }
                : item
        ),
        termination: {
            id: input.terminationId,
            outcome: input.outcome,
            reason: input.reason.trim(),
            endedAt: input.now,
            decisionIds,
            completionFactIds,
            unresolvedQuestionIds,
            unresolvedIssueIds,
            unclosedContributionIds
        }
    };
    return {
        kind: "accepted",
        state: next,
        relatedIds: [
            input.terminationId,
            ...decisionIds,
            ...completionFactIds,
            ...unresolvedQuestionIds,
            ...unresolvedIssueIds,
            ...unclosedContributionIds
        ],
        effectRequests: [{ kind: "materialize_archive", terminationId: input.terminationId }]
    };
}
