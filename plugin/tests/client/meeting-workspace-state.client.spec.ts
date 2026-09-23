import { describe, expect, it } from "vitest";
import {
    INITIAL_FRESHNESS,
    INITIAL_TIMELINE_FILTERS,
    INITIAL_WORKSPACE,
    controlsEnabled,
    resetWorkspaceForMeeting,
    type TimelineZoom
} from "@/client/meeting-workspace-state.js";

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
        expect(INITIAL_WORKSPACE).toEqual({
            activeMode: "overview",
            timeline: INITIAL_TIMELINE_FILTERS,
            viewportRevision: 0
        });
        expect(INITIAL_FRESHNESS).toEqual({
            connection: "connecting",
            list: "loading",
            detail: "idle"
        });
    });

    it("resets Meeting-local state and advances the viewport revision", () => {
        expect(resetWorkspaceForMeeting("meeting-2", 7)).toEqual({
            selectedMeetingId: "meeting-2",
            activeMode: "overview",
            timeline: INITIAL_TIMELINE_FILTERS,
            viewportRevision: 8
        });
    });

    it("uses the six fixed timeline zoom levels", () => {
        const zooms: TimelineZoom[] = [0.75, 1, 1.25, 1.5, 1.75, 2];
        expect(zooms).toEqual([0.75, 1, 1.25, 1.5, 1.75, 2]);
    });

    it.each([
        ["all readiness conditions hold", "connected", "fresh", "fresh", "meeting-1", false, true],
        ["connection is not ready", "disconnected", "fresh", "fresh", "meeting-1", false, false],
        ["list is stale", "connected", "stale", "fresh", "meeting-1", false, false],
        ["detail is loading", "connected", "fresh", "loading", "meeting-1", false, false],
        ["no Meeting is selected", "connected", "fresh", "fresh", undefined, false, false],
        ["a write is pending", "connected", "fresh", "fresh", "meeting-1", true, false]
    ] as const)(
        "enables lifecycle controls only when %s",
        (_case, connection, list, detail, selectedMeetingId, writePending, expected) => {
            expect(
                controlsEnabled({
                    freshness: { connection, list, detail },
                    selectedMeetingId,
                    writePending
                })
            ).toBe(expected);
        }
    );
});
