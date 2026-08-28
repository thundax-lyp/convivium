import type { MeetingState } from "../domain/model.js";
import type {
    ExecutionTerminalMeetingStatusResultV1,
    ManagerMeetingContextV1,
    MeetingStatusResultV1,
    PublicAgendaItemV1,
    PublicMeetingMessageV1,
    PublicHandRaiseV1,
    MeetingTaskProjectionV1,
    PublicTurnV1
} from "../protocol/index.js";

export interface MeetingProjectionCaller {
    readonly kind: "captain" | "manager" | "participant";
    readonly sessionId: string;
    readonly participantId?: string;
}

function agendaItem(item: MeetingState["agenda"][number]): PublicAgendaItemV1 {
    return {
        id: item.id,
        title: item.title,
        objective: item.objective,
        inScope: item.inScope,
        outOfScope: item.outOfScope,
        completionCriteria: item.completionCriteria,
        ...(item.owner === undefined ? {} : { owner: item.owner }),
        requiredParticipants: item.requiredParticipants,
        relatedTaskIds: item.relatedTaskIds,
        status: item.status,
        ...(item.resolution === undefined ? {} : { resolution: item.resolution })
    };
}

function message(value: MeetingState["transcript"][number]): PublicMeetingMessageV1 {
    return {
        id: value.id,
        seq: value.seq,
        turnId: value.turnId,
        stepId: value.stepId,
        speaker: value.speaker,
        agendaItemId: value.agendaItemId,
        kind: value.kind,
        content: value.content,
        mentions: value.mentions,
        ...(value.replyTo === undefined ? {} : { replyTo: value.replyTo }),
        taskIds: value.taskIds,
        createdAt: value.createdAt
    };
}

function meetingTask(value: MeetingState["meetingTasks"][number]): MeetingTaskProjectionV1 {
    return {
        meetingTaskId: value.meetingTaskId,
        participantId: value.participantId,
        title: value.title,
        blocking: value.blocking,
        status: value.status,
        ...(value.resultSummary === undefined ? {} : { resultSummary: value.resultSummary }),
        ...(value.failureReason === undefined ? {} : { failureReason: value.failureReason }),
        createdAt: value.createdAt,
        ...(value.queuedAt === undefined ? {} : { queuedAt: value.queuedAt }),
        ...(value.startedAt === undefined ? {} : { startedAt: value.startedAt }),
        ...(value.finishedAt === undefined ? {} : { finishedAt: value.finishedAt })
    };
}

function handRaise(value: MeetingState["handRaises"][number]): PublicHandRaiseV1 {
    return {
        id: value.id,
        participantId: value.participant,
        reason: value.reason,
        summary: value.summary,
        taskIds: value.taskIds,
        ...(value.replyToMessageId === undefined
            ? {}
            : { replyToMessageId: value.replyToMessageId }),
        ...(value.agendaItemId === undefined ? {} : { agendaItemId: value.agendaItemId }),
        priority: value.priority
    };
}

function turn(value: NonNullable<MeetingState["currentTurn"]>): PublicTurnV1 {
    return {
        id: value.id,
        seq: value.seq,
        agendaItemId: value.agendaItemId,
        intent: value.intent,
        objective: value.objective,
        expectedOutputs: value.expectedOutputs,
        prohibitedTopics: value.prohibitedTopics,
        steps: value.steps.map((step) => ({
            id: step.id,
            participantId: step.speaker,
            instruction: step.instruction,
            reason: step.reason,
            status: step.status
        }))
    };
}

function termination(state: MeetingState) {
    if (state.termination === undefined) {
        throw new TypeError("terminal MeetingState must include termination");
    }
    return {
        code: state.termination.code,
        reason: state.termination.reason,
        decisionIds: state.termination.decisionIds,
        unresolvedQuestionIds: state.termination.unresolvedQuestionIds
    };
}

function executionTermination(
    state: MeetingState
): ExecutionTerminalMeetingStatusResultV1["termination"] {
    if (state.termination === undefined) {
        throw new TypeError("terminal MeetingState must include termination");
    }
    return {
        ...termination(state),
        dissentingPositionIds: state.termination.dissentingPositionIds,
        blockingAgendaItemIds: state.termination.blockingAgendaItemIds,
        finalMessage: state.termination.finalMessage,
        endedAt: state.termination.endedAt
    };
}

function isExecutionTerminalStatus(
    status: MeetingState["status"]
): status is ExecutionTerminalMeetingStatusResultV1["status"] {
    return ["completed", "partial", "no_consensus", "cancelled", "failed"].includes(status);
}

/**
 * Projects only protocol-visible meeting facts. Session IDs, capabilities,
 * prompts, DSH payloads, outbox leases and private Agent output have no input
 * path here and therefore cannot reach a caller.
 */
