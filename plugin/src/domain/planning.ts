import { DomainError } from "./errors.js";
import { participantHasActiveMeetingTask } from "./hand-raise.js";
import type {
    MeetingParticipant,
    MeetingState,
    MeetingTurn,
    SpeakerSelectionReason,
    SpeakerStep,
    TurnIntent
} from "./model.js";

export function isParticipantDispatchableNow(
    state: MeetingState,
    participant: MeetingParticipant
): boolean {
    return (
        participant.status === "available" &&
        participant.consecutiveAttemptFailures <
            state.limits.maxConsecutiveAttemptFailuresPerParticipant &&
        !participantHasActiveMeetingTask(state, participant.id)
    );
}

export interface RoundRobinPlanIds {
    turnId: string;
    stepId(participantId: string, index: number): string;
}

export interface ManagerPlanInput {
    agendaItemId: string;
    intent: string;
    objective: string;
    expectedOutputs: readonly string[];
    prohibitedTopics: readonly string[];
    steps: readonly {
        participantId: string;
        instruction: string;
        reason: string;
    }[];
}

export interface ManagerPlanIds {
    turnId: string;
    stepId(index: number): string;
}

export type ConvergenceAction = "normal" | "refocus" | "replan";

export interface ScoredPlanningCandidate {
    participantId: string;
    required: boolean;
    score: number;
    registrationIndex: number;
}

function currentAgenda(state: MeetingState) {
    return state.agenda.find((item) => item.id === state.activeAgendaItemId);
}

function latestSpeakerTurnSeq(state: MeetingState, participantId: string): number | undefined {
    const turns = state.transcript
        .filter((message) => message.speaker === participantId)
        .map((message) => message.turnSeq);
    return turns.length === 0 ? undefined : Math.max(...turns);
}

function currentProposal(state: MeetingState) {
    const proposals = state.proposals.filter(
        (proposal) => proposal.agendaItemId === state.activeAgendaItemId
    );
    return proposals.sort((left, right) => right.revision - left.revision)[0];
}

export function rankRulePlanningCandidates(
    state: MeetingState
): readonly ScoredPlanningCandidate[] {
    const agenda = currentAgenda(state);
    const proposal = currentProposal(state);
    const latestMessage = [...state.transcript]
        .filter((message) => message.agendaItemId === state.activeAgendaItemId)
        .sort((left, right) => right.seq - left.seq)[0];
    const blockingPositionOwners = new Set(
        (proposal?.positions ?? [])
            .filter(
                (position) =>
                    position.proposalRevision === proposal?.revision &&
                    position.blocking &&
                    (position.position === "object" || position.position === "needs_revision")
            )
            .map((position) => position.participantId)
    );
    const directedQuestionOwners = new Set(
        state.openQuestions
            .filter(
                (question) =>
                    question.status === "open" &&
                    question.blocking &&
                    question.directedTo !== undefined
            )
            .map((question) => question.directedTo as string)
    );
    const freshTaskReporters = new Set(
        (state.meetingTasks ?? [])
            .filter((task) => task.status === "completed")
            .filter((task) =>
                state.handRaises.some(
                    (raise) =>
                        raise.status === "pending" &&
                        raise.reason === "task_completed" &&
                        raise.participant === task.participantId &&
                        raise.taskIds.includes(task.meetingTaskId)
                )
            )
            .map((task) => task.participantId)
    );
    const requiredReviewers = new Set(state.objectiveContract.requiredReviewers);
    const agendaRequiredParticipants = new Set(agenda?.requiredParticipants ?? []);
    const required = new Set<string>();
    const scoreByParticipant = new Map<string, number>();
    for (const participant of state.participants) {
        const neverSpoke = latestSpeakerTurnSeq(state, participant.id) === undefined;
        const explicitlyMentioned = latestMessage?.mentions.includes(participant.id) ?? false;
        const agendaOwner = agenda?.owner === participant.id;
        const handRaise = state.handRaises.some(
            (raise) =>
                raise.status === "pending" &&
                raise.participant === participant.id &&
                raise.agendaItemId === state.activeAgendaItemId &&
                raise.priority === "blocking"
        );
        if (
            explicitlyMentioned ||
            agendaRequiredParticipants.has(participant.id) ||
            directedQuestionOwners.has(participant.id) ||
            requiredReviewers.has(participant.id) ||
            agendaOwner ||
            freshTaskReporters.has(participant.id) ||
            blockingPositionOwners.has(participant.id) ||
            handRaise
        ) {
            required.add(participant.id);
        }
        const lastTurnSeq = latestSpeakerTurnSeq(state, participant.id);
        const recency =
            lastTurnSeq === undefined ? 15 : Math.min(15, Math.max(0, state.turnSeq - lastTurnSeq));
        let score = 0;
        if (explicitlyMentioned) score += 100;
        if (directedQuestionOwners.has(participant.id)) score += 80;
        if (requiredReviewers.has(participant.id)) score += 60;
        if (agendaOwner) score += 50;
        if (freshTaskReporters.has(participant.id)) score += 40;
        if (blockingPositionOwners.has(participant.id)) score += 25;
        if (neverSpoke) score += 20;
        score += recency;
        if (latestMessage?.speaker === participant.id) score -= 25;
        if (participant.consecutiveSpeeches + 1 >= state.limits.maxConsecutiveSpeechesPerSpeaker) {
            score -= 40;
        }
        scoreByParticipant.set(participant.id, score);
    }
    return state.participants
        .map((participant, registrationIndex) => ({
            participantId: participant.id,
            required: required.has(participant.id),
            score: scoreByParticipant.get(participant.id)!,
            registrationIndex
        }))
        .sort(
            (left, right) =>
                Number(right.required) - Number(left.required) ||
                right.score - left.score ||
                left.registrationIndex - right.registrationIndex
        );
}

