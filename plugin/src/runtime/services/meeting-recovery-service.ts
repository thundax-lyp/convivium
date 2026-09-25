import type { Agent } from "@deepseek-ai/dsh-agent";
import { inspectOwnedSessions, type OwnedSessionInspection } from "@/dsh/index.js";
import type { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import type { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import type { MeetingRepositoryPort as MeetingRepository } from "@/repository/meeting-repository-port.js";
import type { MeetingBootstrap, MeetingSnapshot, RecoveryResult } from "@/repository/types.js";

export class LocalMeetingRecoveryUnavailableError extends Error {
    readonly name = "LocalMeetingRecoveryUnavailableError";
}

export interface RecoverableMeeting {
    readonly meetingId: string;
    readonly creator: MeetingBootstrap["creator"];
    readonly repository: MeetingRepository;
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
    readonly isCreating?: (meetingId: string) => boolean;
    readonly reconcile?: (
        repository: MeetingRepository,
        existing?: RecoverableMeeting
    ) => Promise<void>;
}

export interface MeetingRehydrationService {
    rehydrate(mode?: RehydrateMode): Promise<Map<string, MeetingSnapshot> | undefined>;
}

/** Owns catalog discovery and repository recovery; it makes no meeting command decisions. */
export const createMeetingRehydrationService = (
    options: MeetingRehydrationServiceOptions
): MeetingRehydrationService => {
    const unavailable = (error: unknown): LocalMeetingRecoveryUnavailableError =>
        error instanceof LocalMeetingRecoveryUnavailableError
            ? error
            : new LocalMeetingRecoveryUnavailableError("Local meeting recovery is unavailable.", {
                  cause: error
              });
    const recoverLocal = async (
        snapshots: Map<string, MeetingSnapshot>,
        meetingId: string,
        existing?: RecoverableMeeting
    ): Promise<void> => {
        if (options.isCreating?.(meetingId)) return;
        let repository = existing?.repository;
        try {
            if (repository === undefined) {
                repository = await (await options.registry).openMeeting({ meetingId });
            }
            await options.reconcile?.(repository, existing);
            const recovered = await repository.recover();
            if (
                recovered.bootstrap.status === "creating" ||
                recovered.bootstrap.status === "creation_failed"
            ) {
                if (existing !== undefined) options.meetings.delete(meetingId);
                return;
            }
            if (recovered.snapshot === undefined) {
                throw new Error("Ready Meeting recovery is incomplete.");
            }
            const current = await repository.read();
            if (existing === undefined) {
                options.meetings.set(meetingId, {
                    meetingId,
                    creator: recovered.bootstrap.creator,
                    repository
                });
            }
            snapshots.set(meetingId, current);
        } catch (error) {
            throw unavailable(error);
        }
    };

    return {
        async rehydrate(mode = { kind: "agent_best_effort" }) {
            if (mode.kind !== "agent_best_effort") {
                const snapshots = new Map<string, MeetingSnapshot>();
                if (mode.kind === "local_meeting") {
                    const existing = options.meetings.get(mode.meetingId);
                    if (existing !== undefined) {
                        await recoverLocal(snapshots, mode.meetingId, existing);
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
                if (
                    options.meetings.has(record.meetingId) ||
                    options.isCreating?.(record.meetingId)
                )
                    continue;
                try {
                    const repository = await (
                        await options.registry
                    ).openMeeting({ meetingId: record.meetingId });
                    await options.reconcile?.(repository);
                    const recovered = await repository.recover();
                    if (recovered.bootstrap.status !== "ready" || recovered.snapshot === undefined)
                        continue;
                    options.meetings.set(record.meetingId, {
                        meetingId: record.meetingId,
                        creator: recovered.bootstrap.creator,
                        repository
                    });
                } catch {
                    // Ignore unrelated or incomplete catalog records during startup discovery.
                }
            }
        }
    };
};

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
