import { createHash } from "node:crypto";
import {
    applyContributionCommand,
    evaluateContributionProgress,
    assertContributionCapacity,
    DomainError,
    isMeetingStateV2,
    type ContributionActor,
    type DomainContributionCommand,
    type LegacyMeetingState
} from "@/domain/index.js";
import { projectContributionRead, type MeetingProjectionCaller } from "@/projection/index.js";
import {
    ContributionCommandSchema,
    ContributionResultSchema,
    ReadContributionInputSchema,
    ReadContributionResultSchema,
    serializeValidatedRequestV1,
    type ContributionCommandV1,
    type ContributionResultV1,
    type ReadContributionInputV1
} from "@/protocol/index.js";
import { JsonObjectSchema } from "@/repository/domain/schemas.js";
import { preparePublicSubmission } from "@/runtime/services/public-submission-service.js";
import {
    contributionOutbox,
    interruptCancelledContributions
} from "@/runtime/services/contribution-runtime-service.js";
import type { DomainEvent } from "@/domain/index.js";
import { commandSuccess, mapCommandError } from "@/runtime/services/command-result-service.js";
import type { MeetingRehydrationService } from "@/runtime/services/meeting-recovery-service.js";
import type { MeetingDeliveryWorkerService } from "@/runtime/services/types.js";
import type {
    CreateStatusRuntimeOptions,
    MeetingToolCaller,
    MeetingToolRuntime,
    LocalMeetingWebRuntime,
    StoredMeeting
} from "./types.js";

export interface MeetingContributionApplicationOptions {
    options: CreateStatusRuntimeOptions;
    meetings: Map<string, StoredMeeting>;
    recovery: MeetingRehydrationService;
    deliveryWorkers: MeetingDeliveryWorkerService;
}

function domainCommand(
    input: ContributionCommandV1,
    state: LegacyMeetingState,
    now: number
): DomainContributionCommand {
    if (input.action !== "submit") return input;
    const task = state.contributions?.tasks[input.contributionId];
    if (task === undefined)
        throw new DomainError("UNAUTHORIZED_CALLER", "Contribution is unavailable.");
    const revision = input.expectedDraftRevision + 1;
    const prepared = preparePublicSubmission(input.body, {
        messageId: `message-${input.contributionId}-${revision}`,
        idSeed: `${input.contributionId}-${revision}`,
        agendaItemId: task.agendaItemId,
        now
    });
    return {
        action: "submit",
        contributionId: input.contributionId,
        generation: input.generation,
        expectedDraftRevision: input.expectedDraftRevision,
        draft: {
            revision,
            basedOnSeq: input.basedOnSeq,
            submittedAt: now,
            ...prepared,
            citations: input.citations
        }
    };
}

function commandResult(
    input: ContributionCommandV1,
    state: LegacyMeetingState,
    newId: string,
    newEvidenceId: string
): ContributionResultV1 {
    if (input.action === "notify_manager")
        return { managerNoticeSeq: state.contributions!.managerNoticeSeq };
    const task =
        state.contributions!.tasks[input.action === "assign" ? newId : input.contributionId]!;
    return ContributionResultSchema({
        contributionId: task.id,
        generation: task.generation,
        phase: task.phase,
        ...(input.action === "save_evidence"
            ? {
                  evidenceKey: `${input.evidenceId ?? newEvidenceId}:${input.expectedEvidenceRevision + 1}`
              }
            : {}),
        ...(["submit", "boundary_review", "evidence_review"].includes(input.action)
            ? { draftRevision: task.currentDraftRevision }
            : {}),
        ...(input.action === "evidence_review" ||
        (input.action === "boundary_review" && input.decision === "approve")
            ? { messageId: task.messageId }
            : {})
    });
}

export function createMeetingContributionApplication({
    options,
    meetings,
    recovery,
    deliveryWorkers
}: MeetingContributionApplicationOptions): Pick<
    MeetingToolRuntime,
    "applyContribution" | "readContribution"
