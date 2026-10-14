import type { ContributionFailure, MeetingState, OpaqueId } from "@/domain/index.ts";
import { rejectedTransition as reject, type MeetingTransitionResult } from "./result.ts";
import { roundReadyNotice } from "./round.ts";
type Input = {
    contributionId: OpaqueId;
    actorId: OpaqueId;
    actorKind: "author" | "deadline_handler" | "runtime";
    exit: "withdrawn" | "submission_missing" | "execution_failed";
    reason: string;
    failure?: ContributionFailure;
    now: number;
};
export const closeContribution = (state: MeetingState, input: Input): MeetingTransitionResult => {
    if (
        !input.contributionId.trim() ||
        !input.actorId.trim() ||
        !input.reason.trim() ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0
    ) {
        return reject(state, "INVALID_ARGUMENT", "invalid contribution exit");
    }
    const contribution = state.contributions.find(
        (candidate) => candidate.id === input.contributionId
    );
    if (!contribution) {
        return reject(state, "NOT_FOUND", "contribution not found");
    }
    if (
        contribution.status === "withdrawn" ||
        contribution.status === "submission_missing" ||
        contribution.status === "execution_failed" ||
        contribution.status === "closed"
    ) {
        return reject(state, "INVALID_STATE", "contribution is terminal");
    }
    if (input.actorKind === "runtime") {
        if (
            input.exit !== "execution_failed" ||
            input.failure === undefined ||
            contribution.packageId !== undefined
        ) {
            return reject(
                state,
                "INVALID_STATE",
                "runtime failure requires an unsubmitted contribution"
            );
        }
    } else if (input.actorKind === "author") {
        if (input.actorId !== contribution.contributorId || input.exit !== "withdrawn") {
            return reject(state, "UNAUTHORIZED", "author may only withdraw own contribution");
        }
    } else {
        if (input.exit === "withdrawn") {
            return reject(state, "UNAUTHORIZED", "deadline handler cannot withdraw");
        }
        const round = state.rounds.find((candidate) => candidate.id === contribution.roundId);
        if (!round) {
            return reject(state, "INVALID_STATE", "contribution round is missing");
        }
        if (input.exit !== "submission_missing" || contribution.packageId !== undefined) {
            return reject(state, "INVALID_STATE", "evidence was already submitted");
        }
        const deadline = Math.min(
            contribution.acceptedAt + state.limits.taskDeadlineMs,
            round.deadlineAt ?? Infinity
        );
        if (!Number.isSafeInteger(deadline) || input.now < deadline) {
            return reject(state, "PRECONDITION_FAILED", "contribution deadline has not arrived");
        }
    }
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        contributions: state.contributions.map((candidate) =>
            candidate.id === contribution.id
                ? {
                      ...candidate,
                      status: input.exit,
                      exitReason: input.reason,
                      ...(input.failure === undefined ? {} : { failure: input.failure })
                  }
                : candidate
        )
    };
    return {
        kind: "accepted",
        state: next,
        relatedIds: [contribution.id],
        effectRequests: roundReadyNotice(state, next, contribution.roundId)
    };
};
