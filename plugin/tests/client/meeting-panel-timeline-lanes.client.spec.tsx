import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingPanelTimeline } from "@/client/meeting-panel-timeline.js";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting-workspace-state.js";
import { activeTimelineFixture } from "./meeting-timeline-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);

function timeline(detail = activeTimelineFixture()) {
    return createElement(MeetingPanelTimeline, {
        detail,
        filters: INITIAL_TIMELINE_FILTERS,
        viewportRevision: 0,
        t: meetingTranslator("en"),
        onFiltersChange: vi.fn()
    });
}

describe("Meeting Timeline lanes", () => {
    it("keeps global time DOM order in a five-row horizontal grid", () => {
        render(timeline());
        const viewport = screen.getByLabelText("Timeline viewport");
        expect(viewport.style.overflowX).toBe("auto");
        const lanes = ["Captain", "Manager", "Contributor", "Reviewer", "System"];
        for (const lane of lanes) expect(screen.getAllByText(lane).length).toBeGreaterThan(0);
        const cards = screen.getAllByTestId("timeline-node");
        expect(cards.map((card) => card.getAttribute("data-node-key"))).toEqual([
            "lifecycle:meeting-v1:changed",
            "round:round-1:opened",
            "round:round-1:aborted",
            "hand_raise:round-1:contributor-v1:raised",
            "opportunity_request:request-1:requested",
            "evidence_version:version-1:submitted",
            "evidence_review:review-1:created",
            "review_delivery:delivery-1:sent",
            "publication:publication-1:published",
            "formal_message:message-1:created",
            "identity_recommendation:recommendation-1:created",
            "decision_candidate:candidate-1:created",
            "decision:decision-1:created",
            "completion_fact:completion-1:created",
            "risk_disposition:risk-1:created",
            "manager_plan:plan-1:created",
            "task:task-1:started",
            "task:task-1:completed",
            "termination:termination-1:ended"
        ]);
        expect(cards[0]?.style.gridColumn).toBe("2");
        expect(cards[0]?.style.gridRow).toBe("5");
        expect(cards[3]?.style.gridRow).toBe("3");
        expect(cards[6]?.textContent).toContain("Reviewer");
        expect(cards[6]?.textContent).toContain("reviewer-v1");
        expect(cards[6]?.textContent).toContain("Evidence review");
        expect(cards[6]?.textContent).toContain("Created");
        expect(cards[6]?.textContent).toContain("review scope");
        expect(cards[6]?.textContent).toContain("1970");
        expect(screen.getByText(/Timeline is a view/)).toBeTruthy();
    });
});
