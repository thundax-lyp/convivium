import type { MeetingState } from "@/domain/index.js";
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
                    return { contributionId, exit: "submission_missing" as const };
                }
                continue;
            }
            if (
                contribution.status !== "awaiting_response" ||
                contribution.packageId === undefined ||
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
                return { contributionId, exit: "timed_out" as const };
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
            requestId: `contribution-deadline:${due.contributionId}:${due.exit}`,
            action: {
                kind: "close_contribution",
                contributionId: due.contributionId,
                exit: due.exit,
                reason:
                    due.exit === "submission_missing" ? "证据提交期限已到" : "贡献者回复期限已到"
            }
        },
        { caller: { channel: "deadline_handler", principalId: DEADLINE_HANDLER_PRINCIPAL_ID } },
        signal
    );
    if (result.kind === "rejected" && result.error.code !== "VERSION_CONFLICT") {
        throw new Error(`CONTRIBUTION_DEADLINE_FAILED:${result.error.code}`);
    }
};
