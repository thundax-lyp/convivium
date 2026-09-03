import { judgeTurnCompletion } from "../completion.js";
import { completedTaskSnapshots, consumeHandRaise } from "../hand-raise.js";
import { cancelNonTerminalMeetingTasks } from "../meeting-task.js";
import { isParticipantDispatchableNow, planRoundRobinTurn } from "../planning.js";
import type {
    MeetingState,
    MeetingTurn,
    ManagerPlanningAttempt,
    SpeakerAttempt,
    TransitionResult
} from "../model.js";
import type { SubmitSpeakerAdvanceContext } from "./types.js";

type SpeakerAdvanceContext = Pick<
    SubmitSpeakerAdvanceContext,
    "attemptId" | "agendaItemId" | "now" | "nextPlanningAttemptId" | "nextPlanningDeliveryId"
>;

function canonicalIds(values: readonly string[]): string[] {
    return [...values].sort();
}

export function createProgressFingerprint(state: MeetingState): string {
    const agenda = state.agenda
        .map((item) => [item.id, item.status, item.resolution ?? ""])
        .sort(([left], [right]) => left!.localeCompare(right!));
    const acceptedDecisions = state.decisions
        .filter((decision) => decision.status === "accepted")
        .map((decision) => [decision.id, decision.proposalId, decision.proposalRevision])
        .sort(([left], [right]) => left!.localeCompare(right!));
    const questions = state.openQuestions
        .filter((question) => question.status === "open" && question.blocking)
        .map((question) => [question.id])
        .sort(([left], [right]) => left!.localeCompare(right!));
    const latestProposalById = new Map<string, (typeof state.proposals)[number]>();
    for (const proposal of state.proposals) {
        const current = latestProposalById.get(proposal.id);
        if (current === undefined || proposal.revision > current.revision) {
            latestProposalById.set(proposal.id, proposal);
        }
    }
    const positions = [...latestProposalById.values()]
        .flatMap((proposal) =>
            proposal.positions
                .filter(
                    (position) =>
                        position.proposalRevision === proposal.revision &&
                        position.blocking &&
                        (position.position === "object" || position.position === "needs_revision")
                )
                .map((position) => [
                    proposal.id,
                    proposal.revision,
                    position.id,
                    position.participantId,
                    position.position
                ])
        )
        .sort(([left], [right]) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const tasks = state.meetingTasks
        .filter((task) => ["completed", "failed", "cancelled"].includes(task.status))
        .map((task) => [task.meetingTaskId, task.status, task.resultSummary ?? ""])
        .sort(([left], [right]) => left!.localeCompare(right!));
    const proposals = [...latestProposalById.values()]
        .map((proposal) => [proposal.id, proposal.revision, proposal.status])
        .sort(([left], [right]) => left!.localeCompare(right!));
    const facts = state.completionFacts
        .filter((fact) => fact.status === "active")
        .map((fact) => [
            fact.id,
            fact.kind,
            fact.subjectId,
            fact.result,
            canonicalIds(fact.evidenceMessageIds),
            canonicalIds(fact.taskIds)
        ])
        .sort(([left], [right]) => left!.localeCompare(right!));
    return JSON.stringify([
        agenda,
        acceptedDecisions,
        questions,
        positions,
        tasks,
        proposals,
        facts
    ]);
}

export function hasBlockingDisagreement(state: MeetingState): boolean {
    const currentProposalIds = new Set(
        state.proposals
            .filter((proposal) => proposal.agendaItemId === state.activeAgendaItemId)
            .map((proposal) => proposal.id)
    );
    const currentProposals = state.proposals.filter(
        (proposal) =>
            currentProposalIds.has(proposal.id) &&
            proposal.revision ===
                Math.max(
                    ...state.proposals
                        .filter((candidate) => candidate.id === proposal.id)
                        .map((candidate) => candidate.revision)
                )
    );
    return (
        state.openQuestions.some((question) => question.status === "open" && question.blocking) ||
        currentProposals.some((proposal) =>
            proposal.positions.some(
                (position) =>
                    position.proposalRevision === proposal.revision &&
                    position.blocking &&
                    (position.position === "object" || position.position === "needs_revision")
            )
        )
    );
}

export function advanceAfterSpeakerSubmission(
    state: MeetingState,
    participantId: string,
    context: SpeakerAdvanceContext,
    submitted: TransitionResult<MeetingState>
): TransitionResult<MeetingState> {
    const version = submitted.state.version;
    const turn = submitted.state.currentTurn;
    if (turn === undefined) return submitted;

    let nextState = submitted.state;
    let events = submitted.effect.events.filter((item) => item.type !== "meeting.waiting");
    const result = (): TransitionResult<MeetingState> => ({
        state: { ...nextState, eventSeq: state.eventSeq + events.length },
        effect: { events }
    });
    const nextStep = turn.steps[turn.currentStepIndex];
    const limitReached =
        submitted.state.turnSeq >= submitted.state.limits.maxTurns ||
        submitted.state.messageSeq >= submitted.state.limits.maxTotalMessages ||
        (submitted.state.limits.maxDurationMs !== undefined &&
            context.now - submitted.state.createdAt >= submitted.state.limits.maxDurationMs);
    const blockingTaskIds = (submitted.state.meetingTasks ?? [])
        .filter(
            (task) =>
                task.status === "queued" &&
                task.blocking &&
                task.originatingSpeakerAttemptId === context.attemptId
        )
        .map((task) => task.meetingTaskId);
    if (blockingTaskIds.length > 0 && !limitReached) {
        nextState = {
            ...submitted.state,
            status: "waiting",
            waitState: {
                reason: "blocking_task",
                waitingSince: context.now,
                taskIds: blockingTaskIds,
                participantIds: [participantId],
                resumeAgendaItemId: context.agendaItemId
            }
        };
        events = [
            ...events,
            {
                type: "meeting.waiting",
                payload: {
                    meetingId: state.id,
                    from: submitted.state.status,
                    to: "waiting",
                    meetingVersion: version,
                    reason: "blocking_task"
                }
            }
        ];
        return result();
    }
    if (turn.status === "running" && nextStep !== undefined) {
        if (!limitReached) {
            const attempt = {
                attemptId: `${turn.id}-attempt-${turn.currentStepIndex}`,
                participantId: nextStep.speaker,
                meetingId: state.id,
                turnId: turn.id,
                stepId: nextStep.id,
                deliveryId: `${turn.id}-delivery-${turn.currentStepIndex}`,
                contextFromSeq: 0,
                contextThroughSeq: submitted.state.messageSeq,
                taskSnapshots: completedTaskSnapshots(
                    submitted.state,
                    nextStep.speaker,
                    context.now
                ),
                assignedAt: context.now,
                ...(submitted.state.limits.speakerAttemptTimeoutMs === undefined
                    ? {}
                    : { deadlineAt: context.now + submitted.state.limits.speakerAttemptTimeoutMs }),
                status: "running" as const,
                deliveryStatus: "pending" as const
            };
            nextState = {
                ...submitted.state,
                currentTurn: {
                    ...turn,
                    steps: turn.steps.map((step, index) =>
                        index === turn.currentStepIndex
                            ? { ...step, status: "running" as const, attempt }
                            : step
                    )
                },
                participants: submitted.state.participants.map((participant) =>
                    participant.id === nextStep.speaker
                        ? { ...participant, status: "speaking" as const }
                        : participant
                )
            };
            events = [
                ...events,
                {
                    type: "speaker.assigned",
                    payload: {
                        meetingId: state.id,
                        turnId: turn.id,
                        stepId: nextStep.id,
                        participantId: nextStep.speaker,
                        attemptId: attempt.attemptId,
                        deliveryId: attempt.deliveryId,
                        meetingVersion: version
                    }
                },
                {
                    type: "speaker.started",
                    payload: { stepId: nextStep.id, meetingVersion: version }
                },
                {
                    type: "speaker_attempt.started",
                    payload: { attemptId: attempt.attemptId, meetingVersion: version }
                }
            ];
            return result();
        }

        const skippedSteps = turn.steps.map((step, index) =>
            index >= turn.currentStepIndex && step.status === "pending"
                ? { ...step, status: "skipped" as const }
                : step
        );
        nextState = {
            ...submitted.state,
            currentTurn: {
                ...turn,
                status: "truncated",
                currentStepIndex: skippedSteps.length,
                steps: skippedSteps,
                completedAt: context.now
            }
        };
        events = [
            ...events,
            ...skippedSteps.slice(turn.currentStepIndex).map((step) => ({
                type: "speaker.skipped" as const,
                payload: { stepId: step.id, meetingVersion: version }
            })),
            { type: "turn.truncated", payload: { turnId: turn.id, meetingVersion: version } }
        ];
    }

    if (
        nextState.currentTurn?.status !== "completed" &&
        nextState.currentTurn?.status !== "truncated"
    ) {
        return result();
    }
    const judgment = judgeTurnCompletion(nextState, context.now);
    if (judgment.kind === "completed") {
        nextState = {
            ...nextState,
            status: "converging",
            currentTurn: undefined,
            waitState: undefined
        };
        events = [
            ...events,
            {
                type: "meeting.replanned",
                payload: {
                    meetingId: state.id,
                    from: state.status,
                    to: "converging",
                    meetingVersion: version,
                    reason: judgment.reason
                }
            }
        ];
        return result();
    }
    if (judgment.kind === "partial") {
        const terminalStatus = "partial";
        const terminationCode = judgment.reason as "max_turns" | "message_limit" | "time_limit";
        const cancelled = cancelNonTerminalMeetingTasks(nextState, context.now);
        nextState = {
            ...cancelled.state,
            status: terminalStatus,
            currentTurn: undefined,
            termination: {
                code: terminationCode,
                reason: judgment.reason,
                decisionIds: [],
                unresolvedQuestionIds: nextState.openQuestions
                    .filter(
                        (question) => question.status === "open" || question.status === "deferred"
                    )
                    .map((question) => question.id),
                dissentingPositionIds: [],
                blockingAgendaItemIds: nextState.agenda
                    .filter((item) => item.status === "blocked")
                    .map((item) => item.id),
                finalMessage: judgment.reason,
                endedAt: context.now
            },
            waitState: undefined
        };
        events = [
            ...events,
            ...cancelled.effect.events,
            {
                type: "meeting.ended",
                payload: {
                    meetingId: state.id,
                    from: state.status,
                    to: terminalStatus,
                    meetingVersion: version,
                    reason: judgment.reason
                }
            }
        ];
        return result();
    }

    const dispatchableParticipants = nextState.participants.filter((participant) =>
        isParticipantDispatchableNow(nextState, participant)
    );
    if (dispatchableParticipants.length === 0) {
        const cancelled = cancelNonTerminalMeetingTasks(nextState, context.now);
        nextState = {
            ...cancelled.state,
            status: "failed",
            currentTurn: undefined,
            waitState: undefined,
            termination: {
                code: "all_participants_unavailable",
                reason: "all Participants are unavailable for the next turn",
                decisionIds: [],
                unresolvedQuestionIds: nextState.openQuestions
                    .filter(
                        (question) => question.status === "open" || question.status === "deferred"
                    )
                    .map((question) => question.id),
                dissentingPositionIds: [],
                blockingAgendaItemIds: nextState.agenda
                    .filter((item) => item.status === "blocked")
                    .map((item) => item.id),
                finalMessage: "all Participants are unavailable for the next turn",
                endedAt: context.now
            }
        };
        events = [
            ...events,
            ...cancelled.effect.events,
            {
                type: "meeting.ended",
                payload: {
                    meetingId: state.id,
                    from: state.status,
                    to: "failed",
                    meetingVersion: version,
                    reason: "all_participants_unavailable"
                }
            }
        ];
        return result();
    }

    const dispatchableParticipantIds = new Set(
        dispatchableParticipants.map((participant) => participant.id)
    );
    const activeAgenda = nextState.agenda.find(
        (agenda) => agenda.id === nextState.activeAgendaItemId
    );
    const unavailableRequiredParticipant = activeAgenda?.requiredParticipants.find(
        (participantId) => !dispatchableParticipantIds.has(participantId)
    );
    if (unavailableRequiredParticipant !== undefined) {
        const reason = "required_participant_unavailable";
        nextState = {
            ...nextState,
            status: "waiting",
            waitState: {
                reason,
                waitingSince: context.now,
                taskIds: [],
                participantIds: [unavailableRequiredParticipant],
                resumeAgendaItemId: nextState.activeAgendaItemId
            },
            manager: {
                ...nextState.manager,
                status: "idle",
                currentPlanningAttempt: undefined
            }
        };
        events = [
            ...events,
            {
                type: "manager_plan.failed",
                payload: {
                    meetingId: state.id,
                    participantId: unavailableRequiredParticipant,
                    code: "REQUIRED_SPEAKER_UNAVAILABLE",
                    reason,
                    meetingVersion: version
                }
            },
            {
                type: "meeting.waiting",
                payload: {
                    meetingId: state.id,
                    from: state.status,
                    to: "waiting",
                    meetingVersion: version,
                    reason
                }
            }
        ];
        return result();
    }

    if (nextState.selectionMode === "round_robin") {
        const planned = planRoundRobinTurn(
            { ...nextState, currentTurn: undefined },
            {
                turnId: `turn-${nextState.turnSeq + 1}`,
                stepId: (_nextParticipantId, index) => `step-turn-${nextState.turnSeq + 1}-${index}`
            },
            context.now
        );
        const firstStep = planned.steps[0]!;
        const selectedRaise = nextState.handRaises.find(
            (raise) => raise.status === "pending" && raise.participant === firstStep.speaker
        );
        const consumed =
            selectedRaise === undefined
                ? { state: nextState, effect: { events: [] } }
                : consumeHandRaise(nextState, selectedRaise.id);
        const firstAttempt: SpeakerAttempt = {
            attemptId: `${planned.id}-attempt-0`,
            participantId: firstStep.speaker,
            meetingId: state.id,
            turnId: planned.id,
            stepId: firstStep.id,
            deliveryId: `${planned.id}-delivery-0`,
            contextFromSeq: 0,
            contextThroughSeq: nextState.messageSeq,
            taskSnapshots: completedTaskSnapshots(nextState, firstStep.speaker, context.now),
            assignedAt: context.now,
            ...(nextState.limits.speakerAttemptTimeoutMs === undefined
                ? {}
                : { deadlineAt: context.now + nextState.limits.speakerAttemptTimeoutMs }),
            status: "running",
            deliveryStatus: "pending"
        };
        const runningTurn: MeetingTurn = {
            ...planned,
            status: "running",
            steps: planned.steps.map((step, index) =>
                index === 0 ? { ...step, status: "running", attempt: firstAttempt } : step
            )
        };
        nextState = {
            ...consumed.state,
            currentTurn: runningTurn,
            turnSeq: runningTurn.seq,
            status: "running",
            waitState: undefined,
            manager: {
                ...nextState.manager,
                status: "idle",
                currentPlanningAttempt: undefined
            },
            participants: nextState.participants.map((participant) =>
                participant.id === firstStep.speaker
                    ? { ...participant, status: "speaking" }
                    : participant
            )
        };
        events = [
            ...events,
            { type: "turn.planned", payload: { turnId: planned.id, meetingVersion: version } },
            { type: "turn.started", payload: { turnId: planned.id, meetingVersion: version } },
            {
                type: "speaker.assigned",
                payload: {
                    meetingId: state.id,
                    turnId: planned.id,
                    stepId: firstStep.id,
                    participantId: firstStep.speaker,
                    attemptId: firstAttempt.attemptId,
                    deliveryId: firstAttempt.deliveryId,
                    meetingVersion: version
                }
            },
            {
                type: "speaker.started",
                payload: { stepId: firstStep.id, meetingVersion: version }
            },
            {
                type: "speaker_attempt.started",
                payload: { attemptId: firstAttempt.attemptId, meetingVersion: version }
            }
        ];
        return result();
    }

    const planningAttempt: ManagerPlanningAttempt = {
        id: context.nextPlanningAttemptId,
        meetingId: state.id,
        observedMeetingVersion: version,
        reason: "next_turn",
        deliveryId: context.nextPlanningDeliveryId,
        status: "running",
        createdAt: context.now
    };
    nextState = {
        ...nextState,
        currentTurn: undefined,
        status: "running",
        waitState: undefined,
        replanCount: nextState.replanCount + 1,
        manager: {
            ...nextState.manager,
            status: "planning",
            currentPlanningAttempt: planningAttempt
        }
    };
    events = [
        ...events,
        {
            type: "manager_plan.started",
            payload: {
                meetingId: state.id,
                planningAttemptId: planningAttempt.id,
                deliveryId: planningAttempt.deliveryId,
                reason: planningAttempt.reason,
                meetingVersion: version,
                observedMeetingVersion: version
            }
        }
    ];
    return result();
}
