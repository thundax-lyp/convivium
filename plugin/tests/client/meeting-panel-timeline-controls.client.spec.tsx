import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
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
});
