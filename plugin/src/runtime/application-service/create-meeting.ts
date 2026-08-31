import { createHash } from "node:crypto";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { interruptAndDrainOwnedSessions } from "../../dsh/index.js";
import {
    startManagerPlanning,
    type ArchivePackage,
    type CreateContinuationSpec,
    type MeetingState
} from "../../domain/index.js";
import type { CreateMeetingInputV1, CreateMeetingResultV1 } from "../../protocol/index.js";
import { commandFailure, commandSuccess } from "../services/command-result-service.js";
import { locateMeetingRepository } from "../services/meeting-repository-locator.js";
import type { MeetingRehydrationService } from "../services/meeting-recovery-service.js";
import type { MeetingDeliveryWorkerService } from "../services/types.js";
import {
    createMeetingRuntime,
    openMeetingRepository,
    type DomainEventInput,
    type JsonObject,
    type MeetingCreationRuntimeDependencies
} from "../meeting-runtime.js";
import { initializeFirstMeetingTurn } from "./meeting-turn.js";
import type { CreateStatusRuntimeOptions, MeetingToolCaller } from "./index.js";
import type { StoredMeeting } from "./types.js";

type ContinuationResolution =
    | { readonly ok: true; readonly continuation?: CreateContinuationSpec }
    | { readonly ok: false; readonly error: ReturnType<typeof commandFailure> };

function nonBlank(value: string | undefined): string | undefined {
    return value !== undefined && value.trim() ? value : undefined;
}

