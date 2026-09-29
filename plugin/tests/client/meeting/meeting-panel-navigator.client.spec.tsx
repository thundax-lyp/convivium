import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.ts";
import { translatedLayout } from "./meeting-panel-locale-fixtures.ts";

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

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
            for (const listener of listeners) {
                listener({ matches: value, media: query.media } as MediaQueryListEvent);
            }
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

        render(translatedLayout(props, "en"));

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

        render(translatedLayout(props, "en"));

        expect(
            screen
                .getByRole("separator", { name: "Resize meeting navigator" })
                .getAttribute("aria-valuenow")
        ).toBe("280");
        expect(screen.getByTestId("meeting-navigator")).toBeTruthy();
        expect(screen.getByTestId("meeting-workspace")).toBeTruthy();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("resizes the wide navigator by dragging and keyboard without squeezing the workspace", () => {
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props } = layoutProps();
        render(translatedLayout(props, "en"));
        const shell = screen.getByTestId("meeting-workspace-shell");
        vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({ width: 700 } as DOMRect);
        fireEvent.resize(window);

        const splitter = screen.getByRole("separator", { name: "Resize meeting navigator" });
        expect(splitter.getAttribute("aria-valuemax")).toBe("364");
        fireEvent.pointerDown(splitter, { button: 0, pointerId: 1, clientX: 100 });
        fireEvent.pointerMove(splitter, { pointerId: 1, clientX: 300 });
        expect(splitter.getAttribute("aria-valuenow")).toBe("364");
        fireEvent.pointerUp(splitter, { pointerId: 1 });
        fireEvent.pointerMove(splitter, { pointerId: 1, clientX: 100 });
        expect(splitter.getAttribute("aria-valuenow")).toBe("364");

        fireEvent.keyDown(splitter, { key: "Home" });
        expect(splitter.getAttribute("aria-valuenow")).toBe("220");
        fireEvent.keyDown(splitter, { key: "ArrowRight" });
        expect(splitter.getAttribute("aria-valuenow")).toBe("236");
        fireEvent.keyDown(splitter, { key: "End" });
        expect(splitter.getAttribute("aria-valuenow")).toBe("364");
    });

    it("uses a drawer when Host content narrows and restores the wide navigator", () => {
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props } = layoutProps();
        render(translatedLayout(props, "en"));
        const shell = screen.getByTestId("meeting-workspace-shell");
        let shellWidth = 500;
        vi.spyOn(shell, "getBoundingClientRect").mockImplementation(
            () => ({ width: shellWidth }) as DOMRect
        );
        fireEvent.resize(window);
        expect(screen.queryByRole("separator", { name: "Resize meeting navigator" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Open meeting navigator" }));
        expect(screen.getByRole("dialog", { name: "Meeting navigator" })).toBeTruthy();
        shellWidth = 700;
        fireEvent.resize(window);
        const splitter = screen.getByRole("separator", { name: "Resize meeting navigator" });
        expect(splitter.getAttribute("aria-valuenow")).toBe("280");
        expect(screen.queryByRole("dialog", { name: "Meeting navigator" })).toBeNull();
    });

    it("shows loading before an empty meeting list is confirmed", () => {
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props } = layoutProps();
        const rendered = render(
            translatedLayout(
                {
                    ...props,
                    meetings: [],
                    selectedId: undefined,
                    detail: undefined,
                    listLoading: true
                },
                "en"
            )
        );

        expect(screen.getByText("Loading meetings.")).toBeTruthy();
        expect(screen.queryByText("No meetings.")).toBeNull();

        rendered.rerender(
            translatedLayout(
                {
                    ...props,
                    meetings: [],
                    selectedId: undefined,
                    detail: undefined,
                    listLoading: false
                },
                "en"
            )
        );
        expect(screen.getByText("No meetings.")).toBeTruthy();
        expect(screen.getByTestId("meeting-navigator-empty")).toBeTruthy();
        expect(screen.queryByText("Loading meetings.")).toBeNull();
    });

    it("updates relative meeting time while the list remains open", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-29T00:00:00Z"));
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props, summary } = layoutProps();
        const recent = { ...summary, updatedAt: Date.now() };
        render(
            translatedLayout(
                { ...props, meetings: [recent], selectedId: undefined, detail: undefined },
                "en"
            )
        );

        const time = screen.getByRole("treeitem", { name: /核对议题 A/ }).querySelector("time");
        expect(time?.textContent).toBe("now");
        act(() => vi.advanceTimersByTime(60_000));
        expect(time?.textContent).toBe("1min");
    });

    it("sorts session tree items newest first and filters summaries without changing selection", () => {
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props, summary } = layoutProps();
        const older = { ...summary, meetingId: "older", objective: "Older topic", updatedAt: 1000 };
        const newer = {
            ...summary,
            meetingId: "newer",
            objective: "Newest topic",
            updatedAt: 3000
        };
        const middle = {
            ...summary,
            meetingId: "middle",
            objective: "Middle topic",
            updatedAt: 2000
        };
        const meetings = [older, newer, middle];

        render(translatedLayout({ ...props, meetings, selectedId: middle.meetingId }, "en"));

        const tree = screen.getByRole("tree", { name: "Sessions" });
        expect(tree.getAttribute("data-slot")).toBe("sessionTree");
        expect(
            screen.getByTestId("meeting-navigator").querySelector('[data-slot="listArea"]')
        ).toBeTruthy();
        expect(screen.getAllByRole("treeitem").map((item) => item.textContent)).toEqual([
            expect.stringContaining("Newest topic"),
            expect.stringContaining("Middle topic"),
            expect.stringContaining("Older topic")
        ]);
        expect(meetings.map((meeting) => meeting.meetingId)).toEqual(["older", "newer", "middle"]);
        expect(
            screen.getByRole("treeitem", { name: /Middle topic/ }).getAttribute("aria-selected")
        ).toBe("true");

        fireEvent.click(screen.getByRole("button", { name: "Search sessions" }));
        expect(
            screen.getByRole("button", { name: "Search sessions" }).getAttribute("aria-expanded")
        ).toBe("true");
        expect(document.activeElement).toBe(
            screen.getByRole("searchbox", { name: "Search sessions" })
        );
        fireEvent.click(screen.getByRole("button", { name: "Search sessions" }));
        expect(screen.getByRole("searchbox", { name: "Search sessions" })).toBeTruthy();
        fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
            target: { value: "newest" }
        });
        expect(screen.getAllByRole("treeitem")).toHaveLength(1);
        expect(screen.getByRole("treeitem", { name: /Newest topic/ })).toBeTruthy();
        expect(props.selectMeeting).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("treeitem", { name: /Newest topic/ }));
        expect(props.selectMeeting).toHaveBeenCalledWith("newer");

        fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
            target: { value: "missing" }
        });
        expect(screen.getByTestId("meeting-navigator-empty").textContent).toContain(
            "No matching sessions."
        );
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(screen.queryByRole("searchbox", { name: "Search sessions" })).toBeNull();
        expect(screen.getAllByRole("treeitem")).toHaveLength(3);
        fireEvent.click(screen.getByRole("button", { name: "Search sessions" }));
        fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search sessions" }), {
            key: "Escape"
        });
        expect(screen.queryByRole("searchbox", { name: "Search sessions" })).toBeNull();
        expect(screen.getAllByRole("treeitem")).toHaveLength(3);
        expect(document.activeElement).toBe(
            screen.getByRole("button", { name: "Search sessions" })
        );
    });

    it("shows a meeting information tooltip on title hover without selecting", () => {
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props, summary } = layoutProps();
        render(translatedLayout({ ...props, selectedId: undefined, detail: undefined }, "en"));

        const title = screen.getByText(summary.objective);
        fireEvent.mouseEnter(title);
        expect(screen.getByRole("tooltip").textContent).toBe(summary.objective);
        expect(screen.queryByRole("menu")).toBeNull();
        expect(props.selectMeeting).not.toHaveBeenCalled();
        fireEvent.mouseLeave(title);
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("opens the row action menu without selecting and reuses the existing navigation action", () => {
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props, summary } = layoutProps();
        render(translatedLayout({ ...props, selectedId: undefined, detail: undefined }, "en"));

        const row = screen.getByRole("treeitem", { name: /核对议题 A/ });
        fireEvent.click(
            within(row).getByRole("button", {
                name: "Actions for meeting 核对议题 A",
                hidden: true
            })
        );
        expect(props.selectMeeting).not.toHaveBeenCalled();
        const menu = screen.getByRole("menu");
        expect(within(menu).getByText("Running")).toBeTruthy();
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Open meeting" }));
        expect(props.selectMeeting).toHaveBeenCalledWith(summary.meetingId);
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("keeps tree rows keyboard navigable after adding an action button", () => {
        const media = mediaFixture(false);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props, summary } = layoutProps();
        const newer = { ...summary, meetingId: "newer", objective: "Newer topic", updatedAt: 2 };
        render(
            translatedLayout(
                { ...props, meetings: [summary, newer], selectedId: undefined, detail: undefined },
                "en"
            )
        );

        const rows = screen.getAllByRole("treeitem");
        rows[0]?.focus();
        fireEvent.keyDown(rows[0]!, { key: "ArrowDown" });
        expect(document.activeElement).toBe(rows[1]);
        fireEvent.keyDown(rows[1]!, { key: "Enter" });
        expect(props.selectMeeting).toHaveBeenCalledWith(summary.meetingId);
    });

    it("uses the same Meeting selection in a narrow drawer and restores opener focus", () => {
        const media = mediaFixture(true);
        vi.stubGlobal(
            "matchMedia",
            vi.fn(() => media.query)
        );
        const { props, summary } = layoutProps();
        const rendered = render(translatedLayout(props, "en"));

        expect(screen.queryByRole("separator")).toBeNull();
        const opener = screen.getByRole("button", { name: "Open meeting navigator" });
        fireEvent.click(opener);
        const drawer = screen.getByRole("dialog", { name: "Meeting navigator" });
        expect(drawer.getAttribute("aria-modal")).toBe("true");
        fireEvent.click(screen.getByRole("treeitem", { name: /核对议题 A/ }));
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
