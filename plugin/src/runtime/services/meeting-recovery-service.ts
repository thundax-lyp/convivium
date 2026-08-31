import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    inspectOwnedSessions,
    type ContinuableInspectionRuntime,
    type OwnedSessionInspection
} from "../../dsh/index.js";
import type { MeetingState } from "../../domain/index.js";
import type { MeetingRepository, RecoveryResult } from "../../repository/index.js";
import type { MeetingSnapshot } from "../../repository/index.js";
import {
    openMeetingRepository,
    type RepositoryAuthorizationValidator
} from "../meeting-runtime.js";
import { recoverArchive } from "./meeting-archive-service.js";
import { locateMeetingRepository } from "./meeting-repository-locator.js";

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
    readonly dataRoot: string;
    readonly authorizationValidator: RepositoryAuthorizationValidator;
    readonly meetings: Map<string, RecoverableMeeting>;
    readonly signal: AbortSignal;
    readonly now?: () => number;
}

export interface MeetingRehydrationService {
    rehydrate(mode?: RehydrateMode): Promise<Map<string, MeetingSnapshot> | undefined>;
}

/** Owns filesystem discovery and repository recovery; it makes no meeting command decisions. */
export function createMeetingRehydrationService(
    options: MeetingRehydrationServiceOptions
): MeetingRehydrationService {
    const unavailable = (error: unknown): LocalMeetingRecoveryUnavailableError =>
        error instanceof LocalMeetingRecoveryUnavailableError
            ? error
            : new LocalMeetingRecoveryUnavailableError("Local meeting recovery is unavailable.", {
                  cause: error
              });
    const isMissing = (error: unknown): boolean =>
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "ENOENT";

    async function recoverLocal(
        snapshots: Map<string, MeetingSnapshot>,
        meetingId: string,
        teamId: string,
        databasePath: string,
        existing?: RecoverableMeeting
    ): Promise<void> {
        let repository = existing?.repository;
        let opened = false;
        try {
            if (repository === undefined) {
                repository = await openMeetingRepository({
                    databasePath,
                    teamId,
                    meetingId,
                    authorizationValidator: options.authorizationValidator
                });
                opened = true;
            } else if (existing?.teamId !== teamId) {
                throw new Error("Recovered Meeting team ownership does not match discovery.");
            }
            const recovered = await repository.recover();
            if (
                recovered.bootstrap.status === "creating" ||
                recovered.bootstrap.status === "creation_failed"
            ) {
                if (existing !== undefined) options.meetings.delete(meetingId);
                await repository.close();
                return;
            }
            const parentSessionId = recovered.sessionOwnership[0]?.parentSessionId;
            if (recovered.snapshot === undefined || parentSessionId === undefined) {
                throw new Error("Ready Meeting recovery is incomplete.");
            }
            const recoveredState = recovered.snapshot.state as unknown as MeetingState;
            if (recoveredState.status === "archiving" || recoveredState.status === "archived") {
                await recoverArchive({
                    repository,
                    signal: options.signal,
                    now: options.now?.() ?? Date.now()
                });
            }
            const current = await repository.read();
            if (opened) {
                options.meetings.set(meetingId, {
                    teamId,
                    captainSessionId: parentSessionId,
                    repository
                });
            }
            snapshots.set(meetingId, current);
        } catch (error) {
            if (opened && repository !== undefined) {
                await repository.close().catch(() => undefined);
            }
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
                        await recoverLocal(
                            snapshots,
                            mode.meetingId,
                            existing.teamId,
                            locateMeetingRepository(
                                options.dataRoot,
                                existing.teamId,
                                mode.meetingId
                            ),
                            existing
                        );
                        return snapshots;
                    }
                }
                let teams;
                try {
                    teams = await readdir(options.dataRoot, { withFileTypes: true });
                } catch (error) {
                    if (isMissing(error)) return snapshots;
                    throw unavailable(error);
                }
                for (const team of teams) {
                    if (!team.isDirectory()) continue;
                    let teamId: string;
                    try {
                        teamId = decodeURIComponent(team.name);
                    } catch (error) {
                        throw unavailable(error);
                    }
                    let files: string[];
                    try {
                        files = await readdir(join(options.dataRoot, team.name));
                    } catch (error) {
                        throw unavailable(error);
                    }
                    for (const file of files) {
                        if (!file.endsWith(".sqlite")) continue;
                        let meetingId: string;
                        try {
                            meetingId = decodeURIComponent(file.slice(0, -7));
                        } catch (error) {
                            if (mode.kind === "local_list") throw unavailable(error);
                            continue;
                        }
                        if (mode.kind === "local_meeting" && meetingId !== mode.meetingId) continue;
                        await recoverLocal(
                            snapshots,
                            meetingId,
                            teamId,
                            join(options.dataRoot, team.name, file),
                            options.meetings.get(meetingId)
                        );
                        if (mode.kind === "local_meeting") return snapshots;
                    }
                }
                return snapshots;
            }

            const teams = await readdir(options.dataRoot, { withFileTypes: true }).catch(() => []);
            for (const team of teams) {
                if (!team.isDirectory()) continue;
                const files = await readdir(join(options.dataRoot, team.name)).catch(() => []);
                for (const file of files) {
                    if (!file.endsWith(".sqlite")) continue;
                    const meetingId = decodeURIComponent(file.slice(0, -7));
                    if (options.meetings.has(meetingId)) continue;
                    try {
                        const repository = await openMeetingRepository({
                            databasePath: join(options.dataRoot, team.name, file),
                            teamId: decodeURIComponent(team.name),
                            meetingId,
                            authorizationValidator: options.authorizationValidator
                        });
                        const recovered = await repository.recover();
                        const parentSessionId = recovered.sessionOwnership[0]?.parentSessionId;
                        if (
                            recovered.bootstrap.status !== "ready" ||
                            recovered.snapshot === undefined ||
                            parentSessionId === undefined
                        ) {
                            await repository.close();
                            continue;
                        }
                        options.meetings.set(meetingId, {
                            teamId: decodeURIComponent(team.name),
                            captainSessionId: parentSessionId,
                            repository
                        });
                        await recoverArchive({
                            repository,
                            signal: options.signal,
                            now: options.now?.() ?? Date.now()
                        });
                    } catch {
                        // Ignore unrelated or incomplete databases during startup discovery.
                    }
                }
            }
        }
    };
}

export interface MeetingRecoveryDependencies {
    readonly repository: Pick<MeetingRepository, "recover">;
    readonly inspection?: ContinuableInspectionRuntime;
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
    readonly inspection: ContinuableInspectionRuntime;
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
