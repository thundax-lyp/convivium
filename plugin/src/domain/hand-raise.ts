import { DomainError } from "./errors.js";
import type {
    DomainEvent,
    MeetingHandRaise,
    MeetingState,
    MeetingTaskSnapshot,
    TransitionResult
} from "./model.js";

export interface CreateHandRaiseInput {
    id: string;
    participantId: string;
    reason: MeetingHandRaise["reason"];
    summary: string;
    taskIds: readonly string[];
    replyToMessageId?: string;
    agendaItemId?: string;
    priority: MeetingHandRaise["priority"];
    now: number;
}

export function createHandRaise(
    state: MeetingState,
    input: CreateHandRaiseInput
): TransitionResult<MeetingState> {
    if (state.handRaises.some((raise) => raise.id === input.id)) {
        throw new DomainError("INVALID_ENTITY_STATE", `hand raise ${input.id} already exists`);
    }
    for (const taskId of input.taskIds) {
        const task = (state.meetingTasks ?? []).find(
            (candidate) => candidate.meetingTaskId === taskId
        );
        if (task === undefined || task.participantId !== input.participantId) {
            throw new DomainError(
                "INVALID_ENTITY_STATE",
                `meeting task ${taskId} is not owned by participant ${input.participantId}`
            );
        }
    }
    if (
        input.replyToMessageId !== undefined &&
        !state.transcript.some((message) => message.id === input.replyToMessageId)
    ) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `reply target ${input.replyToMessageId} was not found in the meeting transcript`
        );
    }
    const duplicate = state.handRaises.some(
        (raise) =>
            raise.status === "pending" &&
            raise.participant === input.participantId &&
            raise.reason === input.reason &&
            raise.taskIds.join(",") === input.taskIds.join(",") &&
            raise.summary === input.summary &&
            raise.replyToMessageId === input.replyToMessageId &&
            raise.agendaItemId === input.agendaItemId &&
            raise.priority === input.priority
    );
    if (duplicate) return { state, effect: { events: [] } };
    const raise: MeetingHandRaise = {
        id: input.id,
        participant: input.participantId,
        reason: input.reason,
        summary: input.summary,
        taskIds: [...input.taskIds],
        ...(input.replyToMessageId === undefined
            ? {}
            : { replyToMessageId: input.replyToMessageId }),
        ...(input.agendaItemId === undefined ? {} : { agendaItemId: input.agendaItemId }),
        priority: input.priority,
        createdAt: input.now,
        status: "pending"
    };
    const event: DomainEvent = {
        type: "hand_raise.created",
        payload: { meetingId: state.id, handRaiseId: raise.id, participantId: raise.participant }
    };
    return {
        state: { ...state, handRaises: [...state.handRaises, raise] },
        effect: { events: [event] }
    };
}

export function consumeHandRaise(
    state: MeetingState,
    handRaiseId: string
): TransitionResult<MeetingState> {
    const raise = state.handRaises.find((candidate) => candidate.id === handRaiseId);
    if (raise === undefined || raise.status !== "pending") {
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            `hand raise ${handRaiseId} is not pending`
        );
    }
    return {
        state: {
            ...state,
            handRaises: state.handRaises.map((candidate) =>
                candidate.id === handRaiseId
                    ? { ...candidate, status: "consumed" as const }
                    : candidate
            )
        },
        effect: { events: [] }
    };
}

export function participantHasActiveMeetingTask(
    state: MeetingState,
    participantId: string
): boolean {
    return (state.meetingTasks ?? []).some(
        (task) =>
            task.participantId === participantId &&
            ["requested", "queued", "running"].includes(task.status)
    );
}

export function taskSnapshot(
    state: MeetingState,
    meetingTaskId: string,
    now: number
): MeetingTaskSnapshot {
    const task = (state.meetingTasks ?? []).find(
        (candidate) => candidate.meetingTaskId === meetingTaskId
    );
    if (task === undefined)
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting task ${meetingTaskId} was not found`
        );
    return {
        meetingTaskId,
        status: task.status,
        ...(task.resultSummary === undefined ? {} : { resultSummary: task.resultSummary }),
        observedAt: now
    };
}

export function completedTaskSnapshots(
    state: MeetingState,
    participantId: string,
    now: number
): MeetingTaskSnapshot[] {
    return (state.meetingTasks ?? [])
        .filter((task) => task.participantId === participantId && task.status === "completed")
        .map((task) => taskSnapshot(state, task.meetingTaskId, now));
}
