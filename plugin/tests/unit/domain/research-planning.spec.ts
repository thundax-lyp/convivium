import { encodeMeetingState, decodeMeetingState } from "@/repository/index.ts";
import { expect, it } from "vitest";
import { applyResearchPlanning } from "@/domain/index.ts";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { acceptedResearchPlanning } from "../../fixtures/research-planning.ts";

it("persists validated research objects as pending targets without changing the user's question", () => {
    const state = makeRunningMeetingStateV1();
    state.objective.researchPlanning = { status: "pending" };
    state.objective.requiredOutputs = [];
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
