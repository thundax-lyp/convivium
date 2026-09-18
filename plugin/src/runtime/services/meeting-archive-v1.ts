import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { MeetingIdentityV1, MeetingState } from "@/domain/index.js";
import { decodeMeetingIdentitySessionLabelV1 } from "@/dsh/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { OutboxItem, SessionOwnership } from "@/repository/types.js";
import {
    RUNTIME_RECOVERY_PRINCIPAL_ID,
    type MeetingCommandApplicationV1
} from "@/runtime/application-service/meeting-command-v1.js";

class MeetingArchiveDispatchError extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean
    ) {
        super(code);
    }
}

function unavailable(): never {
    throw new MeetingArchiveDispatchError("RECOVERY_UNAVAILABLE", false);
}

function retry(code: string): never {
    throw new MeetingArchiveDispatchError(code, true);
}

function stringField(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== "string" || value.trim() === "") unavailable();
    return value;
}

type ArchiveSessionsV1 = Pick<SubagentRuntime, "listChildren" | "drainContinuableDescendants">;

interface DispatchArchiveCleanupInputV1 {
    readonly outboxItem: OutboxItem;
    readonly parent: Agent;
    readonly signal: AbortSignal;
}

interface MeetingArchiveDispatcherDependenciesV1 {
    readonly repository: Pick<MeetingRepositoryPort<MeetingState>, "recover">;
    readonly sessions: ArchiveSessionsV1;
    readonly application: MeetingCommandApplicationV1;
}

function roleFor(identity: MeetingIdentityV1): SessionOwnership["role"] {
    if (identity.roles.length !== 1) unavailable();
    switch (identity.roles[0]) {
        case "manager":
            return "manager";
        case "evidence_reviewer":
            return "evidence_reviewer";
        case "contributor":
            return "participant";
        default:
            return unavailable();
    }
}

function targetOwnerships(
    state: MeetingState,
    ownerships: readonly SessionOwnership[],
    parent: Agent
): readonly SessionOwnership[] {
    const archiveIdentityIds = new Set(
        state.archive?.identityProvenance.map(({ identityId }) => identityId) ?? []
    );
    if (
        archiveIdentityIds.size !== state.identities.length ||
        state.identities.some((identity) => !archiveIdentityIds.has(identity.id))
    )
        unavailable();
    const targets = ownerships.filter(
        (ownership) =>
            ownership.meetingId === state.id && ownership.supersededBySessionId === undefined
    );
    if (targets.length !== state.identities.length) unavailable();
    const ids = new Set<string>();
    const sessions = new Set<string>();
    let managers = 0;
    let reviewers = 0;
    for (const identity of state.identities) {
        const matches = targets.filter(
            (ownership) =>
                ownership.id === identity.sessionOwnershipId && ownership.identityId === identity.id
        );
        if (matches.length !== 1) unavailable();
        const ownership = matches[0]!;
        if (!ownership.id || ids.has(ownership.id) || sessions.has(ownership.sessionId))
            unavailable();
        ids.add(ownership.id);
        sessions.add(ownership.sessionId);
        const role = roleFor(identity);
        if (
            ownership.role !== role ||
            ownership.parentSessionId !== String(parent.id) ||
            (ownership.lifecycleStatus === "closed" && ownership.capabilityStatus !== "revoked")
        )
            unavailable();
        const label = decodeMeetingIdentitySessionLabelV1(ownership.sessionLabel);
        if (
            !label ||
            label.meetingId !== state.id ||
            label.identityId !== identity.id ||
            label.role !== role
        )
            unavailable();
        if (role === "manager") managers += 1;
        if (role === "evidence_reviewer") reviewers += 1;
    }
    if (managers !== 1 || reviewers !== 1) unavailable();
    return targets;
}

async function proveDurableChildren(
    sessions: ArchiveSessionsV1,
    parent: Agent,
    signal: AbortSignal,
    ownerships: readonly SessionOwnership[]
): Promise<void> {
    const entries = await sessions.listChildren(parent.id, signal);
    if (entries.length !== ownerships.length) unavailable();
    const expected = new Map(ownerships.map((ownership) => [ownership.sessionId, ownership]));
    const observed = new Set<string>();
    for (const entry of entries) {
        if (entry.kind !== "child") unavailable();
        const sessionId = String(entry.id);
        const ownership = expected.get(sessionId);
        if (
            !ownership ||
            observed.has(sessionId) ||
            entry.mode !== "continuable" ||
            entry.label !== ownership.sessionLabel
        )
            unavailable();
        observed.add(sessionId);
    }
    if (observed.size !== ownerships.length) unavailable();
}

