import { encodeMeetingState, decodeMeetingState } from "@/repository/index.ts";
import { expect, it } from "vitest";
import { applyResearchPlanning } from "@/domain/index.ts";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { acceptedResearchPlanning } from "../../fixtures/research-planning.ts";

it("persists validated research objects as pending targets without changing the user's question", () => {
    const state = makeRunningMeetingStateV1();
    state.objective.researchPlanning = { status: "pending" };
    state.objective.requiredOutputs = [];
    state.agenda.find((agenda) => agenda.status === "active")!.requiredOutputIds = [];
    const result = acceptedResearchPlanning(state.objective.statement);
    const after = applyResearchPlanning(state, result);
    expect(after.objective.researchPlanning).toEqual(result);
    expect(decodeMeetingState(encodeMeetingState(after)).objective.researchPlanning).toEqual(
        result
    );
    expect(after.objective.statement).toBe(state.objective.statement);
    expect(after.objective.requiredOutputs).toEqual([
        { id: "research-O1", text: "领域机制：机制如何成立？", status: "pending" }
    ]);
    expect(after.agenda.find((a) => a.status === "active")?.requiredOutputIds).toEqual([
        "research-O1"
    ]);
    expect(() => applyResearchPlanning(after, result)).toThrow(/cannot be silently replaced/);
    expect(() => applyResearchPlanning(state, acceptedResearchPlanning("另一问题"))).toThrow(
        /Original question changed/
    );
});

it("preserves the active Agenda scope when appending research targets", () => {
    const state = makeRunningMeetingStateV1();
    state.objective.researchPlanning = { status: "pending" };
    state.objective.requiredOutputs = [
        { id: "active-output", text: "当前议题产出", status: "pending" },
        { id: "other-output", text: "其它议题产出", status: "pending" }
    ];
    const activeAgenda = state.agenda.find((agenda) => agenda.status === "active")!;
    activeAgenda.requiredOutputIds = ["active-output"];

    const after = applyResearchPlanning(state, acceptedResearchPlanning(state.objective.statement));

    expect(after.agenda.find((agenda) => agenda.status === "active")?.requiredOutputIds).toEqual([
        "active-output",
        "research-O1"
    ]);
});

it("rejects a research target ID that conflicts with an existing required output", () => {
    const state = makeRunningMeetingStateV1();
    state.objective.researchPlanning = { status: "pending" };
    state.objective.requiredOutputs = [
        { id: "research-O1", text: "调用方已有产出", status: "pending" }
    ];

    expect(() =>
        applyResearchPlanning(state, acceptedResearchPlanning(state.objective.statement))
    ).toThrow(/Research target ID conflicts with an existing required output: research-O1/);
});
