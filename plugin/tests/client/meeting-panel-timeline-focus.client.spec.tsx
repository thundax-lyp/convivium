import { cleanup, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingPanelTimeline } from "@/client/meeting-panel-timeline.js";
import { MeetingPanelOverview } from "@/client/meeting-panel-overview.js";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting-workspace-state.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";
import { activeTimelineFixture, archiveTimelineFixture } from "./meeting-timeline-fixtures.js";

afterEach(cleanup);

describe("Meeting timeline presentation", () => {
    it("shows timeline controls and visible node information", () => {
        render(
            <MeetingPanelTimeline
                detail={activeTimelineFixture()}
                filters={INITIAL_TIMELINE_FILTERS}
                viewportRevision={0}
                locale="zh"
                t={meetingTranslator("zh")}
                onFiltersChange={() => undefined}
            />
        );

        expect(screen.getByRole("button", { name: "回到最新" })).toBeTruthy();
        const decision = screen
            .getAllByTestId("timeline-node")
            .find((node) => node.dataset.nodeKey === "decision:decision-1:created");
        expect(decision).toBeDefined();
        expect(within(decision!).getByText("已接受")).toBeTruthy();
        expect(decision!.querySelector("time")?.textContent).toBeTruthy();
    });
});

describe("Meeting overview location", () => {
    it("focuses a displayed decision and reports an undisplayed position as unavailable", () => {
        const detail = archiveTimelineFixture("complete");
        const onFocusConsumed = vi.fn();
        const props = {
            detail,
            t: meetingTranslator("en"),
            onFocusConsumed,
            onLocateInTimeline: vi.fn()
        };
        const { rerender } = render(
            <MeetingPanelOverview
                {...props}
                focusTarget={{
                    meetingId: detail.meetingId,
                    objectKind: "decision",
                    objectId: "decision-1"
                }}
            />
        );
        expect(document.activeElement?.tagName).toBe("LI");
        expect(document.activeElement?.textContent).toContain("decision-1");

        rerender(
            <MeetingPanelOverview
                {...props}
                focusTarget={{
                    meetingId: detail.meetingId,
                    objectKind: "position",
                    objectId: "position-1"
                }}
            />
        );
        expect(screen.getByRole("status").textContent).toBe("The target is currently unavailable.");
        expect(screen.queryByRole("button", { name: /position-1/ })).toBeNull();
        expect(onFocusConsumed).toHaveBeenCalledTimes(2);
    });
});
