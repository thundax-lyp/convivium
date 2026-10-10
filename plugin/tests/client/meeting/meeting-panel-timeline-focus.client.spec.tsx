import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingPanelTimeline } from "@/client/meeting/regions/workspace/timeline/index.ts";
import { MeetingPanelOverview } from "@/client/meeting/regions/workspace/overview/index.ts";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting/shared/index.ts";
import { withMeetingTranslation } from "./meeting-panel-locale-fixtures.ts";
import { activeTimelineFixture, archiveTimelineFixture } from "./meeting-timeline-fixtures.ts";

afterEach(cleanup);

describe("Meeting timeline presentation", () => {
    it("alternates event cards, keeps round openings on the left and hides coordination details by default", () => {
        const detail = activeTimelineFixture();
        detail.rounds.push({
            ...detail.rounds[0]!,
            id: "round-2",
            openedAt: 28,
            abortedAt: undefined,
            status: "open",
            pendingHandRaises: []
        });
        render(
            withMeetingTranslation(
                <MeetingPanelTimeline
                    detail={detail}
                    filters={INITIAL_TIMELINE_FILTERS}
                    viewportRevision={0}
                    locale="zh"
                    onFiltersChange={() => undefined}
                />,
                "zh"
            )
        );
        const cards = screen.getAllByTestId("timeline-node");
        expect(
            cards.find((node) => node.dataset.nodeKey === "round:round-1:aborted")?.dataset.emphasis
        ).toBe("warning");
        const round = cards.find((node) => node.dataset.nodeKey === "round:round-1:opened")!;
        expect(round.dataset.side).toBe("left");
        expect(round.dataset.emphasis).toBe("milestone");
        expect(
            cards.find((node) => node.dataset.nodeKey === "round:round-2:opened")?.dataset.side
        ).toBe("left");
        fireEvent.keyDown(round, { key: "ArrowDown" });
        expect(document.activeElement?.getAttribute("data-node-key")).toBe("round:round-1:aborted");
        expect(
            cards.find((node) => node.dataset.nodeKey === "evidence_version:version-1:submitted")
                ?.dataset.side
        ).toBe("left");
        expect(
            cards.find((node) => node.dataset.nodeKey === "evidence_review:review-1:created")
                ?.dataset.side
        ).toBe("right");
        expect(cards.some((node) => node.dataset.nodeKey?.startsWith("hand_raise:"))).toBe(false);
        fireEvent.click(screen.getByRole("checkbox", { name: "显示过程细节" }));
        expect(
            screen
                .getAllByTestId("timeline-node")
                .some((node) => node.dataset.nodeKey?.startsWith("hand_raise:"))
        ).toBe(true);
    });

    it.each(["partial", "cancelled"] as const)(
        "emphasizes %s termination and completed archive",
        (outcome) => {
            const detail = archiveTimelineFixture();
            detail.archive!.termination!.outcome = outcome;
            render(
                withMeetingTranslation(
                    <MeetingPanelTimeline
                        detail={detail}
                        filters={INITIAL_TIMELINE_FILTERS}
                        viewportRevision={0}
                        onFiltersChange={() => undefined}
                    />,
                    "zh"
                )
            );
            const milestones = screen
                .getAllByTestId("timeline-node")
                .filter((node) => /^(termination|archive):/.test(node.dataset.nodeKey ?? ""));
            expect(milestones).toHaveLength(2);
            for (const node of milestones) {
                expect(node.dataset.emphasis).toBe("milestone");
            }
        }
    );

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
    it("focuses the objective section for a lifecycle location", () => {
        const detail = archiveTimelineFixture("complete");
        const onFocusConsumed = vi.fn();
        render(
            withMeetingTranslation(
                <MeetingPanelOverview
                    detail={detail}
                    focusTarget={{
                        meetingId: detail.meetingId,
                        objectKind: "lifecycle",
                        objectId: detail.meetingId
                    }}
                    onFocusConsumed={onFocusConsumed}
                />,
                "en"
            )
        );

        expect(document.activeElement).toBe(screen.getByRole("region", { name: "Objective" }));
        expect(onFocusConsumed).toHaveBeenCalledOnce();
    });

    it("focuses a displayed decision and reports an undisplayed position as unavailable", () => {
        const detail = archiveTimelineFixture("complete");
        const onFocusConsumed = vi.fn();
        const props = {
            detail,
            onFocusConsumed
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
        expect(screen.queryByRole("navigation", { name: "Timeline" })).toBeNull();

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
