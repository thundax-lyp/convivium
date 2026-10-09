import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeetingPanelLayoutProps } from "@/client/meeting/shared/index.ts";
import type { MeetingMode } from "@/client/meeting/shared/index.ts";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.ts";
import { translatedLayout } from "./meeting-panel-locale-fixtures.ts";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

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
    return translatedLayout({ ...initial, activeMode: mode, setMode }, "en");
}

describe("Meeting Header and mode tabs", () => {
    it("keeps an accessible refresh action available and exposes it on read failure", () => {
        const props = propsFixture();
        const { rerender } = render(translatedLayout(props, "en"));
        const button = screen.getByRole("button", { name: "Refresh" });
        expect(button.textContent).toBe("");
        fireEvent.click(button);
        expect(props.requestRefresh).toHaveBeenCalledOnce();

        rerender(translatedLayout({ ...props, detailError: "Read failed" }, "en"));
        expect(screen.getByRole("alert").textContent).toContain("Read failed");
        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
        expect(props.requestRefresh).toHaveBeenCalledTimes(2);
    });

    it("omits Header, tabs, and content until a Meeting detail is selected", () => {
        const initial = propsFixture();
        const props = { ...initial, selectedId: undefined, detail: undefined };
        render(translatedLayout(props, "en"));

        expect(screen.getByText("Select a meeting.")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
        expect(
            screen.queryByRole("heading", { name: initial.detail?.objective.statement })
        ).toBeNull();
        expect(screen.queryByRole("tablist")).toBeNull();
        expect(screen.queryByRole("tabpanel")).toBeNull();
    });

    it("renders only allowed icon lifecycle controls with hover labels", () => {
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(private readonly callback: ResizeObserverCallback) {}
                observe() {
                    this.callback(
                        [
                            {
                                borderBoxSize: [{ inlineSize: 100, blockSize: 20 }]
                            } as ResizeObserverEntry
                        ],
                        this as unknown as ResizeObserver
                    );
                }
                disconnect() {}
            }
        );
        const props = propsFixture();
        render(translatedLayout(props, "en"));

        const header = screen
            .getByRole("heading", { name: props.detail?.objective.statement })
            .closest("header");
        expect(header?.textContent).toContain("Running");
        expect(header?.textContent).toContain(`Meeting version: ${props.detail?.version}`);
        expect(
            within(screen.getByRole("group", { name: "Meeting controls" })).getAllByRole("button")
        ).toHaveLength(2);
        expect(screen.getByRole("button", { name: "Pause meeting" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Cancel meeting" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(false);
        expect(screen.getByRole("button", { name: "Cancel meeting" }).disabled).toBe(false);
        expect(screen.queryByRole("button", { name: "Resume meeting" })).toBeNull();
        for (const name of ["Pause meeting", "Cancel meeting"]) {
            expect(screen.getByRole("button", { name }).textContent).toBe("");
        }
        fireEvent.mouseEnter(screen.getByRole("button", { name: "Pause meeting" }).parentElement!);
        expect(screen.getByRole("tooltip").textContent).toBe("Pause meeting");
    });

    it("omits the control group when no Meeting action is allowed", () => {
        const { view } = meetingProjectionFixture();
        render(translatedLayout({ ...propsFixture(), detail: { ...view, controls: [] } }, "en"));

        expect(screen.queryByRole("group", { name: "Meeting controls" })).toBeNull();
    });

    it("shows only resume when that is the projected Meeting action", () => {
        const { view } = meetingProjectionFixture();
        render(
            translatedLayout(
                { ...propsFixture(), detail: { ...view, controls: ["resume_meeting"] } },
                "en"
            )
        );

        const group = screen.getByRole("group", { name: "Meeting controls" });
        expect(within(group).getAllByRole("button")).toHaveLength(1);
        expect(within(group).getByRole("button", { name: "Resume meeting" }).disabled).toBe(false);
    });

    it("disables every lifecycle control when the Workspace is not writable", () => {
        const props = { ...propsFixture(), detailCached: true };
        render(translatedLayout(props, "en"));

        expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(true);
        expect(screen.getByRole("button", { name: "Cancel meeting" }).disabled).toBe(true);
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
