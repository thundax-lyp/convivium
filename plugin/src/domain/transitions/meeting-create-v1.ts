import type { MeetingState } from "@/domain/meeting-state-v1.js";

export function createMeetingV1(state: MeetingState): MeetingState {
    return structuredClone(state);
}
