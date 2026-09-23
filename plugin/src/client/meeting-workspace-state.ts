export type MeetingMode = "overview" | "timeline";

export type TimelineLane = "captain" | "manager" | "contributor" | "reviewer" | "system";

export type TimelineZoom = 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2;

export type DataFreshness = "idle" | "loading" | "fresh" | "stale";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export interface TimelineObjectRef {
    objectKind: string;
    objectId: string;
}

export interface MeetingFocusTarget {
    meetingId: string;
    objectKind: string;
    objectId: string;
}

export interface TimelineFilterState {
    identityIds: readonly string[];
    objectKinds: readonly string[];
    statuses: readonly string[];
    relatedObjects: readonly TimelineObjectRef[];
    zoom: TimelineZoom;
    collapsedLanes: readonly TimelineLane[];
}

export interface MeetingsWorkspaceState {
    selectedMeetingId?: string;
    activeMode: MeetingMode;
    focusTarget?: MeetingFocusTarget;
    timeline: TimelineFilterState;
    viewportRevision: number;
}

export interface MeetingsFreshnessState {
    connection: ConnectionState;
    list: DataFreshness;
    detail: DataFreshness;
}

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
