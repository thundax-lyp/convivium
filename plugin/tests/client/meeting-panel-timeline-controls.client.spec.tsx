import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingPanelTimeline } from "@/client/meeting-panel-timeline.js";
import {
    INITIAL_TIMELINE_FILTERS,
    type TimelineFilterState
} from "@/client/meeting-workspace-state.js";
import { activeTimelineFixture } from "./meeting-timeline-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);

function Harness({ revision = 0 }: { revision?: number }) {
    const [filters, setFilters] = useState<TimelineFilterState>(INITIAL_TIMELINE_FILTERS);
    return createElement(MeetingPanelTimeline, {
        detail: activeTimelineFixture(),
        filters,
        viewportRevision: revision,
        t: meetingTranslator("en"),
        onFiltersChange: setFilters
    });
}

describe("Timeline controls", () => {
    it("combines filter groups by AND and values within a group by OR without shrinking options", () => {
        render(createElement(Harness));
        expect(screen.getAllByTestId("timeline-node")).toHaveLength(19);
        fireEvent.click(screen.getByRole("button", { name: "Contributor: contributor-v1" }));
        expect(screen.getAllByTestId("timeline-node").length).toBeGreaterThan(1);
        expect(screen.getByRole("button", { name: "Manager: manager-v1" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Completion fact" }));
        expect(
            screen.getAllByTestId("timeline-node").map((node) => node.getAttribute("data-node-key"))
        ).toEqual(["completion_fact:completion-1:created"]);
        fireEvent.click(screen.getByRole("button", { name: "Opportunity request" }));
        expect(screen.getAllByTestId("timeline-node")).toHaveLength(2);
        fireEvent.click(screen.getByRole("button", { name: "Active" }));
        expect(screen.getAllByTestId("timeline-node")).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "Decision: decision-1" }));
        expect(screen.getAllByTestId("timeline-node")).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        expect(screen.getAllByTestId("timeline-node")).toHaveLength(19);
    });

    it("bounds zoom, collapses a lane, locates latest and resets scroll on revision", () => {
        const scrollIntoView = vi.fn();
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollIntoView
        });
        const rendered = render(createElement(Harness, { revision: 0 }));
        const viewport = screen.getByLabelText("Timeline viewport");
        const inner = viewport.firstElementChild as HTMLElement;
        expect(inner.style.columnGap).toBe("12px");
        for (let i = 0; i < 8; i++)
            fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        expect(inner.style.columnGap).toBe("24px");
        expect(screen.getByRole("button", { name: "Zoom in" }).disabled).toBe(true);
        for (let i = 0; i < 8; i++)
            fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
        expect(inner.style.columnGap).toBe("9px");
        expect(screen.getByRole("button", { name: "Zoom out" }).disabled).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Collapse Contributor" }));
        expect(
            screen
                .getAllByTestId("timeline-node")
                .find(
                    (node) =>
                        node.getAttribute("data-node-key") ===
                        "hand_raise:round-1:contributor-v1:raised"
                )?.hidden
        ).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Expand Contributor" }));
        fireEvent.click(screen.getByRole("button", { name: "Latest" }));
        expect(scrollIntoView).toHaveBeenCalledOnce();
        viewport.scrollLeft = 120;
        rendered.rerender(createElement(Harness, { revision: 1 }));
        expect(viewport.scrollLeft).toBe(0);
    });
});
