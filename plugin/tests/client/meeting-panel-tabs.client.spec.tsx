import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    renderMeetingPanelLayout,
    type MeetingPanelLayoutProps
} from "@/client/meeting-panel-layout.js";
import type { MeetingMode } from "@/client/meeting-workspace-state.js";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);

function propsFixture(): MeetingPanelLayoutProps {
    const { summary, view } = meetingProjectionFixture();
    return {
        meetings: [summary],
        selectedId: summary.meetingId,
        detail: view,
        listLoading: false,
        listCached: false,
        detailCached: false,
        writePending: false,
        activeMode: "overview",
        setMode: vi.fn(),
        requestRefresh: vi.fn(),
        selectMeeting: vi.fn(),
        pauseMeeting: vi.fn(async () => undefined),
        resumeMeeting: vi.fn(async () => undefined),
        endMeeting: vi.fn(async () => undefined)
    };
}

function TabsHarness({ initial }: { initial: MeetingPanelLayoutProps }) {
    const [mode, setMode] = useState<MeetingMode>(initial.activeMode);
    return renderMeetingPanelLayout(
        { ...initial, activeMode: mode, setMode },
        meetingTranslator("en")
    );
}

describe("Meeting Header and mode tabs", () => {
    it("omits Header, tabs, and content until a Meeting detail is selected", () => {
        const props = { ...propsFixture(), selectedId: undefined, detail: undefined };
        render(renderMeetingPanelLayout(props, meetingTranslator("en")));

        expect(screen.queryByTestId("meeting-header")).toBeNull();
        expect(screen.queryByRole("tablist")).toBeNull();
        expect(screen.queryByRole("tabpanel")).toBeNull();
    });

    it("renders objective, lifecycle, version, and only allowed controls in the Header", () => {
        const props = propsFixture();
        render(renderMeetingPanelLayout(props, meetingTranslator("en")));

        const header = screen.getByTestId("meeting-header");
        expect(header.textContent).toContain(props.detail?.objective.statement);
        expect(header.textContent).toContain("Running");
        expect(header.textContent).toContain(`Meeting version: ${props.detail?.version}`);
        expect(screen.getByRole("button", { name: "Pause meeting" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "End meeting" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Resume meeting" })).toBeNull();
    });

    it("disables every lifecycle control when the Workspace is not writable", () => {
        const props = { ...propsFixture(), detailCached: true };
        render(renderMeetingPanelLayout(props, meetingTranslator("en")));

        expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(true);
        expect(screen.getByRole("button", { name: "End meeting" }).disabled).toBe(true);
    });

    it("switches the shared detail panel with click and horizontal arrow keys", () => {
        const props = propsFixture();
        render(createElement(TabsHarness, { initial: props }));
        const overview = screen.getByRole("tab", { name: "Overview" });
        const timeline = screen.getByRole("tab", { name: "Timeline" });
        expect(overview.getAttribute("aria-selected")).toBe("true");
        expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
            "meeting-mode-overview"
        );

        fireEvent.keyDown(overview, { key: "ArrowRight" });
        expect(timeline.getAttribute("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(timeline);
        expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
            "meeting-mode-timeline"
        );

        fireEvent.keyDown(timeline, { key: "ArrowLeft" });
        expect(overview.getAttribute("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(overview);
    });
});
