import type { MeetingState } from "../domain/model.js";
import type {
    MeetingStatusResultV1,
    PublicAgendaItemV1,
    PublicMeetingMessageV1,
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
                  pauseControl: { action: "none" },
                  termination: termination(state),
                  archive
              }
            : ({
                  ...base,
                  status: "archived",
                  pendingHandRaises: [],
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
            }))
    };

    if (["completed", "partial", "no_consensus", "cancelled", "failed"].includes(state.status)) {
        return {
            ...discussion,
            status: state.status,
            pendingHandRaises: [],
            pauseControl: { action: "none" },
            termination: termination(state)
        } as MeetingStatusResultV1;
    }

    const currentTurn = state.currentTurn === undefined ? undefined : turn(state.currentTurn);
    const currentStep = state.currentTurn?.steps[state.currentTurn.currentStepIndex];
    return {
        ...discussion,
        status: state.status,
        ...(currentTurn === undefined ? {} : { currentTurn }),
        ...(currentStep === undefined ? {} : { currentSpeakerId: currentStep.speaker }),
        pendingHandRaises: [],
        pauseControl:
            state.status === "paused"
                ? {
                      action: "resume",
                      pausedAt: state.pausedAt,
                      ...(state.pausedBy === undefined ? {} : { pausedBy: state.pausedBy }),
                      ...(state.pauseReason === undefined ? {} : { reason: state.pauseReason })
                  }
                : { action: state.status === "running" ? "pause" : "none" }
    } as MeetingStatusResultV1;
}
