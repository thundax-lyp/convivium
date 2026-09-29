import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { projectMeetingSummary, projectMeetingView } from "@/projection/index.ts";

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
        view: projectMeetingView(snapshot, { kind: "captain" })
    };
}
