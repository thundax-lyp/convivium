import { rebindCaptainParent } from "./meeting-recovery-service.js";
import { emitDiagnostic, type DiagnosticSink } from "../../repository/diagnostics.js";
import { randomUUID } from "node:crypto";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import {
    encodeMeetingSessionLabel,
    startManagerSession,
    startParticipantSession,
    interruptAndDrainOwnedSessions
} from "../../dsh/index.js";
import { transitionMeeting, type MeetingState } from "../../domain/index.js";
import type { MeetingRepositoryPort } from "../../repository/meeting-repository-port.js";
import type { DomainEventInput, JsonObject, SessionOwnership } from "../../repository/types.js";
import { requireExpectedArchiveOwnerships, recoverArchive } from "./meeting-archive-service.js";

export interface SessionRecoveryInput {
    onDiagnostic?: DiagnosticSink;
    repository: MeetingRepositoryPort;
    parent: Agent;
    runtime: Pick<
        SubagentRuntime,
        | "listDescendants"
        | "listChildren"
        | "startContinuable"
        | "interrupt"
        | "drainContinuableChildren"
    >;
    signal: AbortSignal;
    now: number;
}

/** Reconciliation is completed before a recovered parent can dispatch work. */
const pendingRecovery = new WeakMap<MeetingRepositoryPort, Promise<void>>();
export function reconcileMeetingSessions(input: SessionRecoveryInput): Promise<void> {
    const pending = pendingRecovery.get(input.repository);
    if (pending !== undefined) return pending;
    const run = reconcileOnce(input)
        .then(async () => {
            const recovered = await input.repository.recover();
            emitDiagnostic(input.onDiagnostic, {
                meetingId: input.repository.meetingId,
                meetingVersion: recovered.snapshot?.version ?? 0,
                eventSeq: Number(recovered.snapshot?.state.eventSeq ?? 0),
                eventType: "recovery.completed",
                timestamp: input.now,
                metrics: { recoveries: 1 }
            });
        })
        .catch(async (error) => {
            const recovered = await input.repository.recover().catch(() => undefined);
            emitDiagnostic(input.onDiagnostic, {
                meetingId: input.repository.meetingId,
                meetingVersion: recovered?.snapshot?.version ?? 0,
                eventSeq: Number(recovered?.snapshot?.state.eventSeq ?? 0),
                eventType: "recovery.failed",
                timestamp: input.now,
                errorCode:
                    error instanceof Error && /^RECOVERY_[A-Z_]+$/.test(error.message)
                        ? error.message
                        : "INTERNAL_ERROR",
                metrics: { recoveryFailures: 1 }
            });
            throw error;
        })
        .finally(() => pendingRecovery.delete(input.repository));
    pendingRecovery.set(input.repository, run);
    return run;
}
async function reconcileOnce(input: SessionRecoveryInput): Promise<void> {
    const { repository, runtime, parent, signal, now } = input;
    const recovered = await repository.recover();
    if (recovered.sessionOwnership.some((item) => item.parentSessionId !== String(parent.id))) {
        throw new Error("RECOVERY_PARENT_MISMATCH");
    }
    for (const ownership of recovered.sessionOwnership) {
        const label =
            ownership.role === "manager"
                ? encodeMeetingSessionLabel({
                      role: "manager",
                      teamId: repository.teamId,
                      meetingId: repository.meetingId
                  })
                : encodeMeetingSessionLabel({
                      role: "participant",
                      teamId: repository.teamId,
                      meetingId: repository.meetingId,
                      participantId: ownership.participantId!
                  });
        if (
            ownership.sessionLabel !== label ||
            (ownership.role === "manager" && ownership.participantId !== undefined)
        )
            throw new Error("RECOVERY_OWNERSHIP_UNPROVEN");
    }
    const inspected = await rebindCaptainParent({
        parent,
        expectedParentSessionId: String(parent.id),
        meetingId: repository.meetingId,
        ownerships: recovered.sessionOwnership,
        inspection: runtime,
        signal
    });
    const known = new Set(recovered.sessionOwnership.map((item) => item.sessionId));
    if (
        inspected.diagnostics.some(
            (item) => known.has(item.sessionId) && item.reason !== "missing-dsh-entry"
        )
    ) {
        throw new Error("RECOVERY_OWNERSHIP_UNPROVEN");
    }
    const present = new Set(inspected.observations.map((item) => item.sessionId));
    async function retire(ownership: SessionOwnership): Promise<void> {
        await repository.recordSessionOwnership({ ...ownership, capabilityStatus: "revoked" }, now);
        if (present.has(ownership.sessionId)) {
            await interruptAndDrainOwnedSessions({ runtime, parent, ownerships: [ownership] });
        }
        await repository.recordSessionOwnership(
            { ...ownership, lifecycleStatus: "closed", capabilityStatus: "revoked" },
            now
        );
    }
    if (recovered.bootstrap.status !== "ready") {
        for (const ownership of recovered.sessionOwnership) await retire(ownership);
        await repository.updateBootstrap({
            status: "creation_failed",
            failureCode: "CREATION_INTERRUPTED",
            now
        });
        return;
    }
    const state = recovered.snapshot?.state as unknown as MeetingState;
    if (!state || state.id !== repository.meetingId || state.teamId !== repository.teamId) {
        throw new Error("RECOVERY_MEETING_IDENTITY_MISMATCH");
    }
    requireExpectedArchiveOwnerships(state, recovered.sessionOwnership, String(parent.id));
    if (state.status === "archived") {
        for (const ownership of recovered.sessionOwnership) await retire(ownership);
        return;
    }
    if (!["created", "running", "waiting", "paused", "converging"].includes(state.status)) {
        for (const ownership of recovered.sessionOwnership) {
            if (!present.has(ownership.sessionId)) await retire(ownership);
        }
        await recoverArchive({
            repository,
            runtime,
            parent,
            signal,
            now,
            onDiagnostic: input.onDiagnostic
        });
        return;
    }
    const missing = recovered.sessionOwnership.filter(
        (item) =>
            item.supersededBySessionId === undefined &&
            (!present.has(item.sessionId) || item.lifecycleStatus === "provisioning")
    );
    if (missing.length === 0) return;
    // Persist the normal pause transition before replacing any identity. It revokes
    // current attempts and cancels their queued deliveries; resume replans explicitly.
    if (state.status !== "paused") {
        await repository.execute({
            requestId: `recovery-pause:${state.version}`,
            commandKind: "recovery_pause",
            authorization: { callerBinding: "runtime:convivium", capabilityId: "runtime:recovery" },
            requestHash: `recovery-pause:${state.version}`,
            expectedMeetingVersion: state.version,
            transition: (snapshot) => {
                const paused = transitionMeeting(
                    snapshot.state as unknown as MeetingState,
                    "paused",
                    {
                        now,
                        reason: "Meeting Session recovery requires fresh planning.",
                        pause: {
                            at: now,
                            by: {
                                kind: "local_host",
                                actorId: "runtime:recovery",
                                displayName: "Session recovery"
                            }
                        }
                    }
                );
                return {
                    state: paused.state as unknown as JsonObject,
                    result: {},
                    events: paused.effect.events as unknown as DomainEventInput[],
                    outbox: []
                };
            }
        });
    }
    await repository.cancelUnfinishedPrivateMeetingMail({
        requestId: `recovery-mail:${state.version}`,
        requestHash: `recovery-mail:${state.version}`,
        expectedMeetingVersion: (await repository.read()).version,
        authorization: { callerBinding: "runtime:convivium", capabilityId: "runtime:recovery" },
        now
    });
    // A fingerprint alone cannot reconstruct a lost persona/tool restriction.
    // Never substitute current definitions for the historical role composition.
    if (missing.some((item) => item.agentDefinition !== undefined)) {
        throw new Error("RECOVERY_ROLE_DESCRIPTOR_MISSING");
    }
    for (const ownership of missing) {
        signal.throwIfAborted();
        await retire(ownership);
        const replacement = await repository.replaceMissingSession(
            ownership.sessionId,
            `${repository.meetingId}-recovered-${randomUUID()}`,
            now
        );
        const common = {
            runtime,
            parent,
            provider: replacement.provider,
            childId: replacement.sessionId as never,
            teamId: repository.teamId,
            meetingId: repository.meetingId,
            signal
        };
        const started =
            replacement.role === "manager"
                ? await startManagerSession(common)
                : await startParticipantSession({
                      ...common,
                      participantId: replacement.participantId!
                  });
        await repository.recordSessionOwnership(
            {
                ...replacement,
                lifecycleStatus: "active",
                initialMessageId: String(started.messageId)
            },
            now
        );
    }
}
