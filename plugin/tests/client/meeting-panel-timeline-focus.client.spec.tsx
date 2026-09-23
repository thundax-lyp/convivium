import { cleanup, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingPanelTimeline } from "@/client/meeting-panel-timeline.js";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting-workspace-state.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";
import { activeTimelineFixture } from "./meeting-timeline-fixtures.js";

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
