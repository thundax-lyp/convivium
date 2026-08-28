import { DomainError, type MeetingState } from "../domain/index.js";

export interface AuthorizedTaskEvidence {
    meetingId: string;
    participantId: string;
    meetingTaskId: string;
    originatingSpeakerAttemptId: string;
    executionId: string;
    sourceMessageId: string;
    sourceMessageSeq: number;
    sourceTurnId: string;
    sourceStepId: string;
    sourceContextFromSeq: number;
    sourceContextThroughSeq: number;
    resultSummary: string;
    taskStatus: "completed";
    finishedAt: number;
}

export interface AuthorizedTaskEvidenceResolver {
    resolve(input: {
        state: MeetingState;
        meetingId: string;
        participantId: string;
        taskIds: readonly string[];
    }): readonly AuthorizedTaskEvidence[];
}

export const rejectUnsupportedTaskEvidence: AuthorizedTaskEvidenceResolver = {
    resolve(input) {
        if (input.taskIds.length === 0) return [];
        throw new DomainError(
            "UNSUPPORTED_CAPABILITY",
            "MeetingTask evidence is unavailable until an authorized resolver is installed.",
            {
                entityType: "meeting",
                entityId: input.meetingId,
                meetingVersion: input.state.version
            }
        );
    }
};

export const meetingTaskEvidenceResolver: AuthorizedTaskEvidenceResolver = {
    resolve(input) {
        return input.taskIds.map((taskId) => {
            const task = (input.state.meetingTasks ?? []).find(
                (candidate) =>
                    candidate.meetingTaskId === taskId &&
                    candidate.participantId === input.participantId &&
                    candidate.status === "completed"
            );
            if (task === undefined) {
                throw new DomainError(
                    "INVALID_STATE_TRANSITION",
                    `MeetingTask ${taskId} is not a completed authorized task for this Participant.`,
                    {
                        entityType: "meeting",
                        entityId: input.meetingId,
                        meetingVersion: input.state.version
                    }
                );
            }
            const sourceMessage = (input.state.transcript ?? []).find(
                (message) =>
                    message.id === task.sourceMessageId &&
                    message.seq === task.sourceMessageSeq &&
                    message.attemptId === task.originatingSpeakerAttemptId &&
                    message.taskIds.includes(task.meetingTaskId)
            );
            if (
                task.sourceMessageId === undefined ||
                task.sourceMessageSeq === undefined ||
                sourceMessage === undefined ||
                sourceMessage.turnId !== task.sourceTurnId ||
                sourceMessage.stepId !== task.sourceStepId ||
                sourceMessage.seq < task.sourceContextFromSeq ||
                sourceMessage.seq > task.sourceContextThroughSeq ||
                task.resultSummary === undefined ||
                task.resultSummary.trim() === "" ||
                task.finishedAt === undefined ||
                !Number.isFinite(task.finishedAt)
            ) {
                throw new DomainError(
                    "INVALID_STATE_TRANSITION",
                    `MeetingTask ${taskId} has no authorized formal source.`,
                    {
                        entityType: "meeting",
                        entityId: input.meetingId,
                        meetingVersion: input.state.version
                    }
                );
            }
            return {
                meetingId: input.meetingId,
                participantId: input.participantId,
                meetingTaskId: task.meetingTaskId,
                originatingSpeakerAttemptId: task.originatingSpeakerAttemptId,
                executionId: task.executionId,
                sourceMessageId: task.sourceMessageId,
                sourceMessageSeq: task.sourceMessageSeq,
                sourceTurnId: task.sourceTurnId,
                sourceStepId: task.sourceStepId,
                sourceContextFromSeq: task.sourceContextFromSeq,
                sourceContextThroughSeq: task.sourceContextThroughSeq,
                resultSummary: task.resultSummary,
                taskStatus: "completed",
                finishedAt: task.finishedAt
            };
        });
    }
};
