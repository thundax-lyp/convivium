import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { OverviewObjective } from "@/client/meeting/regions/workspace/overview/objective/index.ts";
import { withMeetingTranslation } from "./meeting-panel-locale-fixtures.ts";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.ts";
import { acceptedResearchPlanning } from "../../fixtures/research-planning.ts";

afterEach(cleanup);
it("shows persisted research objects alongside caller-provided target rows", () => {
    const { view } = meetingProjectionFixture();
    view.objective.researchPlanning = acceptedResearchPlanning(view.objective.statement);
    view.objective.requiredOutputs.push({
        id: "research-O1",
        text: "领域机制：机制如何成立？",
        status: "pending"
    });
    render(withMeetingTranslation(<OverviewObjective detail={view} />, "zh"));
    expect(screen.getByText("O1 · 领域机制")).toBeTruthy();
    const title = screen.getByText("O1 · 领域机制").closest("summary");
    const disclosure = title?.closest("details");
    expect(title).not.toBeNull();
    expect(disclosure?.open).toBe(false);
    fireEvent.click(title!);
    expect(disclosure?.open).toBe(true);
    expect(screen.getByText("机制如何成立？")).toBeTruthy();
    expect(screen.getByText(/责任边界：.*机制责任/)).toBeTruthy();
    expect(screen.getByText(/未决前提：/)).toBeTruthy();
    expect(screen.getByText(view.objective.requiredOutputs[0]!.text)).toBeTruthy();
    expect(screen.queryByText("领域机制：机制如何成立？")).toBeNull();
    fireEvent.click(title!);
    expect(disclosure?.open).toBe(false);
});
it("keeps unvalidated research pending while showing caller-provided targets", () => {
    const { view } = meetingProjectionFixture();
    view.objective.researchPlanning = { status: "pending" };
    render(withMeetingTranslation(<OverviewObjective detail={view} />, "zh"));
    expect(screen.getByRole("status").textContent).toContain("尚未通过校验");
    expect(screen.getByText(view.objective.requiredOutputs[0]!.text)).toBeTruthy();
});
it("shows failed candidates for inspection without presenting them as accepted targets", () => {
    const { view } = meetingProjectionFixture();
    const candidate = acceptedResearchPlanning(view.objective.statement);
    if (candidate.status !== "accepted") {
        throw new Error("fixture");
    }
    view.objective.researchPlanning = {
        status: "failed",
        skillSha256: candidate.skillSha256,
        attempts: candidate.attempts,
        reason: "对象边界未通过"
    };
    render(withMeetingTranslation(<OverviewObjective detail={view} />, "zh"));
    expect(screen.getByRole("status").textContent).toContain("未通过");
    expect(screen.getByText(candidate.attempts[0]!.draft)).toBeTruthy();
    expect(screen.queryByText("O1 · 领域机制")).toBeNull();
    expect(screen.getByText(view.objective.requiredOutputs[0]!.text)).toBeTruthy();
});
