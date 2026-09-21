import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state.js";
import { projectMeetingSummary, projectMeetingView } from "@/projection/index.js";

export function meetingProjectionFixture() {
    const state = makeRunningMeetingStateV1();
    const snapshot = {
        meetingId: state.id,
        version: state.version,
        state,
        createdAt: 0,
        updatedAt: 1
    };
    return {
        summary: projectMeetingSummary(snapshot),
        view: projectMeetingView(snapshot, { kind: "local" })
    };
}
