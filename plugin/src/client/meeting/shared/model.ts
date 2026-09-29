import type {
    MeetingsFreshnessState,
    MeetingsWorkspaceState,
    TimelineFilterState
} from "./types.ts";

export const INITIAL_TIMELINE_FILTERS: TimelineFilterState = {
    identityIds: [],
    objectKinds: [],
    statuses: [],
    relatedObjects: [],
    zoom: 1,
    collapsedLanes: []
};

export const INITIAL_WORKSPACE: MeetingsWorkspaceState = {
    activeMode: "overview",
    timeline: INITIAL_TIMELINE_FILTERS,
    viewportRevision: 0
};

export const INITIAL_FRESHNESS: MeetingsFreshnessState = {
    connection: "connecting",
    list: "loading",
    detail: "idle"
};

export const resetWorkspaceForMeeting = (
    meetingId: string,
    previousRevision: number
): MeetingsWorkspaceState => {
    return {
        selectedMeetingId: meetingId,
        activeMode: "overview",
        timeline: INITIAL_TIMELINE_FILTERS,
        viewportRevision: previousRevision + 1
    };
};

export const controlsEnabled = (input: {
    freshness: MeetingsFreshnessState;
    selectedMeetingId?: string;
    writePending: boolean;
}): boolean => {
    return (
        input.freshness.connection === "connected" &&
        input.freshness.list === "fresh" &&
        input.freshness.detail === "fresh" &&
        input.selectedMeetingId !== undefined &&
        !input.writePending
    );
};
