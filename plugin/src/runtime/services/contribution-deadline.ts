import { roundParticipationDeadline, type MeetingState } from "@/domain/index.ts";
import type { MeetingRepository } from "@/repository/index.ts";
import {
    DEADLINE_HANDLER_PRINCIPAL_ID,
    type MeetingCommandApplication
} from "@/runtime/application-service/index.ts";

const dueExit = (state: MeetingState, now: number) => {
    for (const round of state.rounds) {
        if (round.status !== "open") {
            continue;
        }
        if (now >= roundParticipationDeadline(state, round)) {
            const contributorId = round.invitedContributorIds.find(
                (id) =>
                    !round.participationResponses.some((response) => response.contributorId === id)
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
            if (contribution.status === "preparing" && contribution.packageId === undefined) {
                const deadline = Math.min(
                    contribution.acceptedAt + state.limits.taskDeadlineMs,
                    round.deadlineAt ?? Infinity
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
        }
    }
    return undefined;
};

export const runDueContributionDeadline = async (
    repository: Pick<MeetingRepository<MeetingState>, "recover">,
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
                          reason: "证据提交期限已到"
                      }
        },
        { caller: { channel: "deadline_handler", principalId: DEADLINE_HANDLER_PRINCIPAL_ID } },
        signal
    );
    if (result.kind === "rejected" && result.error.code !== "VERSION_CONFLICT") {
        throw new Error(`CONTRIBUTION_DEADLINE_FAILED:${result.error.code}`);
    }
};