export function projectMeetingStatus(
    state: MeetingState,
    _caller: MeetingProjectionCaller
): MeetingStatusResultV1 {
    const base = {
        meetingId: state.id,
        meetingVersion: state.version,
        topic: state.topic,
        objective: state.objective,
        continuationMaterials: state.continuationMaterials.map((material) => ({ ...material })),
        limits: {
            maxTurns: state.limits.maxTurns,
            maxSpeakersPerTurn: state.limits.maxSpeakersPerTurn,
            maxTotalMessages: state.limits.maxTotalMessages,
            ...(state.limits.maxDurationMs === undefined
                ? {}
                : { maxDurationMs: state.limits.maxDurationMs }),
            ...(state.limits.speakerAttemptTimeoutMs === undefined
                ? {}
                : { speakerAttemptTimeoutMs: state.limits.speakerAttemptTimeoutMs }),
            ...(state.limits.mailHandlingTimeoutMs === undefined
                ? {}
                : { mailHandlingTimeoutMs: state.limits.mailHandlingTimeoutMs })
        }
    };

    if (state.status === "archiving" || state.status === "archived") {
        if (state.archive === undefined)
            throw new TypeError("archived MeetingState must include archive");
        const archive = {
            package: {
                ...state.archive.package,
                ...(state.sourceMeetingId === undefined
                    ? {}
                    : { sourceMeetingId: state.sourceMeetingId })
            }
        };
        return state.status === "archiving"
            ? {
                  ...base,
                  status: "archiving",
                  pendingHandRaises: [],
                  meetingTasks: state.meetingTasks.map(meetingTask),
                  pauseControl: { action: "none" },
                  termination: termination(state),
                  archive
              }
            : ({
                  ...base,
                  status: "archived",
                  pendingHandRaises: [],
                  meetingTasks: state.meetingTasks.map(meetingTask),
                  pauseControl: { action: "none" },
                  termination: termination(state),
                  archive: { ...archive, archivedAt: state.archive.archivedAt ?? state.updatedAt }
              } as MeetingStatusResultV1);
    }

    const discussion = {
        ...base,
        ...(state.activeAgendaItemId === undefined
            ? {}
            : {
                  activeAgendaItem:
                      state.agenda.find((item) => item.id === state.activeAgendaItemId) &&
                      agendaItem(state.agenda.find((item) => item.id === state.activeAgendaItemId)!)
              }),
        messages: state.transcript.map(message),
        acceptedDecisions: state.decisions
            .filter(
                (decision) =>
                    decision.status === "accepted" &&
                    decision.agendaItemId !== undefined &&
                    decision.statement !== undefined &&
                    decision.rationale !== undefined &&
                    decision.acceptedBy !== undefined &&
                    decision.dissentingPositionIds !== undefined
            )
            .map((decision) => ({
                id: decision.id,
                agendaItemId: decision.agendaItemId!,
                proposalId: decision.proposalId,
                proposalRevision: decision.proposalRevision,
                statement: decision.statement!,
                rationale: decision.rationale!,
                status: decision.status,
                acceptedBy: decision.acceptedBy!,
                dissentingPositionIds: decision.dissentingPositionIds!
            })),
        blockingFacts: state.issues
            .filter((issue) => issue.blocking)
            .map((issue) => ({
                id: issue.id,
                kind: "issue" as const,
                subjectId: issue.id,
                summary: issue.title
            })),
        meetingTasks: state.meetingTasks.map(meetingTask)
    };

    if (isExecutionTerminalStatus(state.status)) {
        const terminal: ExecutionTerminalMeetingStatusResultV1 = {
            ...discussion,
            status: state.status,
            pendingHandRaises: [],
            pauseControl: { action: "none" },
            termination: executionTermination(state),
            completionFactIds: state.completionFacts
                .filter((fact) => fact.status === "active")
                .map((fact) => fact.id)
        };
        return terminal;
    }

    const currentTurn = state.currentTurn === undefined ? undefined : turn(state.currentTurn);
    const currentStep = state.currentTurn?.steps[state.currentTurn.currentStepIndex];
    return {
        ...discussion,
        status: state.status,
        ...(currentTurn === undefined ? {} : { currentTurn }),
        ...(currentStep === undefined ? {} : { currentSpeakerId: currentStep.speaker }),
        pendingHandRaises: state.handRaises
            .filter((raise) => raise.status === "pending")
            .map(handRaise),
        pauseControl:
            state.status === "paused"
                ? {
                      action: "resume",
                      pausedAt: state.pausedAt,
                      ...(state.pausedBy === undefined ? {} : { pausedBy: state.pausedBy }),
                      ...(state.pauseReason === undefined ? {} : { reason: state.pauseReason })
                  }
                : {
                      action: ["created", "running", "waiting"].includes(state.status)
                          ? "pause"
                          : "none"
                  }
    } as MeetingStatusResultV1;
}

export function projectManagerMeetingContext(
    state: MeetingState,
    dispatchableParticipantIds: readonly string[]
): ManagerMeetingContextV1 {
    const planningAttempt = state.manager.currentPlanningAttempt;
    const activeAgendaItem = state.agenda.find((item) => item.id === state.activeAgendaItemId);
    if (planningAttempt === undefined || activeAgendaItem === undefined) {
        throw new TypeError("Manager planning requires an active attempt and agenda item");
    }
    const status = projectMeetingStatus(state, {
        kind: "manager",
        sessionId: "manager-projection"
    });
    if (!("messages" in status)) {
        throw new TypeError("Manager planning requires an active meeting projection");
    }
    return {
        protocolVersion: 1,
        meetingId: state.id,
        meetingVersion: state.version,
        planningAttemptId: planningAttempt.id,
        objective: state.objective,
        activeAgendaItem: agendaItem(activeAgendaItem),
        requiredSpeakerIds: activeAgendaItem.requiredParticipants,
        dispatchableParticipantIds,
        recentPublicMessages: status.messages,
        blockingFacts: status.blockingFacts,
        pendingHandRaises: status.pendingHandRaises,
        meetingTasks: status.meetingTasks,
        continuationMaterials: status.continuationMaterials,
        limits: status.limits,
        planningReason: planningAttempt.reason
    };
}
