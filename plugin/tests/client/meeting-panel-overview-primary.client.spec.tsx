import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingPanelOverview } from "@/client/meeting-panel-overview.js";
import { MeetingViewSchema } from "@/protocol/meeting-view.js";
import { activeTimelineFixture } from "./meeting-timeline-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);

describe("Meeting Overview primary sections", () => {
    it("renders objective, progress, outcomes in order from caller-visible DTO", () => {
        const base = activeTimelineFixture();
        const detail = MeetingViewSchema.parse({
            ...base,
            objective: {
                ...base.objective,
                requiredOutputs: [{ id: "output-1", text: "required output", status: "pending" }],
                acceptanceCriteria: [
                    { id: "criterion-1", text: "acceptance criterion", status: "satisfied" }
                ],
                hardConstraints: [
                    { id: "constraint-1", text: "hard constraint", status: "violated" }
                ]
            },
            rounds: [
                {
                    ...base.rounds[0],
                    contributions: [
                        {
                            id: "contribution-1",
                            contributorId: "contributor-v1",
                            status: "under_review",
                            substantiveSupplementCount: 0
                        }
                    ]
                }
            ]
        });
        render(createElement(MeetingPanelOverview, { detail, t: meetingTranslator("en") }));
        expect(
            screen.getAllByRole("region").map((element) => element.getAttribute("aria-label"))
        ).toEqual([
            "Objective",
            "Progress",
            "Outcomes",
            "Open items",
            "Transcript",
            "Evidence",
            "Technical"
        ]);
        const objective = screen.getByRole("region", { name: "Objective" });
        expect(objective.textContent).toContain(detail.objective.statement);
        expect(objective.textContent).toContain("required output");
        expect(objective.textContent).toContain("acceptance criterion");
        expect(objective.textContent).toContain("hard constraint");
        expect(objective.textContent).toContain("Running");
        expect(objective.textContent).toContain(String(detail.version));
        const progress = screen.getByRole("region", { name: "Progress" });
        for (const value of [
            "round question",
            "Under review",
            "request purpose",
            "open_round",
            "recommendation rationale",
            "task title"
        ])
            expect(progress.textContent).toContain(value);
        expect(within(progress).queryByRole("button")).toBeNull();
        const outcomes = screen.getByRole("region", { name: "Outcomes" });
        for (const value of ["candidate rationale", "decision-1", "completion statement"])
            expect(outcomes.textContent).toContain(value);
        expect(within(outcomes).queryByRole("button")).toBeNull();
        expect(screen.queryByText(/locate/i)).toBeNull();
    });
});
