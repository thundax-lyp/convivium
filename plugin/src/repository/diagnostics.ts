import type { LegacyMeetingState } from "@/domain/index.js";
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
    outboxKind?: string;
    commandKind?: string;
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

type DiagnosticBase = Pick<
    MeetingDiagnostic,
    "meetingId" | "meetingVersion" | "eventSeq" | "timestamp" | "commandKind"
>;
type DurableEvent = PersistenceProjectionV1["events"][string];
type DurableOutboxItem = PersistenceProjectionV1["outbox"][string];

function observedMetrics(
    after: PersistenceProjectionV1,
    state: LegacyMeetingState,
    previous: LegacyMeetingState | undefined,
    now: number
): Record<string, number> {
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
    return metrics;
}

function eventDiagnostic(
    base: DiagnosticBase,
    event: DurableEvent,
    state: LegacyMeetingState,
    previous: LegacyMeetingState | undefined,
    now: number
): MeetingDiagnostic {
    const values: Record<string, number> = {};
    const attemptId =
        event.attemptId ??
        (typeof event.payload.attemptId === "string"
            ? event.payload.attemptId
            : typeof event.payload.planningAttemptId === "string"
              ? event.payload.planningAttemptId
              : undefined);
    const turns = [previous?.currentTurn, state.currentTurn];
    const matchingTurn =
        attemptId === undefined
            ? undefined
            : turns.find((candidate) =>
                  candidate?.steps.some((step) => step.attempt?.attemptId === attemptId)
              );
    const step = matchingTurn?.steps.find(
        (candidate) => candidate.attempt?.attemptId === attemptId
    );
    const attempt = step?.attempt;
    const turn = previous?.currentTurn;
    if (event.type === "turn.completed" && turn)
        values.turnDurationMs = Math.max(0, now - turn.createdAt);
    if (
        ["speaker_attempt.submitted", "speaker_attempt.failed", "speaker_attempt.revoked"].includes(
            event.type
        ) &&
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
    return {
        ...base,
        eventSeq: event.eventSeq,
        meetingVersion: event.meetingVersion,
        timestamp: event.createdAt,
        eventType: event.type,
        ...(event.turnId !== null
            ? { turnId: event.turnId }
            : typeof event.payload.turnId === "string"
              ? { turnId: event.payload.turnId }
              : matchingTurn === undefined
                ? {}
                : { turnId: matchingTurn.id }),
        ...(attemptId === undefined ? {} : { attemptId }),
        ...(typeof event.payload.stepId === "string"
            ? { stepId: event.payload.stepId }
            : step === undefined
              ? {}
              : { stepId: step.id }),
        ...(typeof event.payload.deliveryId === "string"
            ? { deliveryId: event.payload.deliveryId }
            : attempt === undefined
              ? {}
              : { deliveryId: attempt.deliveryId }),
        ...(event.type === "meeting.ended" && state.termination
            ? { terminationCode: state.termination.code }
            : {}),
        metrics: values
    };
}

function emitOutboxDiagnostics(
    sink: DiagnosticSink,
    base: DiagnosticBase,
    item: DurableOutboxItem,
    old: DurableOutboxItem | undefined,
    now: number
): void {
    const identity = {
        deliveryId: item.deliveryId,
        outboxKind: item.kind,
        ...(typeof item.payload.turnId === "string" ? { turnId: item.payload.turnId } : {}),
        ...(typeof item.payload.stepId === "string" ? { stepId: item.payload.stepId } : {}),
        ...(typeof item.payload.attemptId === "string"
            ? { attemptId: item.payload.attemptId }
            : typeof item.payload.planningAttemptId === "string"
              ? { attemptId: item.payload.planningAttemptId }
              : {})
    };
    if (item.status === "delivered" && old?.status !== "delivered") {
        emitDiagnostic(sink, {
            ...base,
            eventType: "delivery.completed",
            ...identity,
            metrics: { dispatchDurationMs: Math.max(0, now - item.createdAt) }
        });
    }
    if (item.status === "pending" && old?.status === "leased") {
        emitDiagnostic(sink, {
            ...base,
            eventType: "delivery.retry",
            ...identity,
            metrics: { deliveryRetries: 1 }
        });
    }
}

export function observeCommit(
    sink: DiagnosticSink | undefined,
    meetingId: string,
    before: PersistenceProjectionV1 | undefined,
    after: PersistenceProjectionV1,
    now: number,
    commandKind?: string
): void {
    if (sink === undefined || after.snapshot === null) return;
    const state = after.snapshot.state as unknown as LegacyMeetingState;
    const previous = before?.snapshot?.state as unknown as LegacyMeetingState | undefined;
    const base = {
        meetingId,
        meetingVersion: after.snapshot.version,
        eventSeq: state.eventSeq ?? 0,
        timestamp: now,
        ...(commandKind === undefined ? {} : { commandKind })
    };
    emitDiagnostic(sink, {
        ...base,
        eventType: "meeting.observed",
        metrics: observedMetrics(after, state, previous, now)
    });
    for (const [key, event] of Object.entries(after.events)) {
        if (before?.events[key] !== undefined) continue;
        emitDiagnostic(sink, eventDiagnostic(base, event, state, previous, now));
    }
    for (const [id, item] of Object.entries(after.outbox)) {
        emitOutboxDiagnostics(sink, base, item, before?.outbox[id], now);
    }
}
