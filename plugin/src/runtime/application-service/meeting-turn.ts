import { createHash } from "node:crypto";
import {
    completedTaskSnapshots,
    createHandRaise,
    findPendingEquivalentHandRaise,
    isParticipantDispatchableNow,
    planRoundRobinTurn,
    submitManagerPlan as submitManagerPlanTransition,
    submitSpeakerAndAdvanceMeeting,
    type MeetingState,
    type MeetingTurn
} from "../../domain/index.js";
import type {
    HandRaiseSubmissionV1,
    HandRaiseResultV1,
    ManagerPlanResultV1,
    ManagerPlanSubmissionV1,
    TurnSubmissionResultV1
} from "../../protocol/index.js";
import type { DomainEventInput, JsonObject, MeetingRepositoryRuntime } from "../meeting-runtime.js";
import {
    commandFailure as failure,
    commandSuccess as success,
    mapCommandError as commandError
} from "../services/command-result-service.js";
import type { MeetingRehydrationService } from "../services/meeting-recovery-service.js";
import type { MeetingDeliveryWorkerService } from "../services/types.js";
import type { AuthorizedTaskEvidenceResolver } from "../task-evidence.js";
import type { CreateStatusRuntimeOptions, MeetingToolRuntime } from "./index.js";
import type { StoredMeeting } from "./types.js";

export function assignTurnAttempt(
    state: MeetingState,
    turn: MeetingTurn,
    index: number,
    now: number
): MeetingTurn {
    const step = turn.steps[index];
    if (step === undefined) return turn;
    const attempt = {
        attemptId: turn.id === "turn-1" ? `attempt-${index}` : `${turn.id}-attempt-${index}`,
        participantId: step.speaker,
        meetingId: state.id,
        turnId: turn.id,
        stepId: step.id,
        deliveryId: turn.id === "turn-1" ? `delivery-${index}` : `${turn.id}-delivery-${index}`,
        contextFromSeq: 0,
        contextThroughSeq: state.messageSeq,
        taskSnapshots: completedTaskSnapshots(state, step.speaker, now),
        assignedAt: now,
        ...(state.limits.speakerAttemptTimeoutMs === undefined
            ? {}
            : { deadlineAt: now + state.limits.speakerAttemptTimeoutMs }),
        startedAt: now,
        status: "running" as const,
        deliveryStatus: "accepted" as const
    };
    return {
        ...turn,
        status: "running",
        steps: turn.steps.map((candidate, candidateIndex) =>
            candidateIndex === index ? { ...candidate, status: "running", attempt } : candidate
        )
    };
}

export async function initializeFirstMeetingTurn(
    repository: MeetingRepositoryRuntime,
    now: number
): Promise<number> {
    const current = await repository.read();
    const currentState = current.state as unknown as MeetingState;
    const firstAgenda = currentState.agenda[0];
    if (firstAgenda === undefined) throw new Error("At least one agenda item is required.");
    const activeState: MeetingState = {
        ...currentState,
        status: "running",
        activeAgendaItemId: currentState.activeAgendaItemId ?? firstAgenda.id,
        agenda: currentState.agenda.map((agenda, index) =>
            index === 0 ? { ...agenda, status: "discussing" } : agenda
        )
    };
    const planned = planRoundRobinTurn(
        activeState,
        { turnId: "turn-1", stepId: (participantId, index) => `step-${participantId}-${index}` },
        now
    );
    const running = assignTurnAttempt(activeState, planned, 0, now);
    const speaker = running.steps[0]?.speaker;
    const events: DomainEventInput[] = [
        { type: "meeting.started", payload: { meetingId: activeState.id } },
        { type: "turn.started", payload: { turnId: running.id } },
        {
            type: "speaker_attempt.started",
            payload: { attemptId: running.steps[0]?.attempt?.attemptId ?? "attempt-0" }
        }
    ];
    const committed = await repository.execute({
        requestId: "runtime-initialize-turn-1",
        commandKind: "start_turn",
        authorization: { callerBinding: "runtime:convivium", capabilityId: "runtime:turn" },
        requestHash: "runtime-initialize-turn-1",
        expectedMeetingVersion: current.version,
        transition: () => ({
            state: {
                ...activeState,
                currentTurn: running,
                participants: activeState.participants.map((participant) =>
                    participant.id === speaker
                        ? { ...participant, status: "speaking" as const }
                        : participant
                ),
                turnSeq: running.seq,
                version: activeState.version + 1,
                updatedAt: now
            } as unknown as JsonObject,
            result: { turnId: running.id, firstStepId: running.steps[0]?.id },
            events,
            outbox:
                speaker === undefined
                    ? []
                    : [
                          {
                              deliveryId: running.steps[0]!.attempt!.deliveryId,
                              kind: "dispatch",
                              payload: {
                                  participantId: speaker,
                                  attemptId: running.steps[0]!.attempt!.attemptId,
                                  turnId: running.id,
                                  stepId: running.steps[0]!.id
                              }
                          }
                      ]
        })
    });
    return committed.meetingVersion;
}

