import type { MeetingState } from "../domain/model.js";
import type { PersistenceProjectionV1 } from "./domain/schemas.js";

export interface MeetingDiagnostic {
    meetingId: string;
    meetingVersion: number;
    eventSeq: number;
    eventType: string;
    timestamp: number;
    turnId?: string;
    stepId?: string;
    attemptId?: string;
    deliveryId?: string;
    errorCode?: string;
    terminationCode?: string;
    metrics: Readonly<Record<string, number>>;
}
export type DiagnosticSink = (record: MeetingDiagnostic) => void;

/** Diagnostics are a detached, allowlisted projection, never a commit participant. */
export function emitDiagnostic(sink: DiagnosticSink | undefined, record: MeetingDiagnostic): void {
    try {
        sink?.(record);
    } catch {
        /* A logging failure cannot change committed facts. */
    }
}

export function observeCommit(
    sink: DiagnosticSink | undefined,
    meetingId: string,
    before: PersistenceProjectionV1 | undefined,
    after: PersistenceProjectionV1,
    now: number
): void {
    if (sink === undefined || after.snapshot === null) return;
    const state = after.snapshot.state as unknown as MeetingState;
    const previous = before?.snapshot?.state as unknown as MeetingState | undefined;
    const base = {
        meetingId,
        meetingVersion: after.snapshot.version,
        eventSeq: state.eventSeq ?? 0,
        timestamp: now
    };
    const active = ["created", "running", "waiting", "paused", "converging"].includes(state.status);
    const metrics: Record<string, number> = {
        activeMeeting: Number(active),
        waitingMeeting: Number(state.status === "waiting"),
        outboxBacklog: Object.values(after.outbox).filter(
            (item) => item.status === "pending" || item.status === "leased"
        ).length
    };
    if (typeof state.stallCount === "number") metrics.stallCount = state.stallCount;
    if (typeof state.replanCount === "number") metrics.replanCount = state.replanCount;
    if (
        previous?.status === "waiting" &&
        state.status !== "waiting" &&
        previous.waitState !== undefined
    ) {
        metrics.waitingDurationMs = Math.max(0, now - previous.waitState.waitingSince);
    }
    emitDiagnostic(sink, { ...base, eventType: "meeting.observed", metrics });
    for (const [key, event] of Object.entries(after.events)) {
        if (before?.events[key] !== undefined) continue;
        const values: Record<string, number> = {};
        const turn = previous?.currentTurn;
        const attempt = turn?.steps[turn.currentStepIndex]?.attempt;
        if (event.type === "turn.completed" && turn)
            values.turnDurationMs = Math.max(0, now - turn.createdAt);
        if (
            [
                "speaker_attempt.submitted",
                "speaker_attempt.failed",
                "speaker_attempt.revoked"
            ].includes(event.type) &&
            attempt?.startedAt !== undefined
        ) {
            values.attemptDurationMs = Math.max(0, now - attempt.startedAt);
        }
        if (event.type === "manager_plan.failed" || event.type === "manager_plan.submitted") {
            const planning = previous?.manager.currentPlanningAttempt;
            if (planning !== undefined)
                values.attemptDurationMs = Math.max(0, now - planning.createdAt);
        }
        if (event.type === "meeting.ended") values.terminations = 1;
        if (event.type === "manager_plan.failed") values.managerFallbacks = 1;
        if (event.type === "meeting.replanned") values.replans = 1;
        emitDiagnostic(sink, {
            ...base,
            eventSeq: event.eventSeq,
            meetingVersion: event.meetingVersion,
            timestamp: event.createdAt,
            eventType: event.type,
            ...(event.turnId === null ? {} : { turnId: event.turnId }),
            ...(event.attemptId === null ? {} : { attemptId: event.attemptId }),
            ...(typeof event.payload.stepId === "string" ? { stepId: event.payload.stepId } : {}),
            ...(typeof event.payload.deliveryId === "string"
                ? { deliveryId: event.payload.deliveryId }
                : {}),
            ...(event.type === "meeting.ended" && state.termination
                ? { terminationCode: state.termination.code }
                : {}),
            metrics: values
        });
    }
    for (const [id, item] of Object.entries(after.outbox)) {
        const old = before?.outbox[id];
        if (item.status === "delivered" && old?.status !== "delivered") {
            emitDiagnostic(sink, {
                ...base,
                eventType: "delivery.completed",
                deliveryId: item.deliveryId,
                metrics: { dispatchDurationMs: Math.max(0, now - item.createdAt) }
            });
        }
        if (item.status === "pending" && old?.status === "leased") {
            emitDiagnostic(sink, {
                ...base,
                eventType: "delivery.retry",
                deliveryId: item.deliveryId,
                metrics: { deliveryRetries: 1 }
            });
        }
    }
}
