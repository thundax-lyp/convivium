import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingPanelOverview } from "@/client/meeting-panel-overview.js";
import { MeetingViewSchema } from "@/protocol/meeting-view.js";
import { activeTimelineFixture } from "./meeting-timeline-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);

describe("Meeting Overview secondary sections", () => {
    it("shows seven groups in order with questions, risk, authored messages, evidence and IDs", () => {
        const base = activeTimelineFixture();
        const detail = MeetingViewSchema.parse({
            ...base,
            questions: [
                {
                    id: "question-1",
                    actorId: "manager-v1",
                    agendaId: "agenda-v1",
                    text: "authored question",
                    blocking: true,
                    status: "open",
                    affectedOutputIds: [],
                    affectedCriterionIds: [],
                    affectedConstraintIds: []
                }
            ],
            issues: [
                {
                    id: "issue-1",
                    actorId: "manager-v1",
                    agendaId: "agenda-v1",
                    description: "authored issue",
                    riskLevel: "high",
                    classification: "blocking",
                    affectedOutputIds: [],
                    affectedCriterionIds: [],
                    affectedConstraintIds: [],
                    requiresEvidenceReview: true,
                    blocking: true,
                    status: "open",
                    rationale: "issue rationale"
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
        const open = screen.getByRole("region", { name: "Open items" });
        for (const value of [
            "authored question",
            "authored issue",
            "issue rationale",
            "risk rationale"
        ])
            expect(open.textContent).toContain(value);
        expect(within(open).queryByRole("button")).toBeNull();
        const transcript = screen.getByRole("region", { name: "Transcript" });
        expect(transcript.textContent).toContain("message body");
        expect(transcript.textContent).toContain("publication-1");
        const evidence = screen.getByRole("region", { name: "Evidence" });
        for (const value of [
            "observation",
            "interpretation",
            "review scope",
            "review-1",
            "delivery-1"
        ])
            expect(evidence.textContent).toContain(value);
        const technical = screen.getByRole("region", { name: "Technical" });
        for (const value of ["meeting-v1", "task-1", "task title", "task result"])
            expect(technical.textContent).toContain(value);
        expect(screen.queryByText(/locate/i)).toBeNull();
    });

    it("renders empty secondary groups without placeholder facts", () => {
        const detail = activeTimelineFixture();
        const empty = MeetingViewSchema.parse({
            ...detail,
            questions: [],
            issues: [],
            publications: [],
            messages: [],
            evidencePackages: [],
            evidenceReviews: [],
            reviewDeliveries: [],
            tasks: [],
            outcomes: { ...detail.outcomes, riskDispositions: [] }
        });
        render(createElement(MeetingPanelOverview, { detail: empty, t: meetingTranslator("en") }));
        for (const name of ["Open items", "Transcript", "Evidence"])
            expect(screen.getByRole("region", { name }).textContent).toContain("None");
    });
});