function requireUniqueSelectionIds(ids: readonly string[]): boolean {
    const seen = new Set<string>();
    return ids.every((id) => {
        if (!id.trim() || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function archiveMaterialFailure(message: string): ContinuationResolution {
    return { ok: false, error: commandFailure("ARCHIVE_MATERIAL_NOT_FOUND", message) };
}

function invalidContinuationInput(message: string): ContinuationResolution {
    return { ok: false, error: commandFailure("INVALID_ARGUMENT", message) };
}

function sourceArchive(state: MeetingState): ArchivePackage | undefined {
    const archive = state.archive?.package;
    if (
        state.status !== "archived" ||
        archive === undefined ||
        archive.meetingId !== state.id ||
        archive.teamId !== state.teamId ||
        !Array.isArray(archive.acceptedDecisions) ||
        !Array.isArray(archive.issues) ||
        !Array.isArray(archive.completionFacts) ||
        !Array.isArray(archive.artifactRefs)
    ) {
        return undefined;
    }
    return archive as ArchivePackage;
}

async function resolveContinuationSelection(
    selection: CreateMeetingInputV1["continuation"],
    inputTeamId: string,
    caller: MeetingToolCaller,
    recovery: MeetingRehydrationService,
    meetings: Map<string, StoredMeeting>
): Promise<ContinuationResolution> {
    if (selection === undefined) return { ok: true };
    const allSelections = [
        selection.decisionIds,
        selection.unresolvedIssueIds,
        selection.riskIds,
        selection.evidenceIds,
        selection.artifactIds
    ];
    if (!selection.sourceMeetingId.trim() || !allSelections.every(requireUniqueSelectionIds)) {
        return invalidContinuationInput(
            "Continuation selections must contain unique non-empty IDs."
        );
    }
    const selectedIssueIds = new Set(selection.unresolvedIssueIds);
    if (selection.riskIds.some((id) => selectedIssueIds.has(id))) {
        return invalidContinuationInput(
            "An archive issue cannot be selected as both issue and risk."
        );
    }

    const snapshots = await recovery.rehydrate({
        kind: "local_meeting",
        meetingId: selection.sourceMeetingId
    });
    const sourceSnapshot = snapshots?.get(selection.sourceMeetingId);
    const source = meetings.get(selection.sourceMeetingId);
    if (sourceSnapshot === undefined || source === undefined) {
        return archiveMaterialFailure("The continuation source archive is unavailable.");
    }
    const sourceState = sourceSnapshot.state as unknown as MeetingState;
    if (source.teamId !== inputTeamId || source.captainSessionId !== caller.sessionId) {
        return archiveMaterialFailure("The caller cannot read the continuation source archive.");
    }
    const archive = sourceArchive(sourceState);
    if (archive === undefined) {
        return {
            ok: false,
            error: commandFailure(
                "SOURCE_MEETING_NOT_ARCHIVED",
                "The continuation source meeting is not archived with a materialized archive package."
            )
        };
    }

    const materials: Array<CreateContinuationSpec["materials"][number]> = [];
    const append = (
        sourceKind: CreateContinuationSpec["materials"][number]["sourceKind"],
        sourceObjectId: string | undefined,
        summary: string | undefined,
        checksum?: string
    ): ContinuationResolution | undefined => {
        const stableSummary = nonBlank(summary);
        if (stableSummary === undefined) {
            return invalidContinuationInput("The selected archive material has no usable summary.");
        }
        materials.push({
            sourceMeetingId: selection.sourceMeetingId,
            sourceKind,
            ...(sourceObjectId === undefined ? {} : { sourceObjectId }),
            summary: stableSummary,
            ...(checksum === undefined ? {} : { checksum })
        });
        return undefined;
    };

    if (selection.includeFinalSummary) {
        const failure = append("final_summary", undefined, archive.finalSummary);
        if (failure !== undefined) return failure;
    }
    for (const id of selection.decisionIds) {
        const decision = archive.acceptedDecisions.find(
            (candidate) => candidate.id === id && candidate.status === "accepted"
        );
        if (decision === undefined)
            return archiveMaterialFailure("The selected decision is unavailable.");
        const failure = append("decision", id, nonBlank(decision.statement) ?? decision.rationale);
        if (failure !== undefined) return failure;
    }
    for (const id of selection.unresolvedIssueIds) {
        const issue = archive.issues.find((candidate) => candidate.id === id);
        if (
            issue === undefined ||
            !(
                ["open", "waiting", "deferred"].includes(issue.status) ||
                ["blocking", "follow_up"].includes(issue.disposition)
            )
        ) {
            return archiveMaterialFailure("The selected unresolved issue is unavailable.");
        }
        const failure = append(
            "issue",
            id,
            nonBlank(issue.title) ?? nonBlank(issue.description) ?? issue.rationale
        );
        if (failure !== undefined) return failure;
    }
    for (const id of selection.riskIds) {
        const issue = archive.issues.find((candidate) => candidate.id === id);
        if (issue === undefined || !["accepted_risk", "blocking"].includes(issue.disposition)) {
            return archiveMaterialFailure("The selected risk is unavailable.");
        }
        const failure = append(
            "risk",
            id,
            nonBlank(issue.title) ?? nonBlank(issue.description) ?? issue.rationale
        );
        if (failure !== undefined) return failure;
    }
    for (const id of selection.evidenceIds) {
        const evidence = archive.completionFacts.find((candidate) => candidate.id === id);
        if (evidence === undefined)
            return archiveMaterialFailure("The selected evidence is unavailable.");
        const failure = append("evidence", id, evidence.reason);
        if (failure !== undefined) return failure;
    }
    for (const id of selection.artifactIds) {
        const artifact = archive.artifactRefs.find((candidate) => candidate.artifactId === id);
        if (artifact === undefined)
            return archiveMaterialFailure("The selected artifact is unavailable.");
        const failure = append("artifact", id, artifact.title, artifact.checksum);
        if (failure !== undefined) return failure;
    }
    return {
        ok: true,
        continuation: { sourceMeetingId: selection.sourceMeetingId, materials }
    };
}

function stableMeetingId(input: CreateMeetingInputV1): string {
    return `meeting-${createHash("sha256")
        .update(`${input.teamId}\0${input.requestId}`)
        .digest("hex")
        .slice(0, 32)}`;
}

function requestHash(input: CreateMeetingInputV1): string {
    return JSON.stringify(input);
}

function runningCreateResult(
    input: CreateMeetingInputV1,
    meetingId: string,
    meetingVersion: number
): CreateMeetingResultV1 {
    return {
        meetingId,
        meetingVersion,
        status: "running",
        participants: input.participants.map(({ participantKey }) => ({
            participantKey,
            participantId: `participant-${participantKey}`
        }))
    };
}

export interface CreateMeetingApplicationOptions {
    readonly runtime: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
    readonly deliveryWorkers: MeetingDeliveryWorkerService;
    readonly ensureWorker: (stored: StoredMeeting) => void;
    readonly signal: AbortSignal;
}

export function createMeetingApplication(options: CreateMeetingApplicationOptions) {
    return async function createMeeting(
        input: CreateMeetingInputV1,
        caller: MeetingToolCaller,
        commandSignal: AbortSignal
    ) {
        if (caller.kind !== "captain" || caller.agent === undefined) {
            return commandFailure(
                "UNAUTHORIZED_CALLER",
                "Only a live Captain Agent can create a meeting."
            );
        }
        if (
            options.runtime.maxParticipants !== undefined &&
            input.participants.length > options.runtime.maxParticipants
        ) {
            return commandFailure("INVALID_ARGUMENT", "The participant limit was exceeded.");
        }
        if (input.agenda.length === 0) {
            return commandFailure("INVALID_ARGUMENT", "At least one agenda item is required.");
        }
        const continuation = await resolveContinuationSelection(
            input.continuation,
            input.teamId,
            caller,
            options.recovery,
            options.meetings
        );
        if (!continuation.ok) return continuation.error;
        await options.recovery.rehydrate();
        const meetingId = stableMeetingId(input);
        const repository = await openMeetingRepository({
            databasePath: locateMeetingRepository(
                options.runtime.dataRoot,
                input.teamId,
                meetingId
            ),
            teamId: input.teamId,
            meetingId,
            authorizationValidator: options.runtime.authorizationValidator
        });
        const dependencies: MeetingCreationRuntimeDependencies = {
            repository,
            continuable: options.runtime.continuable,
            parent: caller.agent as Agent,
            provider: options.runtime.provider,
            authorization: {
                callerBinding: `session:${caller.sessionId}`,
                capabilityId: `captain:${caller.sessionId}`
            },
            allocateSessionId: (role, key) => `${meetingId}-${role}-${key}` as never,
            signal: commandSignal ?? options.signal,
            now: options.runtime.now,
            speakerAttemptTimeoutMs: options.runtime.speakerAttemptTimeoutMs,
            continuation: continuation.continuation,
            cleanup: async (created) => {
                const recovered = await repository.recover();
                const owned = recovered.sessionOwnership.filter((candidate) =>
                    created.some((item) => item.sessionId === candidate.sessionId)
                );
                const lifecycle = options.runtime
                    .continuable as typeof options.runtime.continuable & {
                    interrupt?: (sessionId: never, authority: unknown) => void;
                    drainContinuableChildren?: (
                        parent: Agent,
                        ids: readonly never[]
                    ) => Promise<void>;
                };
                if (
                    caller.agent !== undefined &&
                    lifecycle.interrupt !== undefined &&
                    lifecycle.drainContinuableChildren !== undefined &&
                    owned.length > 0
                ) {
                    await interruptAndDrainOwnedSessions({
                        runtime: lifecycle as never,
                        parent: caller.agent,
                        ownerships: owned
                    });
                }
                for (const ownership of owned) {
                    await repository.recordSessionOwnership(
                        {
                            ...ownership,
                            capabilityStatus: "revoked",
                            lifecycleStatus: "closed"
                        },
                        options.runtime.now?.() ?? Date.now()
                    );
                }
            }
        };
        try {
            const existing = await repository.recover().catch(() => undefined);
            let resumeReadyCreate = false;
            if (
                existing?.bootstrap.status === "ready" &&
                existing.bootstrap.createResult !== undefined
            ) {
                if (existing.bootstrap.requestHash !== requestHash(input)) {
                    await repository.close();
                    return commandFailure(
                        "IDEMPOTENCY_CONFLICT",
                        "The create request conflicts with the persisted meeting."
                    );
                }
                const persistedCaptain = existing.sessionOwnership[0]?.parentSessionId;
                if (persistedCaptain !== caller.sessionId) {
                    await repository.close();
                    return commandFailure(
                        "UNAUTHORIZED_CALLER",
                        "Only the original meeting Captain can replay creation."
                    );
                }
                const resident = options.meetings.get(meetingId);
                if (resident?.parent !== undefined) {
                    await repository.close();
                    const persisted = existing.bootstrap.createResult;
                    return commandSuccess(
                        meetingId,
                        persisted.meetingVersion,
                        persisted as CreateMeetingResultV1
                    );
                }
                if (resident !== undefined) {
                    await resident.repository.close();
                    options.meetings.delete(meetingId);
                }
                const replayedMeeting: StoredMeeting = {
                    teamId: input.teamId,
                    captainSessionId: caller.sessionId,
                    repository
                };
                options.meetings.set(meetingId, replayedMeeting);
                options.ensureWorker(replayedMeeting);
                const persisted = existing.bootstrap.createResult;
                if (persisted.status === "running" && persisted.participants !== undefined) {
                    return commandSuccess(
                        meetingId,
                        persisted.meetingVersion,
                        persisted as CreateMeetingResultV1
                    );
                }
                resumeReadyCreate = true;
            }
            if (!resumeReadyCreate) await createMeetingRuntime(input, dependencies);
            if (input.selectionMode === "manager") {
                const started = await repository.execute({
                    requestId: `${input.requestId}:start-manager-planning`,
                    commandKind: "start_manager_planning",
                    authorization: dependencies.authorization,
                    requestHash: `${requestHash(input)}:start-manager-planning`,
                    expectedMeetingVersion: 0,
                    transition: (snapshot) => {
                        const transition = startManagerPlanning(
                            snapshot.state as unknown as MeetingState,
                            {
                                meetingId,
                                planningAttemptId: `${meetingId}-planning-1`,
                                deliveryId: `${meetingId}-planning-delivery-1`,
                                reason: "initial_plan",
                                now: options.runtime.now?.() ?? Date.now()
                            }
                        );
                        return {
                            state: transition.state as unknown as JsonObject,
                            result: { status: "planning" },
                            events: transition.effect.events as unknown as DomainEventInput[],
                            outbox: [
                                {
                                    deliveryId: `${meetingId}-planning-delivery-1`,
                                    kind: "dispatch",
                                    payload: {
                                        role: "manager",
                                        planningAttemptId: `${meetingId}-planning-1`
                                    }
                                }
                            ]
                        };
                    }
                });
                const result = runningCreateResult(input, meetingId, started.meetingVersion);
                await repository.updateCreateResult({
                    expectedMeetingVersion: started.meetingVersion,
                    result,
                    now: options.runtime.now?.()
                });
                options.meetings.set(meetingId, {
                    teamId: input.teamId,
                    captainSessionId: caller.sessionId,
                    repository,
                    parent: caller.agent
                });
                options.ensureWorker(options.meetings.get(meetingId)!);
                options.deliveryWorkers.wake(meetingId);
                return commandSuccess(meetingId, started.meetingVersion, result);
            }
            const meetingVersion = await initializeFirstMeetingTurn(
                repository,
                options.runtime.now?.() ?? Date.now()
            );
            const result = runningCreateResult(input, meetingId, meetingVersion);
            await repository.updateCreateResult({
                expectedMeetingVersion: meetingVersion,
                result,
                now: options.runtime.now?.()
            });
            options.meetings.set(meetingId, {
                teamId: input.teamId,
                captainSessionId: caller.sessionId,
                repository,
                parent: caller.agent
            });
            options.ensureWorker(options.meetings.get(meetingId)!);
            options.deliveryWorkers.wake(meetingId);
            return commandSuccess(meetingId, meetingVersion, result);
        } catch (error) {
            await repository.close();
            if (error && typeof error === "object" && "code" in error) {
                const code = (error as { code?: unknown }).code;
                if (code === "UNSUPPORTED_CAPABILITY") {
                    return commandFailure("UNSUPPORTED_CAPABILITY", String(error));
                }
                if (code === "INVALID_CREATE_INPUT") {
                    return commandFailure("INVALID_ARGUMENT", String(error));
                }
            }
            return commandFailure("INTERNAL_ERROR", "The meeting could not be created.", true);
        }
    };
}
