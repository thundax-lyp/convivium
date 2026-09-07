import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { MeetingOwnershipRecord } from "./caller-resolver.js";
import { decodeMeetingSessionLabel } from "./labels.js";

export interface InterruptAndDrainOwnedSessionsInput {
    readonly runtime: Pick<SubagentRuntime, "interrupt" | "drainContinuableChildren">;
    readonly parent: Agent;
    readonly ownerships: readonly MeetingOwnershipRecord[];
}

function assertOwnedChildren(
    parent: Agent,
    ownerships: readonly MeetingOwnershipRecord[]
): readonly SessionId[] {
    const parentSessionId = String(parent.id);
    const childIds = new Set<string>();
    for (const ownership of ownerships) {
        if (ownership.parentSessionId !== parentSessionId) {
            throw new Error("Continuable cleanup requires the exact owned Captain parent.");
        }
        if (childIds.has(ownership.sessionId)) {
            throw new Error("Continuable cleanup cannot target one owned Session twice.");
        }
        childIds.add(ownership.sessionId);
    }
    return [...childIds] as SessionId[];
}

/**
 * Stops only explicitly verified direct children. DSH retains durable Session
 * data; Meeting Runtime separately revokes capability before requesting this
 * cleanup, so a future cold resume cannot regain meeting authority.
 */
export async function interruptAndDrainOwnedSessions(
    input: InterruptAndDrainOwnedSessionsInput
): Promise<void> {
    const childIds = assertOwnedChildren(input.parent, input.ownerships);
    for (const childId of childIds) {
        input.runtime.interrupt(childId, { kind: "ancestor", agent: input.parent });
    }
    await input.runtime.drainContinuableChildren(input.parent, childIds);
}

/**
 * `listChildren()` is the only DSH enumeration used to authorize an archive
 * cleanup target. Its direct-child result is durable: a child remaining in a
 * later listing does not mean `drainContinuableChildren()` failed.
 */
export interface ProveArchiveOwnedChildrenInput {
    readonly runtime: Pick<SubagentRuntime, "listChildren">;
    readonly parentSessionId: SessionId;
    readonly meetingId: string;
    readonly ownerships: readonly MeetingOwnershipRecord[];
    readonly signal: AbortSignal;
}

function assertArchiveOwnershipShape(
    ownership: MeetingOwnershipRecord,
    parentSessionId: SessionId,
    meetingId: string
): void {
    if (ownership.parentSessionId !== String(parentSessionId)) {
        throw new Error("Archive cleanup ownership has a different Captain parent.");
    }
    const label = decodeMeetingSessionLabel(ownership.sessionLabel);
    if (
        label === undefined ||
        label.meetingId !== meetingId ||
        label.role !== ownership.role ||
        (label.role === "manager" && ownership.participantId !== undefined) ||
        (label.role === "participant" && label.participantId !== ownership.participantId)
    ) {
        throw new Error("Archive cleanup ownership label does not match the meeting identity.");
    }
}

/**
 * Fails closed unless the durable direct-child listing is exactly the supplied
 * ownership set. This is an effect-before and recovery proof only; it never
 * interprets a post-drain durable child as resident work or a cleanup failure.
 */
export async function proveArchiveOwnedChildren(
    input: ProveArchiveOwnedChildrenInput
): Promise<readonly MeetingOwnershipRecord[]> {
    const expected = new Map<string, MeetingOwnershipRecord>();
    for (const ownership of input.ownerships) {
        assertArchiveOwnershipShape(ownership, input.parentSessionId, input.meetingId);
        if (expected.has(ownership.sessionId)) {
            throw new Error("Archive cleanup ownership contains a duplicate Session.");
        }
        expected.set(ownership.sessionId, ownership);
    }

    const entries = await input.runtime.listChildren(input.parentSessionId, input.signal);
    const observed = new Set<string>();
    for (const entry of entries) {
        if (entry.kind === "diagnostic") {
            throw new Error("Archive cleanup direct-child listing contains a diagnostic.");
        }
        const sessionId = String(entry.id);
        const ownership = expected.get(sessionId);
        if (ownership === undefined) {
            continue;
        }
        if (observed.has(sessionId)) {
            throw new Error("Archive cleanup direct-child listing contains a duplicate Session.");
        }
        if (entry.mode !== "continuable" || entry.label !== ownership.sessionLabel) {
            throw new Error("Archive cleanup direct-child listing does not match ownership.");
        }
        observed.add(sessionId);
    }

    for (const sessionId of expected.keys()) {
        if (!observed.has(sessionId)) {
            throw new Error("Archive cleanup ownership is missing from the direct-child listing.");
        }
    }
    return input.ownerships;
}

