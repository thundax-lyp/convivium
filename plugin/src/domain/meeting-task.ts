import { DomainError } from "./errors.js";
import type { MeetingState, MeetingTask, MeetingTaskStatus, TransitionResult } from "./model.js";

const activeStatuses: readonly MeetingTaskStatus[] = ["requested", "queued", "running"];
const executionTerminalStatuses = new Set([
    "completed",
    "partial",
    "no_consensus",
    "cancelled",
    "failed",
    "archiving",
    "archived"
]);

function requireTaskExecutionActive(state: MeetingState): void {
    if (executionTerminalStatuses.has(state.status)) {
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            `meeting ${state.id} does not accept MeetingTask writes after execution terminal state`
        );
    }
}

function taskEvent(
    meetingId: string,
    type:
        | "meeting_task.created"
        | "meeting_task.queued"
        | "meeting_task.started"
        | "meeting_task.completed"
        | "meeting_task.failed"
        | "meeting_task.cancelled",
    task: MeetingTask
) {
    return {
        type,
        payload: {
            meetingId,
            meetingTaskId: task.meetingTaskId,
            participantId: task.participantId,
            status: task.status
        }
    } as const;
}

function requireTask(state: MeetingState, meetingTaskId: string): MeetingTask {
    const task = (state.meetingTasks ?? []).find(
        (candidate) => candidate.meetingTaskId === meetingTaskId
    );
    if (!task) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting task ${meetingTaskId} was not found`
        );
    }
    return task;
}

export interface CreateMeetingTaskInput {
    meetingTaskId: string;
    executionId: string;
    deliveryId: string;
    participantId: string;
    originatingSpeakerAttemptId: string;
    sourceTurnId: string;
    sourceStepId: string;
    sourceContextFromSeq: number;
    sourceContextThroughSeq: number;
    title: string;
    description: string;
    blocking: boolean;
    now: number;
}

export function createMeetingTask(
    state: MeetingState,
    input: CreateMeetingTaskInput
): TransitionResult<MeetingState> {
    requireTaskExecutionActive(state);
    if ((state.meetingTasks ?? []).some((task) => task.meetingTaskId === input.meetingTaskId)) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting task ${input.meetingTaskId} already exists`
        );
    }
    if (
        (state.meetingTasks ?? []).some(
            (task) =>
                task.participantId === input.participantId && activeStatuses.includes(task.status)
        )
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `participant ${input.participantId} already owns an active meeting task`
        );
    }
    const task: MeetingTask = {
        ...input,
        status: "requested",
        createdAt: input.now
    };
    return {
        state: { ...state, meetingTasks: [...(state.meetingTasks ?? []), task] },
        effect: { events: [taskEvent(state.id, "meeting_task.created", task)] }
    };
}

export function queueMeetingTasks(
    state: MeetingState,
    meetingTaskIds: readonly string[],
    participantId: string,
    originatingSpeakerAttemptId: string,
    now: number
): TransitionResult<MeetingState> {
    requireTaskExecutionActive(state);
    const uniqueIds = [...new Set(meetingTaskIds)];
    const tasks = uniqueIds.map((id) => requireTask(state, id));
    if (
        tasks.some(
            (task) =>
                task.participantId !== participantId ||
                task.originatingSpeakerAttemptId !== originatingSpeakerAttemptId
        )
    ) {
        throw new DomainError(
            "STALE_ATTEMPT",
            "MeetingTasks can only be queued by their originating Participant attempt"
        );
    }
    if (tasks.some((task) => task.status !== "requested")) {
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            "only requested MeetingTasks can be queued"
        );
    }
    const sourceMessages = tasks.map((task) =>
        state.transcript.find(
            (message) =>
                message.attemptId === originatingSpeakerAttemptId &&
                message.taskIds.includes(task.meetingTaskId)
        )
    );
    if (sourceMessages.some((message) => message === undefined)) {
        throw new DomainError(
            "STALE_ATTEMPT",
            "requested MeetingTasks require their originating formal message"
        );
    }
    const queued = new Set(uniqueIds);
    const nextTasks = (state.meetingTasks ?? []).map((task) =>
        queued.has(task.meetingTaskId)
            ? {
                  ...task,
                  status: "queued" as const,
                  queuedAt: now,
                  sourceMessageId:
                      sourceMessages[
                          tasks.findIndex(
                              (candidate) => candidate.meetingTaskId === task.meetingTaskId
                          )
                      ]!.id,
                  sourceMessageSeq:
                      sourceMessages[
                          tasks.findIndex(
                              (candidate) => candidate.meetingTaskId === task.meetingTaskId
                          )
                      ]!.seq
              }
            : task
    );
    return {
        state: { ...state, meetingTasks: nextTasks },
        effect: {
            events: tasks.map((task) =>
                taskEvent(state.id, "meeting_task.queued", { ...task, status: "queued" })
            )
        }
    };
}

export function startMeetingTask(state: MeetingState, meetingTaskId: string, now: number) {
    requireTaskExecutionActive(state);
    const task = requireTask(state, meetingTaskId);
    if (task.status !== "queued") {
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            `meeting task ${meetingTaskId} is not queued`
        );
    }
    const next = { ...task, status: "running" as const, startedAt: now };
    return {
        state: {
            ...state,
            meetingTasks: (state.meetingTasks ?? []).map((item) =>
                item.meetingTaskId === meetingTaskId ? next : item
            )
        },
        effect: { events: [taskEvent(state.id, "meeting_task.started", next)] }
    };
}

export function finishMeetingTask(
    state: MeetingState,
    meetingTaskId: string,
    input: {
        status: "completed" | "failed";
        now: number;
        resultSummary?: string;
        failureReason?: string;
    }
) {
    requireTaskExecutionActive(state);
    const task = requireTask(state, meetingTaskId);
    if (task.status !== "running") {
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            `meeting task ${meetingTaskId} is not running`
        );
    }
    const next: MeetingTask = {
        ...task,
        status: input.status,
        finishedAt: input.now,
        ...(input.resultSummary === undefined ? {} : { resultSummary: input.resultSummary }),
        ...(input.failureReason === undefined ? {} : { failureReason: input.failureReason })
    };
    return {
        state: {
            ...state,
            meetingTasks: (state.meetingTasks ?? []).map((item) =>
                item.meetingTaskId === meetingTaskId ? next : item
            )
        },
        effect: {
            events: [
                taskEvent(
                    state.id,
                    input.status === "completed" ? "meeting_task.completed" : "meeting_task.failed",
                    next
                )
            ]
        }
    };
}

export function cancelNonTerminalMeetingTasks(
    state: MeetingState,
    now: number
): TransitionResult<MeetingState> {
    const cancelled = (state.meetingTasks ?? []).filter((task) =>
        activeStatuses.includes(task.status)
    );
    if (cancelled.length === 0) return { state, effect: { events: [] } };
    const nextTasks = (state.meetingTasks ?? []).map((task) =>
        activeStatuses.includes(task.status)
            ? { ...task, status: "cancelled" as const, finishedAt: now }
            : task
    );
    return {
        state: { ...state, meetingTasks: nextTasks },
        effect: {
            events: cancelled.map((task) =>
                taskEvent(state.id, "meeting_task.cancelled", { ...task, status: "cancelled" })
            )
        }
    };
}
