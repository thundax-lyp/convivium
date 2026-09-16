import type { MeetingState, OpaqueId } from "../meeting-state-v1.js";
import type { MeetingTransitionResultV1 } from "./result-v1.js";
type Input = {
    contributionId: OpaqueId;
    actorId: OpaqueId;
    actorKind: "author" | "deadline_handler";
    exit: "withdrawn" | "timed_out" | "submission_missing";
    reason: string;
    now: number;
};
function reject(
    state: MeetingState,
    code: Extract<MeetingTransitionResultV1, { kind: "rejected" }>["error"]["code"],
    message: string
): MeetingTransitionResultV1 {
    return {
        kind: "rejected",
        state,
        relatedIds: [],
        effectRequests: [],
        error: { code, message }
    };
}
export function closeContributionV1(state: MeetingState, input: Input): MeetingTransitionResultV1 {
    if (
        !input.contributionId.trim() ||
        !input.actorId.trim() ||
        !input.reason.trim() ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0
    )
        return reject(state, "INVALID_ARGUMENT", "invalid contribution exit");
    const contribution = state.contributions.find(
        (candidate) => candidate.id === input.contributionId
    );
    if (!contribution) return reject(state, "NOT_FOUND", "contribution not found");
    if (
        contribution.status === "withdrawn" ||
        contribution.status === "timed_out" ||
        contribution.status === "submission_missing" ||
        contribution.status === "closed"
    )
        return reject(state, "INVALID_STATE", "contribution is terminal");
    if (input.actorKind === "author") {
        if (input.actorId !== contribution.contributorId || input.exit !== "withdrawn")
            return reject(state, "UNAUTHORIZED", "author may only withdraw own contribution");
    } else {
        if (input.exit === "withdrawn")
            return reject(state, "UNAUTHORIZED", "deadline handler cannot withdraw");
        const deadline = contribution.acceptedAt + state.limits.taskDeadlineMs;
        if (input.now < deadline)
            return reject(state, "PRECONDITION_FAILED", "contribution deadline has not arrived");
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
                      supplementHand: undefined
                  }
                : candidate
        ),
        formatApprovals: state.formatApprovals.filter(
            (approval) => approval.contributionId !== contribution.id
        )
    };
    return { kind: "accepted", state: next, relatedIds: [contribution.id], effectRequests: [] };
}