export function requiredPlanningBlockers(
    state: MeetingState,
    dispatchableParticipantIds?: readonly string[]
): string[] {
    const dispatchable = new Set(
        dispatchableParticipantIds ??
            state.participants
                .filter((participant) => isParticipantDispatchableNow(state, participant))
                .map((participant) => participant.id)
    );
    const rankedRequired = rankRulePlanningCandidates(state).filter(
        (candidate) => candidate.required
    );
    const agendaRequired =
        state.agenda.find((item) => item.id === state.activeAgendaItemId)?.requiredParticipants ??
        [];
    const requiredIds = new Set([
        ...agendaRequired,
        ...rankedRequired.map((candidate) => candidate.participantId)
    ]);
    const required = [
        ...rankedRequired,
        ...agendaRequired
            .filter((participantId) =>
                rankedRequired.every((candidate) => candidate.participantId !== participantId)
            )
            .map((participantId) => ({
                participantId,
                required: true,
                score: 0,
                registrationIndex: state.participants.findIndex(
                    (participant) => participant.id === participantId
                )
            }))
    ].filter((candidate) => requiredIds.has(candidate.participantId));
    const unavailable = required
        .filter((candidate) => !dispatchable.has(candidate.participantId))
        .map((candidate) => candidate.participantId);
    const overflow = required
        .filter((candidate) => dispatchable.has(candidate.participantId))
        .slice(state.limits.maxSpeakersPerTurn)
        .map((candidate) => candidate.participantId);
    return [...new Set([...unavailable, ...overflow])].sort();
}

