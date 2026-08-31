import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    followupManagerSession,
    followupMeetingTaskSession,
    followupParticipantSession,
    type ContinuableFollowupRuntime
} from "../../dsh/index.js";
import { isParticipantDispatchableNow, type MeetingState } from "../../domain/index.js";
import {
    projectManagerMeetingContext,
    projectSpeakerMeetingContext
} from "../../projection/index.js";
import type { OutboxItem } from "../../repository/index.js";
import type { MeetingRepositoryRuntime } from "../meeting-runtime.js";
import { createOutboxWorker } from "../outbox-worker.js";
import type { MeetingDeliveryWorkerService } from "./types.js";

function terminalDispatchError(code: string, message: string): Error {
    return Object.assign(new Error(message), { code, retryable: false });
}

function requireDispatchableMeeting(
    state: MeetingState | undefined
): asserts state is MeetingState {
    if (
        state === undefined ||
        [
            "completed",
            "partial",
            "no_consensus",
            "cancelled",
            "failed",
            "archiving",
            "archived"
        ].includes(state.status)
    ) {
        throw terminalDispatchError(
            "MEETING_NOT_DISPATCHABLE",
            "Meeting is terminal or archiving and cannot dispatch work."
        );
    }
}

export interface MeetingDeliveryDispatcherOptions {
    readonly continuable: ContinuableFollowupRuntime;
}

export interface MeetingDeliveryInput {
    readonly repository: MeetingRepositoryRuntime;
    readonly parent: Agent;
    readonly meetingId: string;
    readonly signal: AbortSignal;
    readonly item: OutboxItem;
}

export interface MeetingDeliveryDispatcher {
    dispatch(input: MeetingDeliveryInput): Promise<void>;
}