const context = {
    caller: {
        channel: "runtime_recovery" as const,
        principalId: RUNTIME_RECOVERY_PRINCIPAL_ID
    }
};

export function createMeetingArchiveDispatcherV1(
    dependencies: MeetingArchiveDispatcherDependenciesV1
): { dispatch(input: DispatchArchiveCleanupInputV1): Promise<void> } {
    async function recordResult(
        input: DispatchArchiveCleanupInputV1,
        archiveId: string,
        ownership: SessionOwnership,
        status: "closed" | "failed"
    ): Promise<void> {
        const recovered = await dependencies.repository.recover();
        const snapshot = recovered.snapshot;
        if (!snapshot || !ownership.id) unavailable();
        const current = recovered.sessionOwnership.find(
            (candidate) => candidate.id === ownership.id
        );
        if (!current) unavailable();
        if (current.lifecycleStatus === "closed") return;
        const failureReason = status === "failed" ? "SESSION_CLOSE_FAILED" : undefined;
        try {
            const result = await dependencies.application.execute(
                {
                    protocolVersion: 1,
                    meetingId: snapshot.meetingId,
                    expectedMeetingVersion: snapshot.version,
                    requestId: `archive:${archiveId}:${ownership.id}:${input.outboxItem.attempts}:${status}`,
                    action: {
                        kind: "record_archive_session_result",
                        sessionOwnershipId: ownership.id,
                        status,
                        ...(failureReason === undefined ? {} : { failureReason })
                    }
                },
                context,
                input.signal
            );
            if (result.kind === "accepted") return;
        } catch {
            // A storage response can be lost after commit; recovery below is the authority.
        }
        const latest = await dependencies.repository.recover();
        const persisted = latest.sessionOwnership.find(
            (candidate) => candidate.id === ownership.id
        );
        if (persisted?.lifecycleStatus === "closed") return;
        if (status === "failed" && persisted?.lastClosureFailureCode === "SESSION_CLOSE_FAILED")
            return;
        retry("ARCHIVE_SESSION_RESULT_COMMIT_FAILED");
    }

    return {
        async dispatch(input) {
            const payload = input.outboxItem.payload as Record<string, unknown>;
            if (input.outboxItem.kind !== "dispatch" || payload.kind !== "archive") unavailable();
            const archiveId = stringField(payload, "archiveId");
            let recovered = await dependencies.repository.recover();
            let snapshot = recovered.snapshot;
            if (!snapshot) unavailable();
            if (snapshot.state.lifecycle.status === "archived") {
                if (snapshot.state.archive?.id !== archiveId) unavailable();
                return;
            }
            if (snapshot.state.lifecycle.status === "terminal") {
                try {
                    await dependencies.application.execute(
                        {
                            protocolVersion: 1,
                            meetingId: snapshot.meetingId,
                            expectedMeetingVersion: snapshot.version,
                            requestId: `archive-start:${input.outboxItem.id}`,
                            action: { kind: "start_archive" }
                        },
                        {
                            ...context,
                            archiveEffect: {
                                effectId: input.outboxItem.id,
                                archiveId
                            }
                        },
                        input.signal
                    );
                } catch {
                    // Recovery below distinguishes a committed command from a failed attempt.
                }
                recovered = await dependencies.repository.recover();
                snapshot = recovered.snapshot;
                if (!snapshot) unavailable();
            }
            if (snapshot.state.lifecycle.status === "archived") {
                if (snapshot.state.archive?.id !== archiveId) unavailable();
                return;
            }
            if (
                snapshot.state.lifecycle.status !== "archiving" ||
                snapshot.state.archive?.id !== archiveId ||
                snapshot.state.archive.status !== "complete"
            )
                unavailable();
            const ownerships = targetOwnerships(
                snapshot.state,
                recovered.sessionOwnership,
                input.parent
            );
            await proveDurableChildren(
                dependencies.sessions,
                input.parent,
                input.signal,
                ownerships
            );
            const pending = ownerships.filter(
                (ownership) => ownership.lifecycleStatus !== "closed"
            );
            if (pending.length > 0) {
                try {
                    await dependencies.sessions.drainContinuableDescendants([input.parent]);
                } catch {
                    await recordResult(input, archiveId, pending[0]!, "failed");
                    retry("SESSION_CLOSE_FAILED");
                }
            }
            for (const ownership of pending)
                await recordResult(input, archiveId, ownership, "closed");
            const completed = await dependencies.repository.recover();
            if (
                completed.snapshot?.state.lifecycle.status !== "archived" ||
                completed.snapshot.state.archive?.id !== archiveId
            )
                unavailable();
        }
    };
}
