import type { MeetingState } from "@/domain/index.ts";
import { ResearchPlanningSchema, type ResearchPlanning } from "@/research-planning/index.ts";

// Called only with a Host-produced planning result, never a model command payload.
export const applyResearchPlanning = (
    state: MeetingState,
    input: ResearchPlanning
): MeetingState => {
    const result = ResearchPlanningSchema.parse(input);
    if (state.objective.researchPlanning?.status !== "pending" || result.status === "pending") {
        throw new Error("Research targets cannot be silently replaced");
    }
    if (
        result.status === "accepted" &&
        result.plan.originalQuestion !== state.objective.statement
    ) {
        throw new Error("Original question changed");
    }
    const requiredOutputs =
        result.status === "accepted"
            ? [
                  ...state.objective.requiredOutputs,
                  ...result.plan.researchObjects.map((o) => ({
                      id: `research-${o.id}`,
                      text: `${o.name}：${o.discussionGoal}`,
                      status: "pending" as const
                  }))
              ]
            : state.objective.requiredOutputs;
    return {
        ...state,
        objective: { ...state.objective, researchPlanning: result, requiredOutputs },
        agenda: state.agenda.map((a) =>
            a.status === "active"
                ? { ...a, requiredOutputIds: requiredOutputs.map((o) => o.id) }
                : a
        )
    };
};
