import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    followupManagerSession,
    followupMeetingMailSession,
    followupMeetingTaskSession,
    followupParticipantSession
} from "../../dsh/index.js";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { isParticipantDispatchableNow, type MeetingState } from "../../domain/index.js";
import {
    projectManagerMeetingContext,
    projectSpeakerMeetingContext
} from "../../projection/index.js";
import { RepositoryError } from "../../repository/errors.js";
import type { OutboxItem } from "../../repository/types.js";
import type { MeetingRepositoryRuntime } from "../meeting-runtime.js";
import { createOutboxWorker } from "../outbox-worker.js";
import type { MeetingDeliveryWorkerService } from "./types.js";

function terminalDispatchError(code: string, message: string): Error {
    return Object.assign(new Error(message), { code, retryable: false });
}

function waitForMailState(delayMs: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason ?? new Error("Mail dispatch stopped"));
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason ?? new Error("Mail dispatch stopped"));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);
        signal.addEventListener("abort", onAbort, { once: true });
    });
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
    readonly continuable: Pick<SubagentRuntime, "followup">;
    readonly now?: () => number;
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

/** Persists timeout first; interrupt is deliberately independent best effort. */
export async function scanMeetingMailTimeouts(input: {
    readonly repository: MeetingRepositoryRuntime;
    readonly parent: Agent;
    readonly continuable: Pick<SubagentRuntime, "followup"> &
        Partial<Pick<SubagentRuntime, "interrupt">>;
    readonly now: number;
}): Promise<number> {
    const overdue = await input.repository.listOverduePrivateMeetingMail(input.now);
    let timedOut = 0;
    for (const mail of overdue) {
        try {
            const snapshot = await input.repository.read();
            await input.repository.finishPrivateMeetingMail({
                requestId: `mail-timeout:${mail.handlingAttemptId}`,
                requestHash: `${mail.handlingAttemptId}\0${mail.deadlineAt}`,
                authorization: {
                    callerBinding: "runtime:convivium",
                    capabilityId: "runtime:mail"
                },
                expectedMeetingVersion: snapshot.version,
                mailId: mail.mailId,
                handlingAttemptId: mail.handlingAttemptId,
                deliveryId: mail.deliveryId!,
                status: "timed_out",
                now: input.now
            });
        } catch (error) {
            if (
                error instanceof RepositoryError &&
                ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "INVALID_STATE"].includes(error.code)
            )
                continue;
            throw error;
        }
        timedOut += 1;
        const recovered = await input.repository.recover();
        const ownership = recovered.sessionOwnership.find(
            (candidate) =>
                candidate.role === "participant" &&
                candidate.participantId === mail.recipientParticipantId &&
                candidate.parentSessionId === String(input.parent.id)
        );
        if (ownership !== undefined && input.continuable.interrupt !== undefined) {
            try {
                input.continuable.interrupt(ownership.sessionId as SessionId, {
                    kind: "ancestor",
                    agent: input.parent
                });
            } catch {
                // The durable timeout is authoritative even when DSH interrupt fails.
            }
        }
    }
    return timedOut;
}

