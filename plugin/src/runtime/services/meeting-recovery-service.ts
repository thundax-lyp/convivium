import type { Agent } from "@deepseek-ai/dsh-agent";
import { inspectOwnedSessions, type OwnedSessionInspection } from "../../dsh/index.js";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { DomainRepositoryRegistry } from "../../repository/domain/domain-repository-registry.js";
import type { MeetingRepositoryPort as MeetingRepository } from "../../repository/meeting-repository-port.js";
import type { MeetingSnapshot, RecoveryResult } from "../../repository/types.js";

export class LocalMeetingRecoveryUnavailableError extends Error {
    readonly name = "LocalMeetingRecoveryUnavailableError";
}

export interface RecoverableMeeting {
    readonly teamId: string;
    readonly captainSessionId: string;
    readonly repository: MeetingRepository;
    parent?: Agent;
}

export type RehydrateMode =
    | { readonly kind: "agent_best_effort" }
    | { readonly kind: "local_list" }
    | { readonly kind: "local_meeting"; readonly meetingId: string };

export interface MeetingRehydrationServiceOptions {
    readonly registry: Promise<DomainRepositoryRegistry>;
    readonly meetings: Map<string, RecoverableMeeting>;
    readonly signal: AbortSignal;
    readonly now?: () => number;
}

export interface MeetingRehydrationService {
    rehydrate(mode?: RehydrateMode): Promise<Map<string, MeetingSnapshot> | undefined>;
}

/** Owns catalog discovery and repository recovery; it makes no meeting command decisions. */
export function createMeetingRehydrationService(
    options: MeetingRehydrationServiceOptions
): MeetingRehydrationService {
    const unavailable = (error: unknown): LocalMeetingRecoveryUnavailableError =>
        error instanceof LocalMeetingRecoveryUnavailableError
            ? error
            : new LocalMeetingRecoveryUnavailableError("Local meeting recovery is unavailable.", {
                  cause: error
              });
    async function recoverLocal(
        snapshots: Map<string, MeetingSnapshot>,
        meetingId: string,
        teamId: string,
        existing?: RecoverableMeeting
    ): Promise<void> {
        let repository = existing?.repository;
        try {
            if (repository === undefined) {
                repository = await (await options.registry).openMeeting({ teamId, meetingId });
            } else if (existing?.teamId !== teamId) {
                throw new Error("Recovered Meeting team ownership does not match catalog.");
            }
            const recovered = await repository.recover();
            if (
                recovered.bootstrap.status === "creating" ||
                recovered.bootstrap.status === "creation_failed"
            ) {
                if (existing !== undefined) options.meetings.delete(meetingId);
                return;
            }
            const parentSessionId = recovered.sessionOwnership[0]?.parentSessionId;
            if (recovered.snapshot === undefined || parentSessionId === undefined) {
                throw new Error("Ready Meeting recovery is incomplete.");
            }
            const current = await repository.read();
            if (existing === undefined) {
                options.meetings.set(meetingId, {
                    teamId,
                    captainSessionId: parentSessionId,
                    repository
                });
            }
            snapshots.set(meetingId, current);
        } catch (error) {
            throw unavailable(error);
        }
    }

    return {
        async rehydrate(mode = { kind: "agent_best_effort" }) {
            if (mode.kind !== "agent_best_effort") {
                const snapshots = new Map<string, MeetingSnapshot>();
                if (mode.kind === "local_meeting") {
                    const existing = options.meetings.get(mode.meetingId);
                    if (existing !== undefined) {
                        await recoverLocal(snapshots, mode.meetingId, existing.teamId, existing);
                        return snapshots;
                    }
                }
                try {
                    const catalog = (await options.registry).listMeetings();
                    for (const record of catalog) {
                        if (mode.kind === "local_meeting" && record.meetingId !== mode.meetingId)
                            continue;
                        await recoverLocal(
                            snapshots,
                            record.meetingId,
                            record.teamId,
                            options.meetings.get(record.meetingId)
                        );
                        if (mode.kind === "local_meeting") return snapshots;
                    }
                } catch (error) {
                    throw unavailable(error);
                }
                return snapshots;
            }
            const catalog = await options.registry.then((registry) => registry.listMeetings());
            for (const record of catalog) {
                if (options.meetings.has(record.meetingId)) continue;
                try {
                    const repository = await (
                        await options.registry
                    ).openMeeting({
                        teamId: record.teamId,
                        meetingId: record.meetingId
                    });
                    const recovered = await repository.recover();
                    const parentSessionId = recovered.sessionOwnership[0]?.parentSessionId;
                    if (
                        recovered.bootstrap.status !== "ready" ||
                        recovered.snapshot === undefined ||
                        parentSessionId === undefined
                    )
                        continue;
                    options.meetings.set(record.meetingId, {
                        teamId: record.teamId,
                        captainSessionId: parentSessionId,
                        repository
                    });
                } catch {
                    // Ignore unrelated or incomplete catalog records during startup discovery.
                }
            }
        }
    };
}

export interface MeetingRecoveryDependencies {
    readonly repository: Pick<MeetingRepository, "recover">;
    readonly inspection?: Pick<SubagentRuntime, "listDescendants">;
    readonly parent?: Agent;
    readonly signal: AbortSignal;
    readonly now?: () => number;
}

export interface MeetingRecoveryResult extends RecoveryResult {
    readonly parentStatus: "bound" | "absent";
    readonly ownershipInspection?: OwnedSessionInspection;
}

export interface CaptainRebindDependencies {
    readonly parent: Agent;
    readonly expectedParentSessionId: string;
    readonly meetingId: string;
    readonly ownerships: RecoveryResult["sessionOwnership"];
    readonly inspection: Pick<SubagentRuntime, "listDescendants">;
    readonly signal: AbortSignal;
}

export async function rebindCaptainParent(
    dependencies: CaptainRebindDependencies
): Promise<OwnedSessionInspection> {
    if (String(dependencies.parent.id) !== dependencies.expectedParentSessionId) {
        throw new Error("Captain parent rebind requires the exact persisted parent Session.");
    }
    return inspectOwnedSessions({
        runtime: dependencies.inspection,
        parentSessionId: dependencies.expectedParentSessionId as never,
        meetingId: dependencies.meetingId,
        ownerships: dependencies.ownerships,
        signal: dependencies.signal
    });
}

export async function recoverMeetingRuntime(
    dependencies: MeetingRecoveryDependencies
): Promise<MeetingRecoveryResult> {
    const recovered = await dependencies.repository.recover({ now: dependencies.now?.() });
    if (dependencies.parent === undefined || dependencies.inspection === undefined) {
        return { ...recovered, parentStatus: "absent" };
    }
    if (recovered.snapshot === undefined) {
        return { ...recovered, parentStatus: "absent" };
    }
    const ownershipInspection = await inspectOwnedSessions({
        runtime: dependencies.inspection,
        parentSessionId: dependencies.parent.id,
        meetingId: recovered.snapshot.meetingId,
        ownerships: recovered.sessionOwnership,
        signal: dependencies.signal
    });
    return { ...recovered, parentStatus: "bound", ownershipInspection };
}
