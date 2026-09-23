import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingPanelOverview } from "@/client/meeting-panel-overview.js";
import { en, zh } from "@/client/locales.js";
import { MeetingPanelTimeline, findAdjacentTimelineKey } from "@/client/meeting-panel-timeline.js";
import { buildTimelineNodes } from "@/client/meeting-timeline-projection.js";
import {
    INITIAL_TIMELINE_FILTERS,
    type MeetingFocusTarget,
    type TimelineFilterState
} from "@/client/meeting-workspace-state.js";
import { activeTimelineFixture } from "./meeting-timeline-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);

const detail = activeTimelineFixture();
const t = meetingTranslator("en");

function Harness({
    initialFocus,
    initialMode = "overview"
}: {
    initialFocus?: MeetingFocusTarget;
    initialMode?: "overview" | "timeline";
}) {
    const [mode, setMode] = useState(initialMode);
    const [focusTarget, setFocusTarget] = useState(initialFocus);
    const [filters, setFilters] = useState<TimelineFilterState>(INITIAL_TIMELINE_FILTERS);
    return mode === "overview"
        ? createElement(MeetingPanelOverview, {
              detail,
              t,
              focusTarget,
              onFocusConsumed: () => setFocusTarget(undefined),
              onLocateInTimeline: (target) => {
                  setFocusTarget(target);
                  setMode("timeline");
              }
          })
        : createElement(MeetingPanelTimeline, {
              detail,
              filters,
              viewportRevision: 0,
              t,
              focusTarget,
              onFiltersChange: setFilters,
              onFocusConsumed: () => setFocusTarget(undefined),
              onLocateInOverview: (target) => {
                  setFocusTarget(target);
                  setMode("overview");
              }
          });
}

describe("Timeline keyboard and cross-mode focus", () => {
    it("keeps both locales complete for the closed UI enum sets", () => {
        expect(Object.keys(zh)).toEqual(Object.keys(en));
        const groups: Record<string, readonly string[]> = {
            agenda: ["pending", "active", "blocked", "completed", "deferred", "closed"],
            contribution: [
                "preparing",
                "registered",
                "under_review",
                "awaiting_response",
                "withdrawn",
                "submission_missing",
                "timed_out",
                "supplement_rejected",
                "aborted",
                "closed"
            ],
            recommendation: ["provisioning", "rejected", "active", "failed"],
            decisionOutcome: ["adopt", "reject", "defer"],
            decisionStatus: ["accepted", "superseded", "revoked"],
            completionStatus: ["active", "superseded", "revoked"],
            questionStatus: ["open", "answered", "withdrawn", "deferred"],
            issueStatus: ["open", "resolved", "deferred", "out_of_scope"],
            issueClassification: [
                "blocking",
                "follow_up",
                "pending_discussion",
                "accepted_risk",
                "out_of_scope"
            ],
            riskAction: ["accept", "reject"],
            reviewDelivery: ["sent", "failed"],
            task: ["open", "claimed", "completed", "cancelled", "expired"],
            authorization: ["active", "revoked", "expired"],
            timelineKind: [
                "lifecycle",
                "round",
                "opportunity_request",
                "hand_raise",
                "evidence_version",
                "evidence_review",
                "review_delivery",
                "publication",
                "formal_message",
                "identity_recommendation",
                "proposal_revision",
                "position",
                "decision_candidate",
                "decision",
                "completion_fact",
                "risk_disposition",
                "disposition_fact",
                "manager_plan",
                "task",
                "termination",
                "archive"
            ],
            timelinePhase: [
                "changed",
                "opened",
                "aborted",
                "requested",
                "raised",
                "submitted",
                "created",
                "sent",
                "failed",
                "published",
                "started",
                "completed",
                "ended",
                "resolve_question",
                "dispose_issue"
            ]
        };
        for (const [group, values] of Object.entries(groups))
            for (const value of values) {
                const key = `enum.${group}.${value}` as keyof typeof zh;
                expect(zh[key]).toBeTruthy();
                expect(en[key]).toBeTruthy();
            }
    });
    it("moves within lane and into adjacent visible lane by nearest time", () => {
        const nodes = buildTimelineNodes(detail);
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "round:round-1:opened",
                direction: "right",
                collapsedLanes: []
            })
        ).toBe("round:round-1:aborted");
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "round:round-1:opened",
                direction: "left",
                collapsedLanes: []
            })
        ).toBe("lifecycle:meeting-v1:changed");
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "hand_raise:round-1:contributor-v1:raised",
                direction: "up",
                collapsedLanes: []
            })
        ).toBe("formal_message:message-1:created");
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "hand_raise:round-1:contributor-v1:raised",
                direction: "up",
                collapsedLanes: ["manager"]
            })
        ).toBe("decision_candidate:candidate-1:created");
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "decision_candidate:candidate-1:created",
                direction: "up",
                collapsedLanes: []
            })
        ).toBeUndefined();
    });

    it("locates latest phase across modes, then returns to the overview object", () => {
        const scrollIntoView = vi.fn();
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollIntoView
        });
        render(createElement(Harness, {}));
        fireEvent.click(screen.getByRole("button", { name: "Timeline: Round round-1" }));
        const aborted = screen
            .getAllByTestId("timeline-node")
            .find((card) => card.getAttribute("data-node-key") === "round:round-1:aborted")!;
        expect(document.activeElement).toBe(aborted);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "center" });
        fireEvent.click(within(aborted).getByRole("button", { name: "Overview" }));
        expect(screen.getByRole("region", { name: "Progress" })).toBeTruthy();
        expect(document.activeElement?.getAttribute("aria-label")).toBe("Timeline: Round round-1");
    });
});
