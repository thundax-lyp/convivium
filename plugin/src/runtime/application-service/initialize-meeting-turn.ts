import {
    completedTaskSnapshots,
    planRoundRobinTurn,
    planRuleBasedTurn,
    requiredPlanningBlockers,
    type MeetingState,
    type MeetingTurn
} from "@/domain/index.js";
import type {
    DomainEventInput,
    JsonObject,
    MeetingRepositoryRuntime
} from "@/runtime/meeting-runtime.js";

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
    now: number,
    managerFallback = false
): Promise<{ meetingVersion: number; status: "running" | "waiting" }> {
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
    const blockers = requiredPlanningBlockers(activeState);
    if (blockers.length > 0) {
        const waitingEvents: DomainEventInput[] = [
            { type: "meeting.started", payload: { meetingId: activeState.id } },
            {
                type: "meeting.waiting",
                payload: {
                    meetingId: activeState.id,
                    from: currentState.status,
                    to: "waiting",
                    reason: "required_participant_unavailable",
                    participantIds: blockers
                }
            }
        ];
        const committed = await repository.execute({
            requestId: "runtime-initialize-waiting",
            commandKind: "start_turn",
            authorization: { callerBinding: "runtime:convivium", capabilityId: "runtime:turn" },
            requestHash: `runtime-initialize-waiting:${JSON.stringify(blockers)}`,
            expectedMeetingVersion: current.version,
            transition: () => ({
                state: {
                    ...activeState,
                    status: "waiting",
                    waitState: {
                        reason: "required_participant_unavailable",
                        waitingSince: now,
                        taskIds: [],
                        participantIds: blockers,
                        resumeAgendaItemId: activeState.activeAgendaItemId
                    },
                    version: activeState.version + 1,
                    updatedAt: now
                } as unknown as JsonObject,
                result: { status: "waiting" },
                events: waitingEvents,
                outbox: []
            })
        });
        return { meetingVersion: committed.meetingVersion, status: "waiting" };
    }
    const planned =
        activeState.selectionMode === "round_robin"
            ? planRoundRobinTurn(
                  activeState,
                  {
                      turnId: "turn-1",
                      stepId: (participantId, index) => `step-${participantId}-${index}`
                  },
                  now
              )
            : planRuleBasedTurn(
                  activeState,
                  {
                      turnId: "turn-1",
                      stepId: (participantId, index) => `step-${participantId}-${index}`
                  },
                  now,
                  "normal"
              );
    const directedPlan = managerFallback
        ? { ...planned, reason: "manager_fallback" as const }
        : planned;
    const running = assignTurnAttempt(activeState, directedPlan, 0, now);
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
    return { meetingVersion: committed.meetingVersion, status: "running" };
}
