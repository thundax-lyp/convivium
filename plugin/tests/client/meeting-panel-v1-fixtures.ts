import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state-v1.js";
import { projectMeetingSummaryV1, projectMeetingViewV1 } from "@/projection/index.js";

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
        summary: projectMeetingSummaryV1(snapshot),
        view: projectMeetingViewV1(snapshot, { kind: "local" })
    };
}