function allocateHandRaiseId(participantId: string, requestId: string): string {
    return `hand-raise-${createHash("sha256")
        .update(`${participantId}\0${requestId}`)
        .digest("hex")
        .slice(0, 32)}`;
}

export interface MeetingTurnApplicationOptions {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
    readonly deliveryWorkers: MeetingDeliveryWorkerService;
    readonly taskEvidenceResolver: AuthorizedTaskEvidenceResolver;
}

export function createMeetingTurnApplication(dependencies: MeetingTurnApplicationOptions) {
    const { options, meetings, recovery, deliveryWorkers, taskEvidenceResolver } = dependencies;
    const application: Pick<MeetingToolRuntime, "raiseHand" | "submitTurn" | "submitManagerPlan"> =
        {
            async raiseHand(input: HandRaiseSubmissionV1, caller) {
                await recovery.rehydrate();
                const stored = meetings.get(input.meetingId);
                if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
                if (caller.kind !== "participant" || caller.participantId === undefined) {
                    return failure("UNAUTHORIZED_CALLER", "Only a Participant can raise a hand.");
                }
                if (caller.meetingId !== input.meetingId) {
                    return failure(
                        "UNAUTHORIZED_CALLER",
                        "Only the matching Participant can raise a hand."
                    );
                }
                const handRaiseId = allocateHandRaiseId(caller.participantId, input.requestId);
                try {
                    const current = await stored.repository.read();
                    const committed = await stored.repository.execute({
                        requestId: input.requestId,
                        commandKind: "raise_hand",
                        authorization: {
                            callerBinding: `session:${caller.sessionId}`,
                            capabilityId: `participant:${caller.sessionId}`
                        },
                        requestHash: JSON.stringify(input),
                        expectedMeetingVersion: current.version,
                        allowNoop: true,
                        transition: (snapshot) => {
                            const handRaiseInput = {
                                id: handRaiseId,
                                participantId: caller.participantId!,
                                reason: input.reason,
                                summary: input.summary,
                                taskIds: input.taskIds,
                                ...(input.replyToMessageId === undefined
                                    ? {}
                                    : { replyToMessageId: input.replyToMessageId }),
                                agendaItemId: input.agendaItemId,
                                priority: input.priority,
                                now: options.now?.() ?? Date.now()
                            };
                            const state = snapshot.state as unknown as MeetingState;
                            const duplicate = findPendingEquivalentHandRaise(state, handRaiseInput);
                            const transition = createHandRaise(state, handRaiseInput);
                            return {
                                state: transition.state as unknown as JsonObject,
                                result: {
                                    handRaiseId: duplicate?.id ?? handRaiseId,
                                    status: "pending"
                                } satisfies HandRaiseResultV1,
                                events: transition.effect.events as unknown as DomainEventInput[],
                                outbox: []
                            };
                        }
                    });
                    return success(
                        input.meetingId,
                        committed.meetingVersion,
                        committed.result as HandRaiseResultV1
                    );
                } catch (error) {
                    return commandError(
                        error,
                        "INVALID_ENTITY_STATE",
                        "The hand raise could not be created.",
                        { meetingId: input.meetingId }
                    );
                }
            },

            async submitTurn(input, caller, _commandSignal) {
                await recovery.rehydrate();
                if (
                    caller.kind !== "participant" ||
                    caller.meetingId !== input.meetingId ||
                    caller.participantId === undefined
                ) {
                    return failure(
                        "UNAUTHORIZED_CALLER",
                        "Only the matching Participant can submit."
                    );
                }
                const stored = meetings.get(input.meetingId);
                if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
                if (stored.parent === undefined) {
                    return failure(
                        "INTERNAL_ERROR",
                        "The live Captain parent is unavailable for dispatch.",
                        true
                    );
                }
                const messageId = `message-${input.deliveryId}`;
                const commandNow = options.now?.() ?? Date.now();
                const questions = (input.changes.questions ?? []).map((claim, index) => ({
                    id: `question-${input.deliveryId}-${index + 1}`,
                    text: claim.text.trim(),
                    ...(claim.directedTo === undefined ? {} : { directedTo: claim.directedTo }),
                    blocking: claim.blocking,
                    affectedOutputIds: [...(claim.affectedOutputIds ?? [])],
                    affectedCriterionIds: [...(claim.affectedCriterionIds ?? [])],
                    violatedConstraintIds: [...(claim.violatedConstraintIds ?? [])],
                    createdAt: commandNow
                }));
                const issues = (input.changes.issues ?? []).map((claim, index) => ({
                    id: `issue-${input.deliveryId}-${index + 1}`,
                    title: claim.title,
                    description: claim.description,
                    affectedOutputIds: claim.affectedOutputIds,
                    affectedCriterionIds: claim.affectedCriterionIds,
                    violatedConstraintIds: claim.violatedConstraintIds,
                    impact: claim.impact,
                    urgency: claim.urgency,
                    safeDefaultAvailable: claim.safeDefaultAvailable
                }));
                const proposals = (input.changes.proposals ?? []).map((claim, index) => ({
                    id: `${input.deliveryId}-proposal-${index + 1}`,
                    ...(claim.proposalId === undefined ? {} : { proposalId: claim.proposalId }),
                    ...(claim.expectedRevision === undefined
                        ? {}
                        : { expectedRevision: claim.expectedRevision }),
                    title: claim.title,
                    description: claim.description,
                    now: commandNow
                }));
                const positions = (input.changes.positions ?? []).map((claim, index) => ({
                    id: `${input.deliveryId}-position-${index + 1}`,
                    proposalId: claim.proposalId,
                    proposalRevision: claim.proposalRevision,
                    position: claim.position,
                    ...(claim.reason === undefined ? {} : { reason: claim.reason }),
                    blocking: claim.blocking,
                    now: commandNow
                }));
                const agendaCandidates = (input.changes.agendaCandidates ?? []).map(
                    (claim, index) => ({
                        id: `${input.deliveryId}-agenda-candidate-${index + 1}`,
                        title: claim.title,
                        reason: claim.reason,
                        relationToActiveAgenda: claim.relationToActiveAgenda,
                        urgency: claim.urgency,
                        suggestedParticipants: claim.suggestedParticipants,
                        now: commandNow
                    })
                );
                const decisionCandidates = (input.changes.decisionProposals ?? []).map((claim, index) => ({
                    id: `decision-candidate-${input.deliveryId}-${index + 1}`,
                    proposalId: claim.proposalId,
                    proposalRevision: claim.proposalRevision,
                    statement: claim.statement,
                    rationale: claim.rationale,
                    sourceMessageId: messageId,
                    agendaItemId: input.agendaItemId,
                    createdAt: commandNow
                }));
                try {
                    const current = await stored.repository.read();
                    const committed = await stored.repository.execute({
                        requestId: input.deliveryId,
                        commandKind: "submit_turn",
                        authorization: {
                            callerBinding: `session:${caller.sessionId}`,
                            capabilityId: `participant:${caller.sessionId}`,
                            attemptId: input.attemptId
                        },
                        requestHash: JSON.stringify(input),
                        expectedMeetingVersion: current.version,
                        transition: (snapshot) => {
                            const state = snapshot.state as unknown as MeetingState;
                            const taskEvidence =
                                input.completionClaims === undefined
                                    ? []
                                    : taskEvidenceResolver.resolve({
                                          state,
                                          meetingId: input.meetingId,
                                          participantId: caller.participantId!,
                                          taskIds: [
                                              ...(input.completionClaims.outputClaims?.flatMap(
                                                  (claim) => claim.taskIds
                                              ) ?? []),
                                              ...(input.completionClaims.criterionClaims?.flatMap(
                                                  (claim) => claim.taskIds
                                              ) ?? [])
                                          ].filter(
                                              (taskId, index, taskIds) =>
                                                  taskIds.indexOf(taskId) === index
                                          )
                                      });
                            const transition = submitSpeakerAndAdvanceMeeting(
                                state,
                                caller.participantId!,
                                {
                                    meetingId: input.meetingId,
                                    participantId: caller.participantId!,
                                    turnId: input.turnId,
                                    stepId: input.stepId,
                                    attemptId: input.attemptId,
                                    deliveryId: input.deliveryId,
                                    agendaItemId: input.agendaItemId,
                                    message: {
                                        id: messageId,
                                        content: input.content,
                                        kind: input.kind,
                                        mentions: input.mentions,
                                        ...(input.replyTo === undefined
                                            ? {}
                                            : { replyTo: input.replyTo }),
                                        taskIds: input.taskIds,
                                        agendaRelation: input.agendaRelation,
                                        createdAt: commandNow
                                    },
                                    now: commandNow,
                                    nextPlanningAttemptId: `${state.id}-planning-${state.replanCount + 1}`,
                                    nextPlanningDeliveryId: `${state.id}-planning-delivery-${state.replanCount + 1}`,
                                    issues,
                                    questions,
                                    proposals,
                                    positions,
                                    agendaCandidates,
                                    decisionCandidates,
                                    ...(input.completionClaims === undefined
                                        ? {}
                                        : {
                                              completion: {
                                                  claims: input.completionClaims,
                                                  authorizedTaskIds: taskEvidence.map(
                                                      (evidence) => evidence.meetingTaskId
                                                  ),
                                                  factId: (kind: string, index: number) =>
                                                      `completion-${input.deliveryId}-${kind}-${index}`
                                              }
                                          })
                                }
                            );
                            const nextStep =
                                transition.state.currentTurn?.steps[
                                    transition.state.currentTurn.currentStepIndex
                                ];
                            const submittedTurn = transition.state.currentTurn;
                            const taskOutbox: Array<{
                                deliveryId: string;
                                kind: "dispatch";
                                payload: JsonObject;
                            }> = transition.state.meetingTasks
                                .filter(
                                    (task) =>
                                        task.status === "queued" &&
                                        task.originatingSpeakerAttemptId === input.attemptId &&
                                        input.taskIds.includes(task.meetingTaskId)
                                )
                                .map((task) => ({
                                    deliveryId: task.deliveryId,
                                    kind: "dispatch" as const,
                                    payload: {
                                        role: "meeting_task",
                                        meetingTaskId: task.meetingTaskId,
                                        participantId: task.participantId,
                                        executionId: task.executionId
                                    }
                                }));
                            const turnStatus =
                                submittedTurn?.status ??
                                (transition.state.status === "partial" ? "truncated" : "completed");
                            return {
                                state: transition.state as unknown as JsonObject,
                                result: {
                                    messageId,
                                    messageSeq: transition.state.messageSeq,
                                    turnStatus,
                                    ...(nextStep === undefined ? {} : { nextStepId: nextStep.id }),
                                    meetingStatus: transition.state.status
                                },
                                events: transition.effect.events as unknown as DomainEventInput[],
                                outbox: [
                                    ...taskOutbox,
                                    ...(submittedTurn?.status === "running" && nextStep?.attempt
                                        ? [
                                              {
                                                  deliveryId: nextStep.attempt.deliveryId,
                                                  kind: "dispatch" as const,
                                                  payload: {
                                                      role: "participant",
                                                      participantId: nextStep.attempt.participantId,
                                                      attemptId: nextStep.attempt.attemptId,
                                                      turnId: submittedTurn.id,
                                                      stepId: nextStep.id
                                                  }
                                              }
                                          ]
                                        : transition.state.manager.currentPlanningAttempt
                                          ? [
                                                {
                                                    deliveryId:
                                                        transition.state.manager
                                                            .currentPlanningAttempt.deliveryId,
                                                    kind: "dispatch" as const,
                                                    payload: {
                                                        role: "manager",
                                                        planningAttemptId:
                                                            transition.state.manager
                                                                .currentPlanningAttempt.id
                                                    }
                                                }
                                            ]
                                          : [])
                                ] as Array<{
                                    deliveryId: string;
                                    kind: "dispatch";
                                    payload: JsonObject;
                                }>
                            };
                        }
                    });
                    if (committed.result) deliveryWorkers.wake(input.meetingId);
                    return success<TurnSubmissionResultV1>(
                        input.meetingId,
                        committed.meetingVersion,
                        committed.result as TurnSubmissionResultV1
                    );
                } catch (error) {
                    return commandError(
                        error,
                        "STALE_ATTEMPT",
                        "The speaker attempt is stale.",
                        {
                            meetingId: input.meetingId,
                            turnId: input.turnId,
                            stepId: input.stepId,
                            attemptId: input.attemptId,
                            deliveryId: input.deliveryId,
                            participantId: caller.participantId
                        },
                        { INVALID_ENTITY_STATE: "INVALID_ARGUMENT" }
                    );
                }
            },
            async submitManagerPlan(input: ManagerPlanSubmissionV1, caller, _commandSignal) {
                await recovery.rehydrate();
                if (caller.kind !== "manager" || caller.meetingId !== input.meetingId)
                    return failure(
                        "UNAUTHORIZED_CALLER",
                        "Only the matching Manager can submit a plan."
                    );
                const stored = meetings.get(input.meetingId);
                if (stored === undefined) return failure("MEETING_NOT_FOUND", "Meeting not found.");
                if (stored.parent === undefined) {
                    return failure(
                        "INTERNAL_ERROR",
                        "The live Captain parent is unavailable for dispatch.",
                        true
                    );
                }
                try {
                    const current = await stored.repository.read();
                    const recovered = await stored.repository.recover();
                    const state = current.state as unknown as MeetingState;
                    const dispatchableParticipantIds = state.participants
                        .filter((participant) => isParticipantDispatchableNow(state, participant))
                        .filter((participant) =>
                            recovered.sessionOwnership.some(
                                (ownership) =>
                                    ownership.role === "participant" &&
                                    ownership.participantId === participant.id &&
                                    ownership.lifecycleStatus === "active" &&
                                    ownership.capabilityStatus === "active"
                            )
                        )
                        .map((participant) => participant.id);
                    const committed = await stored.repository.execute({
                        requestId: input.requestId,
                        commandKind: "submit_manager_plan",
                        authorization: {
                            callerBinding: `session:${caller.sessionId}`,
                            capabilityId: `manager:${caller.sessionId}`,
                            attemptId: input.planningAttemptId
                        },
                        requestHash: JSON.stringify(input),
                        expectedMeetingVersion: input.observedMeetingVersion,
                        transition: (snapshot) => {
                            const snapshotState = snapshot.state as unknown as MeetingState;
                            const transition = submitManagerPlanTransition(
                                snapshotState,
                                input,
                                {
                                    meetingId: input.meetingId,
                                    planningAttemptId: input.planningAttemptId,
                                    deliveryId:
                                        snapshotState.manager.currentPlanningAttempt?.deliveryId ??
                                        "",
                                    observedMeetingVersion: input.observedMeetingVersion,
                                    dispatchableParticipantIds,
                                    now: options.now?.() ?? Date.now()
                                },
                                {
                                    turnId: `turn-${snapshotState.turnSeq + 1}`,
                                    stepId: (index) =>
                                        `step-turn-${snapshotState.turnSeq + 1}-${index}`
                                }
                            );
                            const turn = transition.state.currentTurn;
                            return {
                                state: transition.state as unknown as JsonObject,
                                result:
                                    turn === undefined
                                        ? { waiting: true }
                                        : {
                                              turnId: turn.id,
                                              firstStepId: turn.steps[0]!.id,
                                              firstAttemptId: turn.steps[0]!.attempt!.attemptId
                                          },
                                events: transition.effect.events as unknown as DomainEventInput[],
                                outbox:
                                    turn === undefined
                                        ? []
                                        : [
                                              {
                                                  deliveryId: turn.steps[0]!.attempt!.deliveryId,
                                                  kind: "dispatch",
                                                  payload: {
                                                      role: "participant",
                                                      participantId:
                                                          turn.steps[0]!.attempt!.participantId,
                                                      attemptId: turn.steps[0]!.attempt!.attemptId,
                                                      turnId: turn.id,
                                                      stepId: turn.steps[0]!.id
                                                  }
                                              }
                                          ]
                            };
                        }
                    });
                    if ("waiting" in committed.result)
                        return failure(
                            "REQUIRED_SPEAKER_UNAVAILABLE",
                            "A required speaker is unavailable."
                        );
                    return success<ManagerPlanResultV1>(
                        input.meetingId,
                        committed.meetingVersion,
                        committed.result as ManagerPlanResultV1
                    );
                } catch (error) {
                    return commandError(
                        error,
                        "MANAGER_PLAN_INVALID",
                        "The Manager plan is invalid.",
                        {
                            meetingId: input.meetingId,
                            meetingVersion: input.observedMeetingVersion
                        },
                        {
                            VERSION_CONFLICT: "STALE_MANAGER_ATTEMPT",
                            REQUIRED_SPEAKER_UNAVAILABLE: "REQUIRED_SPEAKER_UNAVAILABLE"
                        }
                    );
                }
            }
        };
    return application;
}