export function planRuleBasedTurn(
    state: MeetingState,
    ids: RoundRobinPlanIds,
    now: number,
    action: ConvergenceAction
): MeetingTurn {
    const blockers = requiredPlanningBlockers(state);
    if (blockers.length > 0) {
        throw new DomainError(
            "REQUIRED_SPEAKER_UNAVAILABLE",
            `required Participants cannot form one complete plan: ${blockers.join(",")}`
        );
    }
    const ranked = rankRulePlanningCandidates(state);
    const selected = ranked
        .filter(({ participantId }) => {
            const participant = state.participants.find(({ id }) => id === participantId)!;
            return isParticipantDispatchableNow(state, participant);
        })
        .slice(0, state.limits.maxSpeakersPerTurn);
    if (selected.length === 0) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} has no available participant`
        );
    }
    const agenda = activeAgenda(state);
    const steps = selected.map(({ participantId }, index) => ({
        id: ids.stepId(participantId, index),
        speaker: participantId,
        instruction: `Address the active agenda: ${agenda.objective}`,
        reason: "rule_score" as SpeakerSelectionReason,
        status: "pending" as const
    }));
    return {
        id: ids.turnId,
        seq: state.turnSeq + 1,
        agendaItemId: agenda.id,
        intent: action === "normal" ? "explore" : "refocus",
        ...(action === "normal" ? {} : { reason: action }),
        objective: agenda.objective,
        expectedOutputs: [...agenda.completionCriteria],
        prohibitedTopics: [...agenda.outOfScope],
        plan: steps.map(({ speaker }) => speaker),
        status: "planned",
        currentStepIndex: 0,
        steps,
        createdAt: now
    };
}

export function needsSemanticArbitration(
    state: MeetingState,
    ranked: readonly ScoredPlanningCandidate[],
    action: ConvergenceAction
): boolean {
    if (action === "refocus" || action === "replan") return true;
    const limit = state.limits.maxSpeakersPerTurn;
    const boundaryTie = ranked.length > limit && ranked[limit - 1]?.score === ranked[limit]?.score;
    const proposal = currentProposal(state);
    const owners = new Set(
        (proposal?.positions ?? [])
            .filter(
                (position) =>
                    position.proposalRevision === proposal?.revision &&
                    position.blocking &&
                    (position.position === "object" || position.position === "needs_revision")
            )
            .map((position) => position.participantId)
    );
    return boundaryTie || owners.size >= 2;
}

export function nextManagerPlanningIds(state: MeetingState): {
    managerPlanningSeq: number;
    planningAttemptId: string;
    deliveryId: string;
} {
    const managerPlanningSeq = state.managerPlanningSeq + 1;
    return {
        managerPlanningSeq,
        planningAttemptId: `${state.id}-planning-${managerPlanningSeq}`,
        deliveryId: `${state.id}-planning-delivery-${managerPlanningSeq}`
    };
}

const turnIntents: readonly TurnIntent[] = [
    "explore",
    "clarify",
    "challenge",
    "review",
    "resolve_objection",
    "synthesize",
    "decide",
    "report_task_result",
    "refocus"
];

const speakerSelectionReasons: readonly SpeakerSelectionReason[] = [
    "explicit_mention",
    "direct_question",
    "required_reviewer",
    "agenda_owner",
    "task_result_owner",
    "blocking_objection_owner",
    "hand_raise",
    "rule_score",
    "manager_selected",
    "round_robin_fallback",
    "captain_summary"
];

const executionTerminalStatuses = new Set([
    "completed",
    "partial",
    "no_consensus",
    "cancelled",
    "failed",
    "archiving",
    "archived"
]);

function requirePlanningAllowed(state: MeetingState): void {
    if (executionTerminalStatuses.has(state.status)) {
        throw new DomainError(
            "INVALID_STATE_TRANSITION",
            `meeting ${state.id} does not accept planning after execution terminal state`
        );
    }
}

function invalidManagerPlan(message: string): never {
    throw new DomainError("MANAGER_PLAN_INVALID", `manager plan is invalid: ${message}`);
}

function requireNonEmpty(value: string, field: string): void {
    if (!value.trim()) invalidManagerPlan(`${field} is required`);
}

function activeAgenda(state: MeetingState) {
    const agenda = state.agenda.find((item) => item.id === state.activeAgendaItemId);
    if (!agenda) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} has no active agenda item for round-robin planning`
        );
    }
    return agenda;
}

/**
 * Builds the vertical-slice's deterministic plan without mutating the Meeting.
 * Runtime owns persistence and the subsequent Turn/Attempt transitions.
 */
