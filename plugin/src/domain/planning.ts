import { DomainError } from "./errors.js";
import { participantHasActiveMeetingTask } from "./hand-raise.js";
import type {
    MeetingState,
    MeetingTurn,
    SpeakerSelectionReason,
    SpeakerStep,
    TurnIntent
} from "./model.js";

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
        .filter(
            (participant) =>
                participant.status === "available" &&
                !participantHasActiveMeetingTask(state, participant.id)
        )
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
