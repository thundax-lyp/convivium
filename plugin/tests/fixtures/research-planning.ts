import type { ResearchPlanning } from "@/research-planning/index.ts";
export const acceptedResearchPlanning = (question: string): ResearchPlanning => ({
    status: "accepted",
    skillSha256: "a".repeat(64),
    attempts: [
        {
            draft: "原始候选列表",
            review: "独立审查原文",
            parseError: null,
            reviewError: null,
            generatorModel: "deepseek-flash",
            reviewerModel: "deepseek-v4-pro"
        }
    ],
    plan: {
        originalQuestion: question,
        requirements: [{ id: "R1", text: "弄清机制" }],
        researchObjects: [
            {
                id: "O1",
                name: "领域机制",
                discussionGoal: "机制如何成立？",
                includes: ["方法与条件"],
                excludes: ["市场推广"],
                coversRequirementIds: ["R1"],
                dependencyInputs: [],
                boundaryWithOthers: "机制责任"
            }
        ],
        sharedRequirements: ["区分观察和推断"],
        unresolvedPremises: ["适用长度待确定"],
        nextStep: { objectIds: ["O1"], rationale: "比较候选机制" },
        coverageCheck: { uncoveredRequirementIds: [] }
    }
});
