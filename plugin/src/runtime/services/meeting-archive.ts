import { SessionPersistenceNotFoundError } from "@deepseek-ai/dsh-session-persistence";
import type { MeetingAgentOwner } from "@/dsh/index.js";
import type { MeetingAgentDefinition } from "@/role-composition/model.js";
import type { MeetingIdentity, MeetingState } from "@/domain/index.js";
import { decodeMeetingIdentitySessionLabel } from "@/dsh/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { OutboxItem, SessionOwnership } from "@/repository/types.js";
import {
    RUNTIME_RECOVERY_PRINCIPAL_ID,
    type MeetingCommandApplication
} from "@/runtime/application-service/meeting-command.js";

class MeetingArchiveDispatchError extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean
    ) {
        super(code);
    }
}

const unavailable: () => never = () => {
    throw new MeetingArchiveDispatchError("RECOVERY_UNAVAILABLE", false);
};

const retry: (code: string) => never = (code) => {
    throw new MeetingArchiveDispatchError(code, true);
};

const stringField = (payload: Record<string, unknown>, key: string): string => {
    const value = payload[key];
    if (typeof value !== "string" || value.trim() === "") unavailable();
    return value;
};

interface DispatchArchiveCleanupInput {
    readonly outboxItem: OutboxItem;
    readonly signal: AbortSignal;
}

interface MeetingArchiveDispatcherDependencies {
    readonly repository: Pick<
        MeetingRepositoryPort<MeetingState>,
        "recover" | "recordSessionOwnership"
    >;
    readonly owner: Pick<MeetingAgentOwner, "stop">;
    readonly definitions: readonly MeetingAgentDefinition[];
    readonly application: MeetingCommandApplication;
}

const roleFor = (identity: MeetingIdentity): SessionOwnership["role"] => {
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
};

const targetOwnerships = (
    state: MeetingState,
    ownerships: readonly SessionOwnership[]
): readonly SessionOwnership[] => {
    const archiveIdentityIds = new Set(
        state.archive?.identityProvenance.map(({ identityId }) => identityId) ?? []
    );
    if (
        archiveIdentityIds.size !== state.identities.length ||
        state.identities.some((identity) => !archiveIdentityIds.has(identity.id))
    )
        unavailable();
    const targets = ownerships;
    if (targets.some((o) => o.meetingId !== state.id)) unavailable();
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
            (ownership.lifecycleStatus === "closed" && ownership.capabilityStatus !== "revoked")
        )
            unavailable();
        const label = decodeMeetingIdentitySessionLabel(ownership.sessionLabel);
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
    for (const ownership of targets) {
        if (state.identities.some((i) => i.sessionOwnershipId === ownership.id)) continue;
        const admission = state.identityRecommendations.find((r) => r.id === ownership.admissionId);
        if (
            !admission ||
            admission.identityId !== ownership.identityId ||
            admission.sessionId !== ownership.sessionId ||
            ids.has(ownership.id) ||
            sessions.has(ownership.sessionId)
        )
            unavailable();
        ids.add(ownership.id);
        sessions.add(ownership.sessionId);
    }
    return targets;
};

const context = {
    caller: {
        channel: "runtime_recovery" as const,
        principalId: RUNTIME_RECOVERY_PRINCIPAL_ID
    }
};

export const createMeetingArchiveDispatcher = (
    dependencies: MeetingArchiveDispatcherDependencies
): { dispatch(input: DispatchArchiveCleanupInput): Promise<void> } => {
    const recordResult = async (
        input: DispatchArchiveCleanupInput,
        archiveId: string,
        ownership: SessionOwnership,
        status: "closed" | "failed"
    ): Promise<void> => {
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
        retry("ARCHIVE_SESSION_RESULT_COMMIT_FAILED");
    };

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
            const ownerships = targetOwnerships(snapshot.state, recovered.sessionOwnership);
            // Revoke the entire Meeting before stopping any handle. A partial cleanup never
            // leaves another owned Agent authorized while the Meeting is archiving.
            const pending: SessionOwnership[] = [];
            for (const ownership of ownerships) {
                if (ownership.lifecycleStatus === "closed") continue;
                const { createdAt: _created, updatedAt: _updated, ...binding } = ownership;
                pending.push(
                    ownership.capabilityStatus === "revoked"
                        ? ownership
                        : await dependencies.repository.recordSessionOwnership(
                              { ...binding, capabilityStatus: "revoked" },
                              Date.now()
                          )
                );
            }
            for (const ownership of pending) {
                const definition = dependencies.definitions.find(
                    (d) =>
                        d.agentDefinitionId === ownership.definition.agentDefinitionId &&
                        d.definitionVersion === ownership.definition.definitionVersion
                );
                if (!definition) retry("RECOVERY_UNAVAILABLE");
                try {
                    await dependencies.owner.stop({
                        ownership,
                        definition,
                        reason: "Meeting archived",
                        signal: input.signal
                    });
                } catch (error) {
                    // A never-materialized provisioning Session has no handle to close.
                    if (
                        !(error instanceof SessionPersistenceNotFoundError) ||
                        ownership.lifecycleStatus !== "provisioning"
                    ) {
                        await recordResult(input, archiveId, ownership, "failed");
                        retry("SESSION_CLOSE_FAILED");
                    }
                }
                await recordResult(input, archiveId, ownership, "closed");
            }
            const completed = await dependencies.repository.recover();
            if (
                completed.snapshot?.state.lifecycle.status !== "archived" ||
                completed.snapshot.state.archive?.id !== archiveId
            )
                unavailable();
        }
    };
};
