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
    const researchOutputs =
        result.status === "accepted"
            ? result.plan.researchObjects.map((object) => ({
                  id: `research-${object.id}`,
                  text: `${object.name}：${object.discussionGoal}`,
                  status: "pending" as const
              }))
            : [];
    const existingOutputIds = new Set(state.objective.requiredOutputs.map((output) => output.id));
    const conflictingOutput = researchOutputs.find((output) => existingOutputIds.has(output.id));
    if (conflictingOutput) {
        throw new Error(
            `Research target ID conflicts with an existing required output: ${conflictingOutput.id}`
        );
    }
    const requiredOutputs = [...state.objective.requiredOutputs, ...researchOutputs];
    const researchOutputIds = researchOutputs.map((output) => output.id);
    return {
        ...state,
        objective: { ...state.objective, researchPlanning: result, requiredOutputs },
        agenda: state.agenda.map((a) =>
            a.status === "active"
                ? { ...a, requiredOutputIds: [...a.requiredOutputIds, ...researchOutputIds] }
                : a
        )
    };
};
