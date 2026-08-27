import { DomainError, type MeetingState } from "../domain/index.js";

export interface AuthorizedTaskEvidence {
    taskId: string;
    taskAttemptId: string;
    associationId: string;
    snapshotObservedAt: number;
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
            "Task evidence is unavailable until the authorized TeamTask resolver is installed.",
            {
                entityType: "meeting",
                entityId: input.meetingId,
                meetingVersion: input.state.version
            }
        );
    }
};
