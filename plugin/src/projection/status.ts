import { isMeetingStateV2, type MeetingState } from "../domain/model.js";
import type {
    MeetingAgentCatalogProjectionV1,
    ExecutionTerminalMeetingStatusResultV1,
    ManagerMeetingContextV1,
    MeetingStatusResultV1,
    PublicAgendaItemV1,
    PublicMeetingMessageV1,
    PublicHandRaiseV1,
    MeetingTaskProjectionV1,
    SpeakerMeetingContextV1,
    PublicTurnV1,
    PublicQuestionV1,
    PublicDecisionCandidateV1,
    PublicDecisionV1,
    PublicRiskV1
} from "../protocol/index.js";

const executionTerminalStatuses = new Set<MeetingState["status"]>([
    "completed",
    "partial",
    "no_consensus",
    "cancelled",
    "failed"
]);

export type MeetingProjectionCaller =
    | {
          readonly kind: "captain" | "manager" | "participant";
          readonly sessionId: string;
          readonly participantId?: string;
      }
    | { readonly kind: "local_host"; readonly sessionId: "loopback-web" };

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

function question(value: MeetingState["openQuestions"][number]): PublicQuestionV1 {
    return {
        id: value.id,
        text: value.text,
        ...(value.askedBy === undefined ? {} : { askedBy: value.askedBy }),
        ...(value.directedTo === undefined ? {} : { directedTo: value.directedTo }),
        ...(value.agendaItemId === undefined ? {} : { agendaItemId: value.agendaItemId }),
        ...(value.blocking === undefined ? {} : { blocking: value.blocking }),
        ...(value.affectedOutputIds === undefined
            ? {}
            : { affectedOutputIds: value.affectedOutputIds }),
        ...(value.affectedCriterionIds === undefined
            ? {}
            : { affectedCriterionIds: value.affectedCriterionIds }),
        ...(value.violatedConstraintIds === undefined
            ? {}
            : { violatedConstraintIds: value.violatedConstraintIds }),
        status: value.status,
        ...(value.answerMessageId === undefined ? {} : { answerMessageId: value.answerMessageId })
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

function decision(value: MeetingState["decisions"][number]): PublicDecisionV1 {
    return {
        id: value.id,
        ...(value.agendaItemId === undefined ? {} : { agendaItemId: value.agendaItemId }),
        proposalId: value.proposalId,
        proposalRevision: value.proposalRevision,
        ...(value.statement === undefined ? {} : { statement: value.statement }),
        ...(value.rationale === undefined ? {} : { rationale: value.rationale }),
        status: value.status,
        ...(value.acceptedBy === undefined ? {} : { acceptedBy: value.acceptedBy }),
        ...(value.dissentingPositionIds === undefined
            ? {}
            : { dissentingPositionIds: value.dissentingPositionIds }),
        ...(value.supersededByDecisionId === undefined
            ? {}
            : { supersededByDecisionId: value.supersededByDecisionId })
    };
}

function risk(value: MeetingState["issues"][number]): PublicRiskV1 {
    return {
        id: value.id,
        title: value.title,
        description: value.description,
        sourceMessageId: value.sourceMessageId,
        ...(value.agendaItemId === undefined ? {} : { agendaItemId: value.agendaItemId }),
        affectedOutputIds: value.affectedOutputIds,
        affectedCriterionIds: value.affectedCriterionIds,
        violatedConstraintIds: value.violatedConstraintIds,
        blockingObjectionIds: value.blockingObjectionIds,
        blocking: value.blocking,
        ...(value.riskLevel === undefined ? {} : { riskLevel: value.riskLevel }),
        impact: value.impact,
        urgency: value.urgency,
        reversibility: value.reversibility,
        safeDefaultAvailable: value.safeDefaultAvailable,
        disposition: value.disposition,
        status: value.status,
        ...(value.rationale === undefined ? {} : { rationale: value.rationale }),
        ...(value.ownerId === undefined ? {} : { ownerId: value.ownerId }),
        relatedTaskIds: value.relatedTaskIds
    };
}

function attendanceRecommendation(value: MeetingState["attendanceRecommendations"][number]) {
    return {
        recommendationId: value.id,
        candidateId: value.candidateId,
        agendaItemId: value.agendaItemId,
        rationale: value.rationale,
        expectedContribution: value.expectedContribution,
        evidenceGapIds: [...value.evidenceGapIds],
        urgency: value.urgency,
        roleDefinitionId: value.roleDefinitionId,
        displayName: value.displayName,
        status: value.status
    };
}

function turn(value: NonNullable<MeetingState["currentTurn"]>): PublicTurnV1 {
    return {
        id: value.id,
        seq: value.seq,
        agendaItemId: value.agendaItemId,
        intent: value.intent,
        reason: value.reason ?? value.intent,
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
    caller: MeetingProjectionCaller
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
                acceptedDecisions: state.decisions
                    .filter(({ status }) => status === "accepted")
                    .map(decision),
                decisionHistory: state.decisions.map(decision),
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
        questions: state.openQuestions.map(question),
        proposals: state.proposals.map((proposal) => ({
            id: proposal.id,
            agendaItemId: proposal.agendaItemId,
            title: proposal.title,
            description: proposal.description,
            revision: proposal.revision,
            status: proposal.status,
            positions: proposal.positions.map((position) => ({ ...position }))
        })),
        pendingDecisionCandidates:
            (caller.kind === "captain" || caller.kind === "local_host") &&
            !executionTerminalStatuses.has(state.status)
                ? state.decisionCandidates
                      .filter((candidate) => {
                          const proposal = state.proposals.find(
                              (item) =>
                                  item.id === candidate.proposalId && item.status !== "superseded"
                          );
                          const currentRevision = state.proposals
                              .filter(
                                  (item) =>
                                      item.id === candidate.proposalId &&
                                      item.status !== "superseded"
                              )
                              .reduce((max, item) => Math.max(max, item.revision), 0);
                          return (
                              proposal !== undefined &&
                              candidate.proposalRevision === currentRevision &&
                              !state.decisions.some(
                                  (item) => item.id === `decision-${candidate.id}`
                              )
                          );
                      })
                      .map((candidate): PublicDecisionCandidateV1 => ({ ...candidate }))
                : [],
        acceptedDecisions: state.decisions
            .filter(({ status }) => status === "accepted")
            .map(decision),
        decisionHistory: state.decisions.map(decision),
        risks:
            caller.kind === "captain" || caller.kind === "local_host" ? state.issues.map(risk) : [],
        blockingFacts: [
            ...state.issues
                .filter(
                    (issue) =>
                        issue.status === "open" &&
                        issue.disposition === "blocking" &&
                        issue.blocking
                )
                .map((issue) => ({
                    id: issue.id,
                    kind: "issue" as const,
                    subjectId: issue.id,
                    summary: issue.title
                })),
            ...state.openQuestions
                .filter((question) => question.blocking && question.status === "open")
                .map((question) => ({
                    id: question.id,
                    kind: "question" as const,
                    subjectId: question.id,
                    summary: question.text
                }))
        ],
        parkingLot: [...(state.agendaCandidates ?? [])]
            .sort(
                (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)
            )
            .map(({ id, title, reason, status }) => ({ id, title, reason, status })),
        meetingTasks: state.meetingTasks.map(meetingTask),
        attendanceRecommendations:
            caller.kind === "captain" || caller.kind === "manager" || caller.kind === "participant"
                ? [...(state.attendanceRecommendations ?? [])]
                      .sort(
                          (left, right) =>
                              left.createdAt - right.createdAt || left.id.localeCompare(right.id)
                      )
                      .map(attendanceRecommendation)
                : []
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
        stallCount: state.stallCount,
        maxStalls: state.limits.maxStalls,
        replanCount: state.replanCount,
        maxReplans: state.limits.maxReplans,
        ...(currentTurn === undefined ? {} : { currentTurn }),
        ...(currentStep === undefined ? {} : { currentSpeakerId: currentStep.speaker }),
        ...(currentStep?.attempt?.status === "running"
            ? { currentAttemptId: currentStep.attempt.attemptId }
            : {}),
        ...(state.waitState === undefined
            ? {}
            : {
                  waitState: {
                      reason: state.waitState.reason,
                      waitingSince: state.waitState.waitingSince,
                      taskIds: [...state.waitState.taskIds],
                      participantIds: [...state.waitState.participantIds],
                      ...(state.waitState.deadlineAt === undefined
                          ? {}
                          : { deadlineAt: state.waitState.deadlineAt }),
                      ...(state.waitState.resumeAgendaItemId === undefined
                          ? {}
                          : { resumeAgendaItemId: state.waitState.resumeAgendaItemId })
                  }
              }),
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
    const catalogBinding = isMeetingStateV2(state) ? planningAttempt.catalogBinding : undefined;
    const agentCatalog: MeetingAgentCatalogProjectionV1 | null =
        catalogBinding?.kind === "verified"
            ? {
                  protocolVersion: 1,
                  catalogId: catalogBinding.snapshot.catalogId,
                  catalogVersion: catalogBinding.snapshot.catalogVersion,
                  candidates: catalogBinding.snapshot.candidates.map((candidate) => {
                      const role = catalogBinding.snapshot.roles.find(
                          (value) =>
                              value.roleDefinitionId === candidate.roleDefinitionId &&
                              value.version === candidate.roleDefinitionVersion
                      );
                      if (role === undefined)
                          throw new TypeError("Verified Catalog candidate role is missing");
                      return {
                          candidateId: candidate.candidateId,
                          roleDefinitionId: candidate.roleDefinitionId,
                          roleDefinitionVersion: candidate.roleDefinitionVersion,
                          displayName: role.displayName,
                          summary: role.summary,
                          expertiseTags: role.expertiseTags,
                          evidenceScopes: role.evidenceScopes,
                          responsibilities: role.responsibilities,
                          nonResponsibilities: role.nonResponsibilities,
                          availability: candidate.availability
                      };
                  }),
                  researchNeeds: []
              }
            : null;
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
        planningReason: planningAttempt.reason,
        agentCatalog
    };
}

/**
 * Builds the immutable context for the exact current speaker attempt. This is
 * deliberately derived from the target MeetingState only, so continuation
 * source Sessions or transcripts cannot leak into a new Meeting delivery.
 */
export function projectSpeakerMeetingContext(
    state: MeetingState,
    participantId: string,
    attemptId: string
): SpeakerMeetingContextV1 {
    const currentTurn = state.currentTurn;
    const step = currentTurn?.steps.find(
        (candidate) =>
            candidate.speaker === participantId && candidate.attempt?.attemptId === attemptId
    );
    const attempt = step?.attempt;
    const activeAgendaItem = state.agenda.find((item) => item.id === currentTurn?.agendaItemId);
    if (
        currentTurn === undefined ||
        step === undefined ||
        attempt === undefined ||
        activeAgendaItem === undefined
    ) {
        throw new TypeError("Speaker delivery requires an active speaker attempt and agenda item");
    }
    const status = projectMeetingStatus(state, {
        kind: "participant",
        sessionId: "speaker-projection",
        participantId
    });
    if (!("messages" in status)) {
        throw new TypeError("Speaker delivery requires an active meeting projection");
    }
    return {
        protocolVersion: 1,
        meetingId: state.id,
        meetingVersion: state.version,
        objective: state.objective,
        objectiveContract: {
            requiredOutputs: state.objectiveContract.requiredOutputs.map((value) => ({ ...value })),
            acceptanceCriteria: state.objectiveContract.acceptanceCriteria.map((value) => ({
                ...value
            })),
            hardConstraints: state.objectiveContract.hardConstraints.map((value) => ({ ...value })),
            requiredReviewers: [...state.objectiveContract.requiredReviewers],
            riskAcceptanceAuthority: [...state.objectiveContract.riskAcceptanceAuthority],
            acceptableRiskLevel: state.objectiveContract.acceptableRiskLevel
        },
        activeAgendaItem: agendaItem(activeAgendaItem),
        acceptedDecisions: status.acceptedDecisions,
        blockingQuestions: (status.questions ?? []).filter(
            (question) => question.blocking && question.status === "open"
        ),
        recentMessages: status.messages.filter(
            (message) =>
                message.seq >= attempt.contextFromSeq && message.seq <= attempt.contextThroughSeq
        ),
        taskResults: attempt.taskSnapshots.map((snapshot) => ({
            meetingTaskId: snapshot.meetingTaskId,
            status: snapshot.status,
            ...(snapshot.resultSummary === undefined
                ? {}
                : { resultSummary: snapshot.resultSummary }),
            observedAt: snapshot.observedAt
        })),
        continuationMaterials: state.continuationMaterials.map((material) => ({ ...material })),
        turn: turn(currentTurn),
        step: {
            id: step.id,
            participantId: step.speaker,
            instruction: step.instruction,
            reason: step.reason,
            status: step.status
        },
        attempt: {
            attemptId: attempt.attemptId,
            deliveryId: attempt.deliveryId,
            contextFromSeq: attempt.contextFromSeq,
            contextThroughSeq: attempt.contextThroughSeq,
            ...(attempt.deadlineAt === undefined ? {} : { deadlineAt: attempt.deadlineAt })
        }
    };
}