/** Performs one committed delivery and rechecks authorization at the DSH boundary. */
export function createMeetingDeliveryDispatcher(
    options: MeetingDeliveryDispatcherOptions
): MeetingDeliveryDispatcher {
    async function dispatchParticipant(input: MeetingDeliveryInput): Promise<void> {
        const recovered = await input.repository.recover();
        const state = recovered.snapshot?.state as unknown as MeetingState | undefined;
        requireDispatchableMeeting(state);
        const payload = input.item.payload as unknown as {
            participantId: string;
            attemptId: string;
            turnId: string;
        };
        const ownership = recovered.sessionOwnership.find(
            (candidate) => candidate.participantId === payload.participantId
        );
        if (ownership === undefined) {
            throw terminalDispatchError(
                "SESSION_OWNERSHIP_MISSING",
                "Initial speaker Session ownership is missing."
            );
        }
        if (
            ownership.parentSessionId !== String(input.parent.id) ||
            ownership.lifecycleStatus !== "active" ||
            ownership.capabilityStatus !== "active"
        ) {
            throw terminalDispatchError(
                "SESSION_CAPABILITY_REVOKED",
                "Speaker Session ownership is no longer authorized."
            );
        }
        await followupParticipantSession({
            runtime: options.continuable,
            parent: input.parent,
            ownership,
            attempt: {
                attemptId: payload.attemptId,
                deliveryId: input.item.deliveryId,
                participantId: payload.participantId
            },
            prompt: [
                {
                    type: "text",
                    text: `Meeting ${input.meetingId} speaker context: ${JSON.stringify(
                        projectSpeakerMeetingContext(
                            state,
                            payload.participantId,
                            payload.attemptId
                        )
                    )}`
                }
            ],
            signal: input.signal,
            authorize: async ({ attempt }) => {
                const latest = await input.repository.recover();
                const current = latest.snapshot?.state as unknown as MeetingState | undefined;
                const active = current?.currentTurn?.steps.find(
                    (step) => step.attempt?.attemptId === attempt.attemptId
                )?.attempt;
                if (
                    active?.deliveryId !== attempt.deliveryId ||
                    active.status !== "running" ||
                    !["pending", "accepted"].includes(active.deliveryStatus)
                ) {
                    throw terminalDispatchError(
                        "STALE_SPEAKER_ATTEMPT",
                        "Speaker attempt is no longer authorized."
                    );
                }
                const owned = latest.sessionOwnership.find(
                    (candidate) => candidate.sessionId === ownership.sessionId
                );
                if (owned?.lifecycleStatus !== "active" || owned.capabilityStatus !== "active") {
                    throw terminalDispatchError(
                        "SESSION_CAPABILITY_REVOKED",
                        "Speaker Session capability is no longer active."
                    );
                }
            }
        });
    }

    async function dispatchManager(input: MeetingDeliveryInput): Promise<void> {
        const recovered = await input.repository.recover();
        const payload = input.item.payload as unknown as {
            role: "manager";
            planningAttemptId: string;
        };
        const ownership = recovered.sessionOwnership.find(
            (candidate) => candidate.role === "manager"
        );
        if (ownership === undefined) {
            throw terminalDispatchError(
                "SESSION_OWNERSHIP_MISSING",
                "Manager Session ownership is missing."
            );
        }
        if (
            ownership.parentSessionId !== String(input.parent.id) ||
            ownership.lifecycleStatus !== "active" ||
            ownership.capabilityStatus !== "active"
        ) {
            throw terminalDispatchError(
                "SESSION_CAPABILITY_REVOKED",
                "Manager Session ownership is no longer authorized."
            );
        }
        const state = recovered.snapshot?.state as unknown as MeetingState | undefined;
        requireDispatchableMeeting(state);
        const dispatchableParticipantIds = state.participants
            .filter(
                (participant) =>
                    isParticipantDispatchableNow(state, participant) &&
                    recovered.sessionOwnership.some(
                        (candidate) =>
                            candidate.role === "participant" &&
                            candidate.participantId === participant.id &&
                            candidate.lifecycleStatus === "active" &&
                            candidate.capabilityStatus === "active"
                    )
            )
            .map((participant) => participant.id);
        await followupManagerSession({
            runtime: options.continuable,
            parent: input.parent,
            ownership,
            attempt: {
                planningAttemptId: payload.planningAttemptId,
                deliveryId: input.item.deliveryId
            },
            prompt: [
                {
                    type: "text",
                    text: JSON.stringify(
                        projectManagerMeetingContext(state, dispatchableParticipantIds)
                    )
                }
            ],
            signal: input.signal,
            authorize: async ({ attempt }) => {
                const latest = await input.repository.recover();
                const current = latest.snapshot?.state as unknown as MeetingState | undefined;
                const active = current?.manager.currentPlanningAttempt;
                if (
                    active?.id !== attempt.planningAttemptId ||
                    active.deliveryId !== attempt.deliveryId ||
                    active.status !== "running"
                ) {
                    throw terminalDispatchError(
                        "STALE_MANAGER_ATTEMPT",
                        "Manager planning attempt is no longer authorized."
                    );
                }
            }
        });
    }

    async function dispatchTask(input: MeetingDeliveryInput): Promise<void> {
        const recovered = await input.repository.recover();
        const payload = input.item.payload as unknown as {
            meetingTaskId: string;
            participantId: string;
            executionId: string;
        };
        const state = recovered.snapshot?.state as unknown as MeetingState | undefined;
        requireDispatchableMeeting(state);
        const task = state.meetingTasks?.find(
            (candidate) =>
                candidate.meetingTaskId === payload.meetingTaskId &&
                candidate.participantId === payload.participantId
        );
        if (task === undefined || task.status !== "queued") {
            throw terminalDispatchError(
                "MEETING_TASK_NOT_QUEUED",
                "MeetingTask is no longer queued."
            );
        }
        const ownership = recovered.sessionOwnership.find(
            (candidate) =>
                candidate.role === "participant" &&
                candidate.participantId === task.participantId &&
                candidate.lifecycleStatus === "active" &&
                candidate.capabilityStatus === "active"
        );
        if (ownership === undefined || ownership.parentSessionId !== String(input.parent.id)) {
            throw terminalDispatchError(
                "SESSION_CAPABILITY_REVOKED",
                "Task Participant Session is unavailable."
            );
        }
        await followupMeetingTaskSession({
            runtime: options.continuable,
            parent: input.parent,
            ownership,
            meetingTaskId: task.meetingTaskId,
            deliveryId: input.item.deliveryId,
            prompt: [
                {
                    type: "text",
                    text: [
                        `Execute MeetingTask ${task.meetingTaskId}: ${task.title}`,
                        `executionId: ${task.executionId}`,
                        `deliveryId: ${task.deliveryId}`,
                        task.description,
                        "Call convivium_start_meeting_task with deliveryId as requestId before executing, then call convivium_finish_meeting_task with executionId when done."
                    ].join("\n")
                }
            ],
            signal: input.signal,
            authorize: async (phase) => {
                const latest = await input.repository.recover();
                const current = latest.snapshot?.state as unknown as MeetingState | undefined;
                const currentTask = current?.meetingTasks.find(
                    (candidate) => candidate.meetingTaskId === task.meetingTaskId
                );
                const meetingTerminal = [
                    "completed",
                    "partial",
                    "no_consensus",
                    "cancelled",
                    "failed",
                    "archiving",
                    "archived"
                ].includes(current?.status ?? "");
                const allowed =
                    phase === "before"
                        ? !meetingTerminal && currentTask?.status === "queued"
                        : !meetingTerminal &&
                          ["queued", "running", "completed", "failed"].includes(
                              currentTask?.status ?? ""
                          );
                if (!allowed) {
                    throw terminalDispatchError(
                        "MEETING_TASK_NOT_EXECUTABLE",
                        "MeetingTask is no longer executable."
                    );
                }
            }
        });
    }

    return {
        async dispatch(input) {
            const payload = input.item.payload as { role?: string };
            if (payload.role === "manager") return dispatchManager(input);
            if (payload.role === "meeting_task") return dispatchTask(input);
            return dispatchParticipant(input);
        }
    };
}

export interface MeetingDeliveryWorkerServiceOptions {
    readonly pollMs: number;
    readonly now?: () => number;
}

/** Owns worker lifecycle; it deliberately knows nothing about meeting commands. */
export function createMeetingDeliveryWorkerService(
    options: MeetingDeliveryWorkerServiceOptions
): MeetingDeliveryWorkerService {
    const workers = new Map<string, ReturnType<typeof createOutboxWorker>>();

    return {
        ensure(input) {
            if (input.parent === undefined || workers.has(input.meetingId)) return;
            const worker = createOutboxWorker({
                repository: input.repository,
                owner: `worker:${input.meetingId}`,
                ttlMs: 60_000,
                batchSize: 1,
                pollMs: options.pollMs,
                dispatch: input.dispatch,
                now: options.now
            });
            workers.set(input.meetingId, worker);
            void worker.start().catch(() => undefined);
        },
        wake(meetingId) {
            workers.get(meetingId)?.wake();
        },
        async dispose() {
            for (const worker of workers.values()) worker.stop();
            await Promise.all([...workers.values()].map((worker) => worker.wait()));
            workers.clear();
        }
    };
}
