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
type DurableOutboxItem = PersistenceProjectionV1["outbox"][string];

function targetLifecycle(value: unknown): string | undefined {
    const isRecord = (item: unknown): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && !Array.isArray(item);
    if (!isRecord(value) || !isRecord(value.lifecycle)) return undefined;
    return typeof value.lifecycle.status === "string" ? value.lifecycle.status : undefined;
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
    const rawState: unknown = after.snapshot.state;
    const lifecycle = targetLifecycle(rawState);
    const base = {
        meetingId,
        meetingVersion: after.snapshot.version,
        eventSeq: 0,
        timestamp: now,
        ...(commandKind === undefined ? {} : { commandKind })
    };
    emitDiagnostic(sink, {
        ...base,
        eventType: "meeting.observed",
        metrics: {
            activeMeeting: Number(
                lifecycle !== undefined && !["archived", "cancelled", "failed"].includes(lifecycle)
            ),
            waitingMeeting: 0,
            outboxBacklog: Object.values(after.outbox).filter(
                (item) => item.status === "pending" || item.status === "leased"
            ).length
        }
    });
    for (const [id, item] of Object.entries(after.outbox)) {
        emitOutboxDiagnostics(sink, base, item, before?.outbox[id], now);
    }
}
