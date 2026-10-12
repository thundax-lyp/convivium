import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingPanelTimeline } from "@/client/meeting/regions/workspace/timeline/index.ts";
import { MeetingPanelOverview } from "@/client/meeting/regions/workspace/overview/index.ts";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting/shared/index.ts";
import { withMeetingTranslation } from "./meeting-panel-locale-fixtures.ts";
import { archiveTimelineFixture } from "./meeting-timeline-fixtures.ts";
import { eventTimelineFixture } from "./meeting-timeline-fixtures.ts";
import { MeetingViewSchema } from "@/protocol/meeting-view.ts";

afterEach(cleanup);

describe("Meeting timeline presentation", () => {
    it("labels identities without exposing IDs and retains filter bindings", () => {
        const detail = eventTimelineFixture();
        detail.identities = detail.identities.map((identity) => ({
            ...identity,
            displayName: identity.id === "manager-v1" ? "Research Manager" : "Research Contributor"
        }));
        const onFiltersChange = vi.fn();
        render(
            withMeetingTranslation(
                <MeetingPanelTimeline
                    detail={detail}
                    filters={INITIAL_TIMELINE_FILTERS}
                    viewportRevision={0}
                    onFiltersChange={onFiltersChange}
                />,
                "zh"
            )
        );
        const identities = screen.getByRole("group", { name: "身份" });
        expect(identities.textContent).toContain("Research Manager");
        expect(identities.textContent).not.toContain("manager-v1");
        fireEvent.click(
            within(identities).getByRole("button", { name: "主持人: Research Manager" })
        );
        expect(onFiltersChange).toHaveBeenCalledWith({
            ...INITIAL_TIMELINE_FILTERS,
            identityIds: ["manager-v1"]
        });
        const contentTypes = screen.getByRole("group", { name: "内容类型" });
        fireEvent.click(within(contentTypes).getByRole("button", { name: "证据", exact: true }));
        expect(onFiltersChange).toHaveBeenLastCalledWith({
            ...INITIAL_TIMELINE_FILTERS,
            objectKinds: ["evidence_version"]
        });
    });
    it("renders groups before filtering and keeps metadata stable while toggling details and event filters", () => {
        const { container } = render(
            withMeetingTranslation(
                <MeetingPanelTimeline
                    detail={eventTimelineFixture()}
                    filters={INITIAL_TIMELINE_FILTERS}
                    viewportRevision={0}
                    locale="zh"
                    onFiltersChange={() => undefined}
                />,
                "zh"
            )
        );
        const keys = () =>
            screen.getAllByTestId("timeline-node").map((node) => node.dataset.nodeKey);
        const round = () => container.querySelector('[data-group-key="milestone:round:round-1"]')!;
        const metadata = () => [
            round().getAttribute("data-group-status"),
            round().getAttribute("data-group-occurrence"),
            round().getAttribute("data-started-at"),
            round().getAttribute("data-completed-at")
        ];
        expect(keys()).toEqual(["event:1", "event:2", "event:3", "event:5", "event:6"]);
        expect(metadata()).toEqual(["completed", "1", "20", "23"]);
        expect(screen.getByText("immutable evidence summary")).toBeTruthy();
        expect(keys()).toContain("event:5");
        const opening = screen.getAllByTestId("timeline-node")[1]!;
        expect(opening.dataset.side).toBe("left");
        opening.focus();
        fireEvent.keyDown(opening, { key: "ArrowDown" });
        expect(document.activeElement?.getAttribute("data-node-key")).toBe("event:3");
        fireEvent.click(screen.getByRole("checkbox", { name: "显示过程细节" }));
        expect(keys()).toEqual(["event:1", "event:2", "event:3", "event:4", "event:5", "event:6"]);
        expect(metadata()).toEqual(["completed", "1", "20", "23"]);
        fireEvent.click(screen.getByRole("checkbox", { name: "显示过程细节" }));
        fireEvent.click(screen.getByRole("button", { name: "审核领取" }));
        expect(keys()).toEqual(["event:4"]);
        expect(container.querySelector('[data-group-key="milestone:meeting-start:1"]')).toBeNull();
        expect(metadata()).toEqual(["completed", "1", "20", "23"]);
        fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
        expect(keys()).toEqual(["event:1", "event:2", "event:3", "event:5", "event:6"]);
    });

    it("focuses the latest visible event key for an object without falling back to DTO keys", () => {
        const consumed = vi.fn();
        render(
            withMeetingTranslation(
                <MeetingPanelTimeline
                    detail={eventTimelineFixture()}
                    filters={INITIAL_TIMELINE_FILTERS}
                    viewportRevision={0}
                    onFiltersChange={() => undefined}
                    focusTarget={{
                        meetingId: "meeting-v1",
                        objectKind: "evidence_version",
                        objectId: "version-1"
                    }}
                    onFocusConsumed={consumed}
                />,
                "zh"
            )
        );
        expect(document.activeElement?.getAttribute("data-node-key")).toBe("event:3");
        expect(consumed).toHaveBeenCalledOnce();
    });
    it("alternates event cards, keeps round openings on the left and hides coordination details by default", () => {
        const detail = eventTimelineFixture();
        detail.rounds.push({
            ...detail.rounds[0]!,
            id: "round-2",
            openedAt: 28,
            abortedAt: undefined,
            status: "open",
            pendingHandRaises: []
        });
        detail.timelineEvents = [
            detail.timelineEvents![0]!,
            detail.timelineEvents![1]!,
            {
                ...detail.timelineEvents![1]!,
                eventSeq: 3,
                kind: "round.aborted",
                occurredAt: 21,
                data: { reason: "abort reason" }
            },
            { ...detail.timelineEvents![2]!, eventSeq: 4, occurredAt: 24 },
            {
                ...detail.timelineEvents![2]!,
                eventSeq: 5,
                kind: "evidence_review.submitted",
                occurredAt: 25,
                actor: { kind: "identity", actorId: "reviewer-v1" },
                subject: { kind: "evidence_review", id: "review-1" },
                data: { claimId: "claim-1", scope: "review scope" }
            },
            {
                ...detail.timelineEvents![1]!,
                eventSeq: 6,
                occurredAt: 28,
                subject: { kind: "round", id: "round-2" }
            },
            {
                ...detail.timelineEvents![2]!,
                eventSeq: 7,
                kind: "hand_raise.recorded",
                occurredAt: 29,
                subject: { kind: "round", id: "round-1" },
                data: { contributorId: "contributor-v1", purpose: "raise purpose" }
            }
        ];
        detail.timelineEvents = MeetingViewSchema.parse(detail).timelineEvents;
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
        expect(cards.find((node) => node.dataset.nodeKey === "event:3")?.dataset.emphasis).toBe(
            "warning"
        );
        const round = cards.find((node) => node.dataset.nodeKey === "event:2")!;
        expect(round.dataset.side).toBe("left");
        expect(round.dataset.emphasis).toBe("milestone");
        expect(cards.find((node) => node.dataset.nodeKey === "event:6")?.dataset.side).toBe("left");
        fireEvent.keyDown(round, { key: "ArrowDown" });
        expect(document.activeElement?.getAttribute("data-node-key")).toBe("event:3");
        expect(cards.find((node) => node.dataset.nodeKey === "event:4")?.dataset.side).toBe("left");
        expect(cards.find((node) => node.dataset.nodeKey === "event:5")?.dataset.side).toBe(
            "right"
        );
        expect(cards.some((node) => node.dataset.nodeKey === "event:7")).toBe(false);
        fireEvent.click(screen.getByRole("checkbox", { name: "显示过程细节" }));
        expect(
            screen
                .getAllByTestId("timeline-node")
                .some((node) => node.dataset.nodeKey === "event:7")
        ).toBe(true);
    });

    it.each(["partial", "cancelled"] as const)(
        "emphasizes %s termination and completed archive",
        (outcome) => {
            const detail = archiveTimelineFixture();
            detail.archive!.termination!.outcome = outcome;
            detail.timelineEvents = [
                {
                    eventSeq: 1,
                    meetingVersion: 1,
                    occurredAt: 37,
                    kind: "meeting.ended",
                    actor: { kind: "system" },
                    subject: { kind: "termination", id: "termination-1" },
                    relatedObjects: [],
                    data: { outcome, reason: "termination reason" }
                },
                {
                    eventSeq: 2,
                    meetingVersion: 2,
                    occurredAt: 38,
                    kind: "archive.completed",
                    actor: { kind: "system" },
                    subject: { kind: "archive", id: "archive-1" },
                    relatedObjects: [],
                    data: { status: "complete" }
                }
            ];
            detail.timelineEvents = MeetingViewSchema.parse(detail).timelineEvents;
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
                .filter((node) => ["event:1", "event:2"].includes(node.dataset.nodeKey ?? ""));
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
                    detail={eventTimelineFixture([
                        {
                            eventSeq: 1,
                            meetingVersion: 1,
                            occurredAt: 31,
                            kind: "decision.recorded",
                            actor: { kind: "system" },
                            subject: { kind: "decision", id: "decision-1" },
                            relatedObjects: [],
                            data: { status: "accepted" }
                        }
                    ])}
                    filters={INITIAL_TIMELINE_FILTERS}
                    viewportRevision={0}
                    locale="zh"
                    onFiltersChange={() => undefined}
                />,
                "zh"
            )
        );

        const decision = screen
            .getAllByTestId("timeline-node")
            .find((node) => node.dataset.nodeKey === "event:1");
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
        expect(document.activeElement?.getAttribute("data-overview-key")).toBe(
            "decision:decision-1"
        );
        expect(document.activeElement?.textContent).not.toContain("decision-1");
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
