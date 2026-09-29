import type { TimelineFilterState } from "./types.ts";

export const INITIAL_TIMELINE_FILTERS: TimelineFilterState = {
    identityIds: [],
    objectKinds: [],
    statuses: [],
    relatedObjects: [],
    zoom: 1,
    collapsedLanes: []
};
