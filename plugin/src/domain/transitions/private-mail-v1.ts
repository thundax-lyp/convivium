import {
    validateMeetingStateV1,
    type EpochMs,
    type MeetingState,
    type OpaqueId,
    type PrivateMailV1
} from "@/domain/index.js";
import { rejectedTransitionV1 as reject, type MeetingTransitionResultV1 } from "./result-v1.js";

export interface SendPrivateMailInputV1 {
    mailId: OpaqueId;
    senderId: OpaqueId;
    recipientId: OpaqueId;
    agendaId?: OpaqueId;
    body: string;
    relatedIds: readonly OpaqueId[];
    now: EpochMs;
}
export interface StartPrivateMailInputV1 {
    mailId: OpaqueId;
    actorKind: "effect_dispatcher";
    now: EpochMs;
}
export interface CompletePrivateMailInputV1 {
    mailId: OpaqueId;
    recipientId: OpaqueId;
    now: EpochMs;
}
export interface CancelPrivateMailInputV1 {
    mailId: OpaqueId;
    senderId: OpaqueId;
    reason: string;
    now: EpochMs;
}
export interface ExpirePrivateMailInputV1 {
    mailId: OpaqueId;
    actorKind: "deadline_handler";
    reason: string;
    now: EpochMs;
}
const terminal = new Set([
    "withdrawn",
    "submission_missing",
    "timed_out",
    "supplement_rejected",
    "closed"
]);
const valid = (n: number) => Number.isSafeInteger(n) && n >= 0;
const stateCheck = (s: MeetingState) => {
    const r = validateMeetingStateV1(s);
    return r.kind === "invalid"
        ? reject(s, "INVALID_ARGUMENT", "invalid meeting state")
        : undefined;
};
function busy(s: MeetingState, id: string, except?: string) {
    return (
        s.privateMails.some(
            (m) => m.id !== except && m.recipientId === id && m.status === "processing"
        ) || s.contributions.some((c) => c.contributorId === id && !terminal.has(c.status))
    );
}
export function sendPrivateMailV1(
    s: MeetingState,
    i: SendPrivateMailInputV1
): MeetingTransitionResultV1 {
    const bad = stateCheck(s);
    if (bad) return bad;
    const text = (value: unknown): value is string =>
        typeof value === "string" && value.trim().length > 0;
    const ids = (value: unknown): value is readonly string[] =>
        Array.isArray(value) && value.every(text);
    if (
        !i ||
        !text(i.mailId) ||
        !text(i.senderId) ||
        !text(i.recipientId) ||
        !text(i.body) ||
        (i.agendaId !== undefined && !text(i.agendaId)) ||
        !valid(i.now) ||
        !ids(i.relatedIds) ||
        i.relatedIds.length === 0 ||
        new Set(i.relatedIds).size !== i.relatedIds.length
    )
        return reject(s, "INVALID_ARGUMENT", "invalid private mail input");
    if (!s.identities.some((x) => x.id === i.senderId))
        return reject(s, "UNAUTHORIZED", "sender not found", i.senderId);
    if (["terminal", "archiving", "archived"].includes(s.lifecycle.status))
        return reject(s, "MEETING_TERMINAL", "meeting is terminal");
    if (s.lifecycle.status !== "running")
        return reject(s, "INVALID_STATE", "meeting is not running");
    if (i.senderId === i.recipientId)
        return reject(s, "PRECONDITION_FAILED", "sender and recipient must differ");
    if (!s.identities.some((x) => x.id === i.recipientId))
        return reject(s, "NOT_FOUND", "recipient not found", i.recipientId);
    if (i.agendaId !== undefined && !s.agenda.some((x) => x.id === i.agendaId))
        return reject(s, "NOT_FOUND", "agenda not found", i.agendaId);
    if (s.privateMails.some((x) => x.id === i.mailId))
        return reject(s, "INVALID_ARGUMENT", "mail id already exists", i.mailId);
    const pubs = new Set([...s.publications.map((x) => x.id), ...s.messages.map((x) => x.id)]);
    const missingRelated = i.relatedIds.find((x) => !pubs.has(x));
    if (missingRelated !== undefined)
        return reject(s, "NOT_FOUND", "related reference not public", missingRelated);
    const deadline = i.now + s.limits.taskDeadlineMs;
    if (!Number.isSafeInteger(deadline))
        return reject(s, "PRECONDITION_FAILED", "deadline overflow");
    const m: PrivateMailV1 = {
        id: i.mailId,
        senderId: i.senderId,
        recipientId: i.recipientId,
        ...(i.agendaId === undefined ? {} : { agendaId: i.agendaId }),
        body: i.body,
        relatedIds: [...i.relatedIds],
        sendContextPublicationUpperBound: s.publications.map((x) => x.id),
        status: "queued",
        deadlineAt: deadline,
        createdAt: i.now
    };
    const n = {
        ...s,
        version: s.version + 1,
        updatedAt: i.now,
        privateMails: [...s.privateMails, m]
    };
    if (validateMeetingStateV1(n).kind === "invalid")
        return reject(s, "PRECONDITION_FAILED", "mail violates state invariant");
    return {
        kind: "accepted",
        state: n,
        relatedIds: [i.mailId, i.recipientId, ...(i.agendaId ? [i.agendaId] : []), ...i.relatedIds],
        effectRequests: [
            {
                kind: "session_mail",
                mailId: i.mailId,
                recipientId: i.recipientId,
                contextPublicationUpperBound: m.sendContextPublicationUpperBound
            }
        ]
    };
}
export function startPrivateMailV1(
    s: MeetingState,
    i: StartPrivateMailInputV1
): MeetingTransitionResultV1 {
    const bad = stateCheck(s);
    if (bad) return bad;
    if (!i || typeof i.mailId !== "string" || !i.mailId.trim() || !valid(i.now))
        return reject(s, "INVALID_ARGUMENT", "invalid start input");
    if (i.actorKind !== "effect_dispatcher")
        return reject(s, "UNAUTHORIZED", "invalid actor", i.mailId);
    if (["terminal", "archiving", "archived"].includes(s.lifecycle.status))
        return reject(s, "MEETING_TERMINAL", "meeting is terminal", i.mailId);
    if (s.lifecycle.status !== "running")
        return reject(s, "INVALID_STATE", "meeting is not running", i.mailId);
    const n = s.privateMails.findIndex((x) => x.id === i.mailId);
    if (n < 0) return reject(s, "NOT_FOUND", "mail not found", i.mailId);
    const m = s.privateMails[n];
    if (m.status !== "queued") return reject(s, "INVALID_STATE", "mail is not queued", i.mailId);
    if (i.now < m.createdAt || i.now >= m.deadlineAt)
        return reject(s, "PRECONDITION_FAILED", "mail deadline invalid", i.mailId);
    if (busy(s, m.recipientId, m.id))
        return reject(s, "PRECONDITION_FAILED", "recipient serial busy", i.mailId);
    const c = s.publications.map((x) => x.id);
    if (m.sendContextPublicationUpperBound.some((x, j) => c[j] !== x))
        return reject(s, "PRECONDITION_FAILED", "send context is not a prefix", i.mailId);
    const changed = {
        ...m,
        status: "processing" as const,
        processingContextPublicationUpperBound: c,
        processingStartedAt: i.now
    };
    const next = {
        ...s,
        version: s.version + 1,
        updatedAt: i.now,
        privateMails: s.privateMails.map((x, j) => (j === n ? changed : x))
    };
    if (validateMeetingStateV1(next).kind === "invalid")
        return reject(s, "PRECONDITION_FAILED", "mail violates state invariant");
    return { kind: "accepted", state: next, relatedIds: [m.id, ...c], effectRequests: [] };
}
function finish(
    s: MeetingState,
    i: { mailId: string; now: number },
    status: "completed" | "cancelled" | "timed_out",
    reason: string,
    actor?: string
): MeetingTransitionResultV1 {
    const bad = stateCheck(s);
    if (bad) return bad;
    if (
        !i ||
        typeof i.mailId !== "string" ||
        !i.mailId.trim() ||
        typeof reason !== "string" ||
        !reason.trim() ||
        !valid(i.now)
    )
        return reject(s, "INVALID_ARGUMENT", "invalid terminal input");
    if (status === "completed" && !s.identities.some((x) => x.id === actor))
        return reject(s, "UNAUTHORIZED", "recipient not found", actor);
    if (status === "cancelled" && !s.identities.some((x) => x.id === actor))
        return reject(s, "UNAUTHORIZED", "sender not found", actor);
    if (["terminal", "archiving", "archived"].includes(s.lifecycle.status))
        return reject(s, "MEETING_TERMINAL", "meeting is terminal", i.mailId);
    if (s.lifecycle.status === "preparing")
        return reject(s, "INVALID_STATE", "meeting is preparing");
    const n = s.privateMails.findIndex((x) => x.id === i.mailId);
    if (n < 0) return reject(s, "NOT_FOUND", "mail not found", i.mailId);
    const m = s.privateMails[n];
    if (status === "completed") {
        if (actor !== m.recipientId) return reject(s, "UNAUTHORIZED", "not recipient", m.id);
        if (m.status !== "processing")
            return reject(s, "INVALID_STATE", "mail is not processing", m.id);
        if (
            m.processingStartedAt === undefined ||
            i.now < m.processingStartedAt ||
            i.now >= m.deadlineAt
        )
            return reject(s, "PRECONDITION_FAILED", "mail cannot complete", m.id);
    } else if (status === "cancelled") {
        if (actor !== m.senderId) return reject(s, "UNAUTHORIZED", "not sender", m.id);
        if (m.status !== "queued" && m.status !== "processing")
            return reject(s, "INVALID_STATE", "mail is terminal", m.id);
        if (i.now < (m.processingStartedAt ?? m.createdAt))
            return reject(s, "PRECONDITION_FAILED", "time invalid", m.id);
    } else {
        if (m.status !== "queued" && m.status !== "processing")
            return reject(s, "INVALID_STATE", "mail is terminal", m.id);
        if (i.now < m.deadlineAt)
            return reject(s, "PRECONDITION_FAILED", "deadline not reached", m.id);
    }
    const changed = Object.fromEntries(
        Object.entries({
            ...m,
            status,
            completedAt: i.now,
            ...(status === "completed" ? {} : { failureReason: reason })
        }).filter(([, v]) => v !== undefined)
    ) as unknown as PrivateMailV1;
    const next = {
        ...s,
        version: s.version + 1,
        updatedAt: i.now,
        privateMails: s.privateMails.map((x, j) => (j === n ? changed : x))
    };
    if (validateMeetingStateV1(next).kind === "invalid")
        return reject(s, "PRECONDITION_FAILED", "mail violates state invariant");
    return { kind: "accepted", state: next, relatedIds: [m.id], effectRequests: [] };
}
export function completePrivateMailV1(s: MeetingState, i: CompletePrivateMailInputV1) {
    return finish(s, i, "completed", "completed", i?.recipientId);
}
export function cancelPrivateMailV1(s: MeetingState, i: CancelPrivateMailInputV1) {
    return finish(s, i, "cancelled", i?.reason ?? "", i?.senderId);
}
export function expirePrivateMailV1(s: MeetingState, i: ExpirePrivateMailInputV1) {
    const bad = stateCheck(s);
    if (bad) return bad;
    if (!i || typeof i.mailId !== "string" || !i.mailId.trim() || !i.reason.trim() || !valid(i.now))
        return reject(s, "INVALID_ARGUMENT", "invalid terminal input");
    if (i.actorKind !== "deadline_handler")
        return reject(s, "UNAUTHORIZED", "invalid actor", i.mailId);
    return finish(s, i, "timed_out", i.reason);
}
