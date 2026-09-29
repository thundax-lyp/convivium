import { cleanup, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingPanelTimeline } from "@/client/meeting/regions/workspace/timeline/index.ts";
import { MeetingPanelOverview } from "@/client/meeting/regions/workspace/overview/index.ts";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting/shared/index.ts";
import { withMeetingTranslation } from "./meeting-panel-locale-fixtures.ts";
import { activeTimelineFixture, archiveTimelineFixture } from "./meeting-timeline-fixtures.ts";

afterEach(cleanup);

describe("Meeting timeline presentation", () => {
    it("shows timeline controls and visible node information", () => {
        render(
            withMeetingTranslation(
                <MeetingPanelTimeline
                    detail={activeTimelineFixture()}
                    filters={INITIAL_TIMELINE_FILTERS}
                    viewportRevision={0}
                    locale="zh"
                    onFiltersChange={() => undefined}
                />,
                "zh"
            )
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
            onFocusConsumed,
            onLocateInTimeline: vi.fn()
        };
        const { rerender } = render(
            withMeetingTranslation(
                <MeetingPanelOverview
                    {...props}
                    focusTarget={{
                        meetingId: detail.meetingId,
                        objectKind: "decision",
                        objectId: "decision-1"
                    }}
                />,
                "en"
            )
        );
        expect(document.activeElement?.tagName).toBe("LI");
        expect(document.activeElement?.textContent).toContain("decision-1");

        rerender(
            withMeetingTranslation(
                <MeetingPanelOverview
                    {...props}
                    focusTarget={{
                        meetingId: detail.meetingId,
                        objectKind: "position",
                        objectId: "position-1"
                    }}
                />,
                "en"
            )
        );
        expect(screen.getByRole("status").textContent).toBe("The target is currently unavailable.");
        expect(screen.queryByRole("button", { name: /position-1/ })).toBeNull();
        expect(onFocusConsumed).toHaveBeenCalledTimes(2);
    });
});
