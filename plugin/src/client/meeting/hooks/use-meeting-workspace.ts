import { useCallback, useState } from "react";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting/shared/index.ts";
import type {
    MeetingFocusTarget,
    MeetingMode,
    MeetingsWorkspaceState,
    TimelineFilterState
} from "@/client/meeting/shared/index.ts";

const INITIAL_WORKSPACE: MeetingsWorkspaceState = {
    activeMode: "overview",
    timeline: INITIAL_TIMELINE_FILTERS,
    viewportRevision: 0
};

export const useMeetingWorkspace = () => {
    const [workspace, setWorkspace] = useState<MeetingsWorkspaceState>(INITIAL_WORKSPACE);

    const selectMeeting = useCallback((meetingId: string) => {
        setWorkspace((current) => ({
            selectedMeetingId: meetingId,
            activeMode: "overview",
            timeline: INITIAL_TIMELINE_FILTERS,
            viewportRevision: current.viewportRevision + 1
        }));
    }, []);
    const clearSelection = useCallback(() => {
        setWorkspace((current) => ({
            ...current,
            selectedMeetingId: undefined,
            focusTarget: undefined
        }));
    }, []);
    const setMode = (activeMode: MeetingMode) => {
        setWorkspace((current) => ({ ...current, activeMode }));
    };
    const setTimelineFilters = (timeline: TimelineFilterState) => {
        setWorkspace((current) => ({ ...current, timeline }));
    };
    const consumeFocus = () => {
        setWorkspace((current) => ({ ...current, focusTarget: undefined }));
    };
    const locateInTimeline = (focusTarget: MeetingFocusTarget) => {
        setWorkspace((current) => ({ ...current, activeMode: "timeline", focusTarget }));
    };
    const locateInOverview = (focusTarget: MeetingFocusTarget) => {
        setWorkspace((current) => ({ ...current, activeMode: "overview", focusTarget }));
    };

    return {
        workspace,
        selectMeeting,
        clearSelection,
        setMode,
        setTimelineFilters,
        consumeFocus,
        locateInTimeline,
        locateInOverview
    };
};
