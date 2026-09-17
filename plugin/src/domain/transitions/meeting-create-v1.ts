import type { MeetingState } from "@/domain/meeting-state-v1.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-v1-validation.js";
import { rejectedTransitionV1, type MeetingTransitionResultV1 } from "./result-v1.js";

export function createMeetingV1(state: MeetingState): MeetingTransitionResultV1 {
    const validation = validateMeetingStateV1(state);
    if (validation.kind === "invalid")
        return rejectedTransitionV1(state, "INVALID_ARGUMENT", "invalid meeting state");
    if (
        state.version !== 1 ||
        state.lifecycle.status !== "running" ||
        state.termination !== undefined ||
        state.archive !== undefined
    )
        return rejectedTransitionV1(
            state,
            "INVALID_STATE",
            "meeting is not a new running aggregate"
        );
    return {
        kind: "accepted",
        state: structuredClone(state),
        relatedIds: [state.id],
        effectRequests: []
    };
}