export function planRoundRobinTurn(
    state: MeetingState,
    ids: RoundRobinPlanIds,
    now: number
): MeetingTurn {
    requirePlanningAllowed(state);
    if (state.currentTurn) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} already has a current turn`
        );
    }

    const agenda = activeAgenda(state);
    const pendingRaiseParticipants = new Set(
        state.handRaises
            .filter((raise) => raise.status === "pending")
            .map((raise) => raise.participant)
    );
    const speakers = state.participants
        .filter((participant) => isParticipantDispatchableNow(state, participant))
        .sort(
            (left, right) =>
                Number(pendingRaiseParticipants.has(right.id)) -
                Number(pendingRaiseParticipants.has(left.id))
        )
        .slice(0, state.limits.maxSpeakersPerTurn);
    if (speakers.length === 0) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} has no available participant for round-robin planning`
        );
    }
    if (new Set(speakers.map(({ id }) => id)).size !== speakers.length) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} has duplicate participant identities`
        );
    }

    const steps: SpeakerStep[] = speakers.map((participant, index) => ({
        id: ids.stepId(participant.id, index),
        speaker: participant.id,
        instruction: `Address the active agenda: ${agenda.objective}`,
        reason: "round_robin_fallback",
        status: "pending"
    }));

    return {
        id: ids.turnId,
        seq: state.turnSeq + 1,
        agendaItemId: agenda.id,
        intent: "explore",
        objective: agenda.objective,
        expectedOutputs: [...agenda.completionCriteria],
        prohibitedTopics: [...agenda.outOfScope],
        plan: steps.map(({ speaker }) => speaker),
        status: "planned",
        currentStepIndex: 0,
        steps,
        createdAt: now
    };
}

/**
 * Validates a Manager-selected ordered plan and builds a Turn without mutating
 * the Meeting. Runtime performs ownership and current dispatchability checks.
 */
export function planManagerTurn(
    state: MeetingState,
    input: ManagerPlanInput,
    ids: ManagerPlanIds,
    now: number
): MeetingTurn {
    requirePlanningAllowed(state);
    if (state.currentTurn) {
        invalidManagerPlan("meeting already has a current turn");
    }

    const agenda = state.agenda.find((item) => item.id === state.activeAgendaItemId);
    if (!agenda) invalidManagerPlan("meeting has no active agenda item");
    if (input.agendaItemId !== agenda.id)
        invalidManagerPlan("agenda item does not match active agenda");
    requireNonEmpty(input.intent, "intent");
    requireNonEmpty(input.objective, "objective");
    if (!turnIntents.includes(input.intent as TurnIntent)) {
        invalidManagerPlan(`unknown intent ${input.intent}`);
    }
    if (input.steps.length === 0) invalidManagerPlan("steps must not be empty");
    if (input.steps.length > state.limits.maxSpeakersPerTurn) {
        invalidManagerPlan("steps exceed max speakers per turn");
    }

    const participantIds = new Set(state.participants.map(({ id }) => id));
    const selectedIds = new Set<string>();
    for (const [index, step] of input.steps.entries()) {
        if (!participantIds.has(step.participantId)) {
            invalidManagerPlan(`unknown participant ${step.participantId}`);
        }
        if (selectedIds.has(step.participantId)) {
            invalidManagerPlan(`participant ${step.participantId} is duplicated`);
        }
        selectedIds.add(step.participantId);
        requireNonEmpty(step.instruction, `steps[${index}].instruction`);
        requireNonEmpty(step.reason, `steps[${index}].reason`);
        if (!speakerSelectionReasons.includes(step.reason as SpeakerSelectionReason)) {
            invalidManagerPlan(`unknown reason ${step.reason}`);
        }
    }
    for (const requiredParticipantId of agenda.requiredParticipants) {
        if (!selectedIds.has(requiredParticipantId)) {
            invalidManagerPlan(`required participant ${requiredParticipantId} is missing`);
        }
    }

    const steps: SpeakerStep[] = input.steps.map((step, index) => ({
        id: ids.stepId(index),
        speaker: step.participantId,
        instruction: step.instruction,
        reason: step.reason as SpeakerSelectionReason,
        status: "pending"
    }));
    return {
        id: ids.turnId,
        seq: state.turnSeq + 1,
        agendaItemId: agenda.id,
        intent: input.intent as TurnIntent,
        objective: input.objective,
        expectedOutputs: [...input.expectedOutputs],
        prohibitedTopics: [...input.prohibitedTopics],
        plan: steps.map(({ speaker }) => speaker),
        status: "planned",
        currentStepIndex: 0,
        steps,
        createdAt: now
    };
}
