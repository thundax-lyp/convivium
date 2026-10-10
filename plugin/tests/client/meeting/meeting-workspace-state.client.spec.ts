import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting/shared/index.ts";
import { useMeetingWorkspace } from "@/client/meeting/hooks/index.ts";

afterEach(cleanup);

describe("Meetings workspace state", () => {
    it("starts without a selection and with neutral timeline controls", () => {
        expect(INITIAL_TIMELINE_FILTERS).toEqual({
            identityIds: [],
            objectKinds: [],
            statuses: [],
            relatedObjects: [],
            zoom: 1,
            collapsedLanes: []
        });
        const { result } = renderHook(useMeetingWorkspace);
        expect(result.current.workspace).toEqual({
            activeMode: "overview",
            timeline: INITIAL_TIMELINE_FILTERS,
            viewportRevision: 0
        });
    });

    it("resets Meeting-local state and advances the viewport revision", () => {
        const { result } = renderHook(useMeetingWorkspace);
        act(() => result.current.selectMeeting("meeting-1"));
        act(() => {
            result.current.setTimelineFilters({
                ...INITIAL_TIMELINE_FILTERS,
                identityIds: ["contributor-1"]
            });
            result.current.locateInOverview({
                meetingId: "meeting-1",
                objectKind: "decision",
                objectId: "decision-1"
            });
            result.current.setMode("timeline");
        });
        act(() => result.current.selectMeeting("meeting-2"));

        expect(result.current.workspace).toEqual({
            selectedMeetingId: "meeting-2",
            activeMode: "overview",
            timeline: INITIAL_TIMELINE_FILTERS,
            viewportRevision: 2
        });
    });
});
