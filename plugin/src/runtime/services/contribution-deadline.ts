import { roundParticipationDeadline, type MeetingState } from "@/domain/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import {
    DEADLINE_HANDLER_PRINCIPAL_ID,
    type MeetingCommandApplication
} from "@/runtime/application-service/meeting-command.js";

const dueExit = (state: MeetingState, now: number) => {
    for (const round of state.rounds) {
        if (round.status !== "open") {
            continue;
        }
        if (
            round.invitedContributorIds !== undefined &&
            now >= roundParticipationDeadline(state, round)
        ) {
            const contributorId = round.invitedContributorIds.find(
                (id) =>
                    !round.participationResponses?.some((response) => response.contributorId === id)
            );
            if (contributorId !== undefined) {
                return { kind: "participation" as const, roundId: round.id, contributorId };
            }
        }
        for (const contributionId of round.contributionIds) {
            const contribution = state.contributions.find((item) => item.id === contributionId);
            if (!contribution) {
                continue;
            }
            const taskDeadlines = state.tasks
                .filter(
                    (task) =>
                        task.assigneeId === contribution.contributorId &&
                        task.agendaId === round.agendaId &&
                        (task.status === "open" || task.status === "claimed") &&
                        task.deadlineAt !== undefined
                )
                .map((task) => task.deadlineAt!);
            if (contribution.status === "preparing" && contribution.packageId === undefined) {
                const deadline = Math.min(
                    contribution.acceptedAt + state.limits.taskDeadlineMs,
                    round.deadlineAt ?? Infinity,
                    ...taskDeadlines
                );
                if (now >= deadline) {
                    return {
                        kind: "contribution" as const,
                        contributionId,
                        exit: "submission_missing" as const
                    };
                }
                continue;
            }
            if (
                contribution.status !== "awaiting_response" ||
                contribution.packageId === undefined ||
                (contribution.response === undefined &&
                    round.invitedContributorIds !== undefined) ||
                contribution.supplementHand?.status === "pending"
            ) {
                continue;
            }
            const evidence = state.evidencePackages.find(
                (item) => item.id === contribution.packageId
            );
            const version = evidence?.versions.find(
                (item) => item.id === evidence.currentVersionId
            );
            const review = state.reviews.find((item) => item.versionId === version?.id);
            const delivery = state.reviewDeliveries.find(
                (item) => item.reviewId === review?.id && item.status === "sent"
            );
            if (!version || delivery?.sentAt === undefined) {
                continue;
            }
            const deadline =
                contribution.response === undefined
                    ? delivery.sentAt + state.limits.responseDeadlineMs
                    : Math.min(
                          version.submittedAt + state.limits.taskDeadlineMs,
                          round.deadlineAt ?? Infinity,
                          ...taskDeadlines
                      );
            if (now >= deadline) {
                return {
                    kind: "contribution" as const,
                    contributionId,
                    exit: "timed_out" as const,
                    reason:
                        contribution.response === undefined
                            ? "贡献者回复期限已到"
                            : "继续申请未完成"
                };
            }
        }
    }
    return undefined;
};

export const runDueContributionDeadline = async (
    repository: Pick<MeetingRepositoryPort<MeetingState>, "recover">,
    application: MeetingCommandApplication,
    now: number,
    signal: AbortSignal
): Promise<void> => {
    signal.throwIfAborted();
    const recovered = await repository.recover();
    const snapshot = recovered.snapshot;
    if (!snapshot || snapshot.state.lifecycle.status !== "running") {
        return;
    }
    const due = dueExit(snapshot.state, now);
    if (!due) {
        return;
    }
    const result = await application.execute(
        {
            protocolVersion: 1,
            meetingId: snapshot.meetingId,
            expectedMeetingVersion: snapshot.version,
            requestId:
                due.kind === "participation"
                    ? `participation-deadline:${due.roundId}:${due.contributorId}`
                    : `contribution-deadline:${due.contributionId}:${due.exit}`,
            action:
                due.kind === "participation"
                    ? {
                          kind: "expire_round_participation",
                          roundId: due.roundId,
                          contributorId: due.contributorId
                      }
                    : {
                          kind: "close_contribution",
                          contributionId: due.contributionId,
                          exit: due.exit,
                          reason:
                              due.exit === "submission_missing" ? "证据提交期限已到" : due.reason
                      }
        },
        { caller: { channel: "deadline_handler", principalId: DEADLINE_HANDLER_PRINCIPAL_ID } },
        signal
    );
    if (result.kind === "rejected" && result.error.code !== "VERSION_CONFLICT") {
        throw new Error(`CONTRIBUTION_DEADLINE_FAILED:${result.error.code}`);
    }
};