export interface OwnedSessionObservation {
    readonly sessionId: string;
    readonly parentSessionId: string;
    readonly meetingId: string;
    readonly sessionLabel: string;
    readonly provider: string;
    readonly initialMessageId?: string;
    readonly role: "manager" | "participant";
    readonly participantId?: string;
    readonly lifecycleStatus: MeetingOwnershipRecord["lifecycleStatus"];
    readonly capabilityStatus: MeetingOwnershipRecord["capabilityStatus"];
}

export interface OwnedSessionDiagnostic {
    readonly kind: "diagnostic";
    readonly sessionId: string;
    readonly reason:
        | "missing-dsh-entry"
        | "not-continuable"
        | "wrong-parent"
        | "label-mismatch"
        | "unowned-dsh-child";
}

export interface OwnedSessionInspection {
    readonly observations: readonly OwnedSessionObservation[];
    readonly diagnostics: readonly OwnedSessionDiagnostic[];
}

export interface InspectOwnedSessionsInput {
    readonly runtime: Pick<SubagentRuntime, "listDescendants">;
    readonly parentSessionId: SessionId;
    readonly meetingId: string;
    readonly ownerships: readonly MeetingOwnershipRecord[];
    readonly signal: AbortSignal;
}

function observationFromOwnership(
    ownership: MeetingOwnershipRecord,
    meetingId: string
): OwnedSessionObservation {
    return {
        sessionId: ownership.sessionId,
        parentSessionId: ownership.parentSessionId,
        meetingId,
        sessionLabel: ownership.sessionLabel,
        provider: ownership.provider,
        ...(ownership.initialMessageId ? { initialMessageId: ownership.initialMessageId } : {}),
        role: ownership.role,
        ...(ownership.participantId ? { participantId: ownership.participantId } : {}),
        lifecycleStatus: ownership.lifecycleStatus,
        capabilityStatus: ownership.capabilityStatus
    };
}

export async function inspectOwnedSessions(
    input: InspectOwnedSessionsInput
): Promise<OwnedSessionInspection> {
    const entries = await input.runtime.listDescendants(input.parentSessionId, input.signal);
    const expected = new Map(input.ownerships.map((ownership) => [ownership.sessionId, ownership]));
    const observations: OwnedSessionObservation[] = [];
    const diagnostics: OwnedSessionDiagnostic[] = [];
    const observed = new Set<string>();

    for (const entry of entries) {
        if (entry.kind === "diagnostic") {
            diagnostics.push({
                kind: "diagnostic",
                sessionId: String(entry.id),
                reason: "not-continuable"
            });
            continue;
        }
        if (entry.mode !== "continuable") {
            diagnostics.push({
                kind: "diagnostic",
                sessionId: String(entry.id),
                reason: "not-continuable"
            });
            continue;
        }
        const sessionId = String(entry.id);
        const ownership = expected.get(sessionId);
        if (ownership === undefined) {
            diagnostics.push({ kind: "diagnostic", sessionId, reason: "unowned-dsh-child" });
            continue;
        }
        observed.add(sessionId);
        if (String(entry.parentId) !== String(input.parentSessionId)) {
            diagnostics.push({ kind: "diagnostic", sessionId, reason: "wrong-parent" });
            continue;
        }
        const label = entry.label ? decodeMeetingSessionLabel(entry.label) : undefined;
        const expectedLabel = decodeMeetingSessionLabel(ownership.sessionLabel);
        if (
            label === undefined ||
            expectedLabel === undefined ||
            entry.label !== ownership.sessionLabel ||
            label.role !== expectedLabel.role ||
            label.teamId !== expectedLabel.teamId ||
            label.meetingId !== expectedLabel.meetingId ||
            (label.role === "participant" &&
                (expectedLabel.role !== "participant" ||
                    label.participantId !== expectedLabel.participantId)) ||
            expectedLabel.meetingId !== input.meetingId
        ) {
            diagnostics.push({ kind: "diagnostic", sessionId, reason: "label-mismatch" });
            continue;
        }
        observations.push(observationFromOwnership(ownership, input.meetingId));
    }

    for (const ownership of input.ownerships) {
        if (!observed.has(ownership.sessionId)) {
            diagnostics.push({
                kind: "diagnostic",
                sessionId: ownership.sessionId,
                reason: "missing-dsh-entry"
            });
        }
    }
    return { observations, diagnostics };
}
