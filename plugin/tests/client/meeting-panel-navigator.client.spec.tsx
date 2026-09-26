import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderMeetingPanelLayout } from "@/client/meeting-panel-layout.js";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);

function mediaFixture(initial: boolean) {
    let matches = initial;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const query = {
        get matches() {
            return matches;
        },
        media: "(max-width: 760px)",
        onchange: null,
        addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) =>
            listeners.add(listener)
        ),
        removeEventListener: vi.fn(
            (_type: string, listener: (event: MediaQueryListEvent) => void) =>
                listeners.delete(listener)
        ),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
    } as unknown as MediaQueryList;
    return {
        query,
        setMatches(value: boolean) {
            matches = value;
            for (const listener of listeners)
                listener({ matches: value, media: query.media } as MediaQueryListEvent);
        }
    };
}

function layoutProps() {
    const { summary, view } = meetingProjectionFixture();
    return {
        props: {
            meetings: [summary],
            selectedId: summary.meetingId,
            detail: view,
            listLoading: false,
            listCached: false,
            detailCached: false,
            writePending: false,
            requestRefresh: vi.fn(),
            selectMeeting: vi.fn(),
            pauseMeeting: vi.fn(async () => undefined),
            resumeMeeting: vi.fn(async () => undefined),
            endMeeting: vi.fn(async () => undefined)
        },
        summary
    };
}

describe("Meeting navigator", () => {
    beforeEach(() => vi.unstubAllGlobals());

    it("does not offer meeting creation in the Web panel", () => {
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props } = layoutProps();

        render(renderMeetingPanelLayout(props, meetingTranslator("en")));

        expect(screen.getByTestId("meeting-navigator")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Create meeting" })).toBeNull();
        expect(screen.queryByTestId("meeting-user-controls")).toBeNull();
    });

    it("renders a persistent navigator and workspace grid on wide screens", () => {
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props } = layoutProps();

        render(renderMeetingPanelLayout(props, meetingTranslator("en")));

        expect(screen.getByTestId("meeting-workspace-shell").style.gridTemplateColumns).toBe(
            "minmax(220px, 280px) minmax(0, 1fr)"
        );
        expect(screen.getByTestId("meeting-workspace-shell").style.gap).toBe("16px");
        expect(screen.getByTestId("meeting-navigator")).toBeTruthy();
        expect(screen.getByTestId("meeting-workspace")).toBeTruthy();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("shows loading before an empty meeting list is confirmed", () => {
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props } = layoutProps();
        const rendered = render(
            renderMeetingPanelLayout(
                {
                    ...props,
                    meetings: [],
                    selectedId: undefined,
                    detail: undefined,
                    listLoading: true
                },
                meetingTranslator("en")
            )
        );

        expect(screen.getByText("Loading meetings.")).toBeTruthy();
        expect(screen.queryByText("No meetings.")).toBeNull();

        rendered.rerender(
            renderMeetingPanelLayout(
                {
                    ...props,
                    meetings: [],
                    selectedId: undefined,
                    detail: undefined,
                    listLoading: false
                },
                meetingTranslator("en")
            )
        );
        expect(screen.getByText("No meetings.")).toBeTruthy();
        expect(screen.queryByText("Loading meetings.")).toBeNull();
    });

    it("uses the same Meeting selection in a narrow drawer and restores opener focus", () => {
        const media = mediaFixture(true);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props, summary } = layoutProps();
        const rendered = render(renderMeetingPanelLayout(props, meetingTranslator("en")));

        const opener = screen.getByRole("button", { name: "Open meeting navigator" });
        fireEvent.click(opener);
        const drawer = screen.getByRole("dialog", { name: "Meeting navigator" });
        expect(drawer.getAttribute("aria-modal")).toBe("true");
        expect(drawer.style.position).toBe("fixed");
        fireEvent.click(screen.getByRole("button", { name: /核对议题 A/ }));
        expect(props.selectMeeting).toHaveBeenCalledWith(summary.meetingId);
        expect(screen.queryByRole("dialog")).toBeNull();

        fireEvent.click(opener);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(opener);
        rendered.unmount();
        expect(media.query.removeEventListener).toHaveBeenCalledOnce();
    });
});
