import type * as React from "react";
import type { MeetingReadResult, MeetingSummary } from "@/protocol/index.ts";

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

export interface MeetingPanelLayoutProps {
    localFeedback?: React.ReactNode;
    locale?: string;
    meetings: readonly MeetingSummary[];
    selectedId?: string;
    detail?: MeetingReadResult;
    listLoading: boolean;
    listCached: boolean;
    detailCached: boolean;
    listError?: string;
    detailError?: string;
    writePending: boolean;
    activeMode?: MeetingMode;
    setMode?(mode: MeetingMode): void;
    timelineFilters?: TimelineFilterState;
    viewportRevision?: number;
    onTimelineFiltersChange?(filters: TimelineFilterState): void;
    focusTarget?: MeetingFocusTarget;
    onFocusConsumed?(): void;
    onLocateInOverview?(target: MeetingFocusTarget): void;
    requestRefresh(): void;
    selectMeeting(meetingId: string): void;
    pauseMeeting(): Promise<void>;
    resumeMeeting(): Promise<void>;
    endMeeting(): Promise<void>;
}