> &
    Pick<LocalMeetingWebRuntime, "controlLocalContribution" | "readLocalContribution"> {
    async function authorized(
        meetingId: string,
        caller: MeetingToolCaller | undefined,
        signal: AbortSignal
    ): Promise<{
        stored: StoredMeeting;
        viewer: MeetingProjectionCaller;
        actor: ContributionActor;
        callerBinding: string;
        capabilityId: string;
    }> {
        signal.throwIfAborted();
        await recovery.rehydrate(
            caller === undefined ? { kind: "local_meeting", meetingId } : undefined
        );
        signal.throwIfAborted();
        const stored = meetings.get(meetingId);
        if (stored === undefined)
            throw new DomainError("UNAUTHORIZED_CALLER", "Meeting is unavailable.");
        if (caller === undefined)
            return {
                stored,
                viewer: { kind: "local_host", sessionId: "loopback-web" },
                actor: { kind: "local_host" },
                callerBinding: "local-host:loopback-web",
                capabilityId: "local-host:loopback-web"
            };
        if (
            (caller.meetingId !== undefined && caller.meetingId !== meetingId) ||
            (caller.kind === "captain" && caller.sessionId !== stored.captainSessionId)
        )
            throw new DomainError("UNAUTHORIZED_CALLER", "Caller is not bound to this meeting.");
        if (caller.kind !== "captain") {
            const recovered = await stored.repository.recover();
            const ownership = recovered.sessionOwnership.find(
                (v) =>
                    v.sessionId === caller.sessionId &&
                    v.parentSessionId === stored.captainSessionId &&
                    v.role === caller.kind &&
                    v.lifecycleStatus === "active" &&
                    v.capabilityStatus === "active"
            );
            if (
                caller.meetingId !== meetingId ||
                ownership === undefined ||
                (caller.kind === "participant" &&
                    (caller.participantId === undefined ||
                        caller.participantId !== ownership.participantId))
            )
                throw new DomainError(
                    "UNAUTHORIZED_CALLER",
                    "Caller is not bound to this meeting."
                );
        }
        return {
            stored,
            viewer: caller,
            actor:
                caller.kind === "participant"
                    ? { kind: "participant", participantId: caller.participantId! }
                    : { kind: caller.kind },
            callerBinding: `session:${caller.sessionId}`,
            capabilityId: `${caller.kind}:${caller.sessionId}`
        };
    }

    async function apply(
        raw: ContributionCommandV1,
        caller: MeetingToolCaller | undefined,
        signal: AbortSignal
    ) {
        try {
            const input = ContributionCommandSchema(raw);
            const binding = await authorized(input.meetingId, caller, signal);
            const current = await binding.stored.repository.read();
            if (current.meetingId !== input.meetingId)
                throw new DomainError("UNAUTHORIZED_CALLER", "Meeting binding is invalid.");
            if (
                caller === undefined &&
                !["retry", "cancel", "notify_manager"].includes(input.action)
            )
                throw new DomainError(
                    "UNAUTHORIZED_CALLER",
                    "Local control cannot submit or review contributions."
                );
            const now = options.now?.() ?? Date.now();
            const hash = createHash("sha256")
                .update(`${input.meetingId}\0${binding.callerBinding}\0${input.requestId}`)
                .digest("hex")
                .slice(0, 32);
            const newId = `contribution-${hash}`,
                newEvidenceId = `evidence-${hash}`;
            signal.throwIfAborted();
            let committedEvents: readonly DomainEvent[] = [];
            const committed = await binding.stored.repository.execute<ContributionResultV1>({
                requestId: input.requestId,
                commandKind: `contribution:${input.action}`,
                authorization: {
                    callerBinding: binding.callerBinding,
                    capabilityId: binding.capabilityId
                },
                requestHash: serializeValidatedRequestV1(input),
                expectedMeetingVersion: input.expectedMeetingVersion,
                transition(snapshot) {
                    signal.throwIfAborted();
                    if (!isMeetingStateV2(snapshot.state))
                        throw new DomainError("INVALID_ARGUMENT", "Invalid meeting state.");
                    const before = snapshot.state;
                    if (!["running", "waiting"].includes(before.status))
                        throw new DomainError(
                            "INVALID_STATE_TRANSITION",
                            "Contributions are not writable in this meeting state."
                        );
                    const command = domainCommand(input, before, now);
                    const revision =
                        "draftRevision" in input
                            ? input.draftRevision
                            : "expectedDraftRevision" in input
                              ? input.expectedDraftRevision + 1
                              : 0;
                    const id = "contributionId" in input ? input.contributionId : newId;
                    const transition = applyContributionCommand(before, command, {
                        now,
                        actor: binding.actor,
                        newContributionId: newId,
                        newEvidenceId,
                        completionFactId: (kind, index) =>
                            `completion-${id}-${revision}-${kind}-${index}`
                    });
                    const progress = evaluateContributionProgress(transition.state, now);
                    const events = [
                        ...transition.effect.events.filter(
                            (event) => event.type !== "contribution.manager_notified"
                        ),
                        ...progress.effect.events,
                        ...(progress.effect.events.some(
                            (event) => event.type === "contribution.manager_notified"
                        )
                            ? []
                            : transition.effect.events.filter(
                                  (event) => event.type === "contribution.manager_notified"
                              ))
                    ];
                    committedEvents = events;
                    assertContributionCapacity(progress.state);
                    return {
                        state: JsonObjectSchema.parse(JSON.parse(JSON.stringify(progress.state))),
                        result: commandResult(input, progress.state, newId, newEvidenceId),
                        events: events.map((event) => ({
                            type: event.type,
                            payload: JsonObjectSchema.parse(event.payload)
                        })),
                        outbox: [...contributionOutbox(before, progress.state, events)]
                    };
                }
            });
            await interruptCancelledContributions({
                repository: binding.stored.repository,
                parent: binding.stored.parent,
                runtime: options.continuable,
                events: committedEvents
            });
            deliveryWorkers.wake(input.meetingId);
            return commandSuccess(input.meetingId, committed.meetingVersion, committed.result);
        } catch (error) {
            return mapCommandError(
                error,
                error instanceof TypeError ? "INVALID_ARGUMENT" : "INTERNAL_ERROR",
                "Contribution command failed."
            );
        }
    }

    async function read(
        raw: ReadContributionInputV1,
        caller: MeetingToolCaller | undefined,
        signal: AbortSignal
    ) {
        try {
            const input = ReadContributionInputSchema(raw);
            const { stored, viewer } = await authorized(input.meetingId, caller, signal);
            const snapshot = await stored.repository.read();
            signal.throwIfAborted();
            if (!isMeetingStateV2(snapshot.state))
                throw new DomainError("INVALID_ARGUMENT", "Invalid meeting state.");
            return commandSuccess(
                input.meetingId,
                snapshot.version,
                ReadContributionResultSchema(projectContributionRead(snapshot.state, viewer, input))
            );
        } catch (error) {
            return mapCommandError(
                error,
                error instanceof TypeError ? "INVALID_ARGUMENT" : "INTERNAL_ERROR",
                "Contribution is unavailable."
            );
        }
    }
    return {
        applyContribution: apply,
        readContribution: read,
        controlLocalContribution: (input, signal) => apply(input, undefined, signal),
        readLocalContribution: (input, signal) => read(input, undefined, signal)
    };
}
