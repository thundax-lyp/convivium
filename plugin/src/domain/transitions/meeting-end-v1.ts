import type { MeetingState } from "@/domain/meeting-state-v1.js";

export function endMeetingV1(state: MeetingState, now: number, actorId: string): MeetingState {
    if (state.lifecycle.status === "terminal" || state.lifecycle.status === "archived")
        return state;
    return {
        ...structuredClone(state),
        lifecycle: { status: "terminal", changedAt: now, changedBy: actorId }
    };
}
