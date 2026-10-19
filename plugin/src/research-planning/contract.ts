import { z } from "zod";

const text = z.string().trim().min(1);
const ids = z.array(text).min(1);
export const ResearchPlanSchema = z.strictObject({
    originalQuestion: text,
    requirements: z.array(z.strictObject({ id: text, text })).min(1),
    researchObjects: z
        .array(
            z.strictObject({
                id: text,
                name: text,
                discussionGoal: text,
                includes: z.array(text).min(1),
                excludes: z.array(text),
                coversRequirementIds: ids,
                dependencyInputs: z.array(z.strictObject({ objectId: text, requiredResult: text })),
                boundaryWithOthers: text
            })
        )
        .min(1),
    sharedRequirements: z.array(text),
    unresolvedPremises: z.array(text),
    nextStep: z.strictObject({ objectIds: ids, rationale: text }),
    coverageCheck: z.strictObject({ uncoveredRequirementIds: z.array(text).max(0) })
});
const attempt = z.strictObject({
    draft: z.string(),
    review: z.string(),
    parseError: z.string().nullable(),
    reviewError: z.string().nullable(),
    generatorModel: text,
    reviewerModel: text
});
const evidence = {
    skillSha256: z.string().regex(/^[a-f0-9]{64}$/),
    attempts: z.array(attempt).max(3)
};
export const ResearchPlanningSchema = z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("pending") }),
    z.strictObject({ status: z.literal("failed"), ...evidence, reason: text }),
    z.strictObject({
        status: z.literal("accepted"),
        ...evidence,
        attempts: z.array(attempt).min(1).max(3),
        plan: ResearchPlanSchema
    })
]);
export type ResearchPlanning = z.infer<typeof ResearchPlanningSchema>;
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;