/** Performs one committed delivery and rechecks authorization at the DSH boundary. */
export function createMeetingDeliveryDispatcher(
    options: MeetingDeliveryDispatcherOptions
): MeetingDeliveryDispatcher {
    const participantQueues = new Map<string, Promise<void>>();

    function enqueueParticipant<T>(participantId: string, operation: () => Promise<T>): Promise<T> {
        const previous = participantQueues.get(participantId) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(operation);
        participantQueues.set(
            participantId,
            next.then(
                () => undefined,
                () => undefined
            )
        );
        return next;
    }
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

    async function dispatchMail(input: MeetingDeliveryInput): Promise<void> {
        const payload = input.item.payload as {
            role: "meeting_mail";
            mailId: string;
            participantId: string;
        };
        const now = options.now?.() ?? Date.now();
        const snapshot = await input.repository.read();
        const state = snapshot.state as unknown as MeetingState;
        requireDispatchableMeeting(state);
        const timeout = state.limits.mailHandlingTimeoutMs;
        if (!Number.isFinite(timeout) || timeout === undefined || timeout <= 0) {
            throw terminalDispatchError(
                "UNSUPPORTED_CAPABILITY",
                "Mail handling timeout is unavailable."
            );
        }
        await input.repository.startPrivateMeetingMail({
            requestId: `mail-processing:${payload.mailId}`,
            requestHash: `${payload.mailId}\0${input.item.deliveryId}`,
            authorization: {
                callerBinding: "runtime:convivium",
                capabilityId: "runtime:mail"
            },
            expectedMeetingVersion: snapshot.version,
            mailId: payload.mailId,
            deliveryId: input.item.deliveryId,
            processingThroughSeq: state.messageSeq,
            deadlineAt: now + timeout,
            now
        });
        const recovered = await input.repository.recover();
        const mail = await input.repository.readPrivateMeetingMail(payload.mailId);
        const processingState = recovered.snapshot?.state as unknown as MeetingState | undefined;
        const ownership = recovered.sessionOwnership.find(
            (candidate) =>
                candidate.role === "participant" &&
                candidate.participantId === payload.participantId &&
                candidate.lifecycleStatus === "active" &&
                candidate.capabilityStatus === "active"
        );
        if (
            mail === undefined ||
            mail.recipientParticipantId !== payload.participantId ||
            ownership === undefined ||
            ownership.parentSessionId !== String(input.parent.id)
        ) {
            throw terminalDispatchError(
                "SESSION_CAPABILITY_REVOKED",
                "Mail Participant Session is unavailable."
            );
        }
        await followupMeetingMailSession({
            runtime: options.continuable,
            parent: input.parent,
            ownership,
            participantId: payload.participantId,
            prompt: [
                {
                    type: "text",
                    text: JSON.stringify({
                        kind: "meeting_mail",
                        mailId: mail.mailId,
                        senderParticipantId: mail.senderParticipantId,
                        content: mail.content,
                        meetingContext: mail.meetingContext,
                        transcriptDelta: (processingState?.transcript ?? []).filter(
                            (message) =>
                                message.seq > mail.snapshotThroughSeq &&
                                message.seq <=
                                    (mail.processingThroughSeq ?? mail.snapshotThroughSeq)
                        ),
                        processingThroughSeq: mail.processingThroughSeq,
                        handlingAttemptId: mail.handlingAttemptId,
                        deliveryId: mail.deliveryId,
                        instruction:
                            "After handling, call convivium_finish_meeting_mail with mailId, handlingAttemptId, deliveryId and a terminal status. Mail content must not enter transcript, decisions, or completion facts; use convivium_raise_hand for public discussion and convivium_create_meeting_task for long work."
                    })
                }
            ],
            signal: input.signal,
            authorize: async () => {
                const active = await input.repository.readPrivateMeetingMail(payload.mailId);
                if (
                    active?.status !== "processing" ||
                    active.deliveryId !== input.item.deliveryId
                ) {
                    throw terminalDispatchError(
                        "STALE_MAIL_ATTEMPT",
                        "Mail handling is no longer authorized."
                    );
                }
            }
        });

        const leaseTtlMs = Math.max(1, input.item.leaseDeadline - now);
        let leaseDeadline = input.item.leaseDeadline;
        for (;;) {
            const active = await input.repository.readPrivateMeetingMail(payload.mailId);
            if (active?.status !== "processing") return;
            const currentNow = options.now?.() ?? Date.now();
            if (leaseDeadline - currentNow <= leaseTtlMs / 2) {
                leaseDeadline = await input.repository.renewOutboxLease({
                    id: input.item.id,
                    leaseOwner: input.item.leaseOwner,
                    leaseToken: input.item.leaseToken,
                    ttlMs: leaseTtlMs,
                    now: currentNow
                });
            }
            if (active.deadlineAt !== undefined && active.deadlineAt <= currentNow) {
                await scanMeetingMailTimeouts({
                    repository: input.repository,
                    parent: input.parent,
                    continuable: options.continuable,
                    now: currentNow
                });
                continue;
            }
            const remaining = Math.max(1, (active.deadlineAt ?? currentNow + 25) - currentNow);
            await waitForMailState(Math.min(25, remaining), input.signal);
        }
    }

    return {
        async dispatch(input) {
            const payload = input.item.payload as { role?: string };
            if (payload.role === "manager") return dispatchManager(input);
            const participantId = (input.item.payload as { participantId?: string }).participantId;
            const operation = () => {
                if (payload.role === "meeting_task") return dispatchTask(input);
                if (payload.role === "meeting_mail") return dispatchMail(input);
                return dispatchParticipant(input);
            };
            return participantId === undefined
                ? operation()
                : enqueueParticipant(participantId, operation);
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
                beforeRun: input.scan,
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
