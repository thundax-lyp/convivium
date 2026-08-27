import { DomainError } from "./errors.js";
import type { MeetingState, MeetingTurn, SpeakerStep } from "./model.js";

export interface RoundRobinPlanIds {
    turnId: string;
    stepId(participantId: string, index: number): string;
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
    if (state.currentTurn) {
        throw new DomainError(
            "INVALID_ENTITY_STATE",
            `meeting ${state.id} already has a current turn`
        );
    }

    const agenda = activeAgenda(state);
    const speakers = state.participants
        .filter((participant) => participant.status === "available")
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
