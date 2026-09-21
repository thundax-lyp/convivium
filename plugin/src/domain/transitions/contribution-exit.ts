import type { MeetingState, OpaqueId } from "@/domain/index.js";
import { rejectedTransitionV1 as reject, type MeetingTransitionResult } from "./result.js";
type Input = {
    contributionId: OpaqueId;
    actorId: OpaqueId;
    actorKind: "author" | "deadline_handler";
    exit: "withdrawn" | "timed_out" | "submission_missing";
    reason: string;
    now: number;
};
export function closeContributionV1(state: MeetingState, input: Input): MeetingTransitionResult {
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
        const round = state.rounds.find((candidate) => candidate.id === contribution.roundId);
        if (!round) return reject(state, "INVALID_STATE", "contribution round is missing");
        const taskDeadlines = state.tasks
            .filter(
                (task) =>
                    task.assigneeId === contribution.contributorId &&
                    task.agendaId === round.agendaId &&
                    (task.status === "open" || task.status === "claimed") &&
                    task.deadlineAt !== undefined
            )
            .map((task) => task.deadlineAt!);
        let deadlines: number[];
        let includePreparationDeadlines = true;
        if (input.exit === "submission_missing") {
            if (contribution.packageId !== undefined)
                return reject(state, "INVALID_STATE", "evidence was already submitted");
            deadlines = [contribution.acceptedAt + state.limits.taskDeadlineMs];
        } else {
            if (
                contribution.packageId === undefined ||
                contribution.supplementHand?.status === "pending"
            )
                return reject(state, "INVALID_STATE", "contribution cannot time out");
            const pkg = state.evidencePackages.find(
                (candidate) => candidate.id === contribution.packageId
            );
            const version = pkg?.versions.find(
                (candidate) => candidate.id === pkg.currentVersionId
            );
            const review = state.reviews.find((candidate) => candidate.versionId === version?.id);
            const sent = state.reviewDeliveries.find(
                (candidate) => candidate.reviewId === review?.id && candidate.status === "sent"
            );
            if (!version || sent?.sentAt === undefined)
                return reject(state, "INVALID_STATE", "review has not been delivered");
            deadlines = [
                contribution.response === undefined
                    ? sent.sentAt + state.limits.responseDeadlineMs
                    : version.submittedAt + state.limits.taskDeadlineMs
            ];
            includePreparationDeadlines = contribution.response !== undefined;
        }
        if (includePreparationDeadlines) {
            if (round.deadlineAt !== undefined) deadlines.push(round.deadlineAt);
            deadlines.push(...taskDeadlines);
        }
        const deadline = Math.min(...deadlines);
        if (!Number.isSafeInteger(deadline) || input.now < deadline)
            return reject(state, "PRECONDITION_FAILED", "contribution deadline has not arrived");
    }
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        contributions: state.contributions.map((candidate) =>
            candidate.id === contribution.id
                ? (() => {
                      const { supplementHand: _supplementHand, ...candidateWithoutHand } =
                          candidate;
                      return {
                          ...candidateWithoutHand,
                          status: input.exit,
                          exitReason: input.reason
                      };
                  })()
                : candidate
        )
    };
    return { kind: "accepted", state: next, relatedIds: [contribution.id], effectRequests: [] };
}
