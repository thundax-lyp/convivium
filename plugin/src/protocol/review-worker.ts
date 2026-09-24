import type { ObjectJsonSchema } from "@deepseek-ai/dsh-tools";

const reviewDimensionOutputSchema: ObjectJsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["score", "scope", "reason", "baselineEvidenceIds"],
    properties: {
        score: {
            oneOf: [
                { type: "integer", enum: [0, 1, 2, 3] },
                { type: "string", enum: ["unable_to_assess"] }
            ]
        },
        scope: { type: "string" },
        reason: { type: "string" },
        baselineEvidenceIds: { type: "array", items: { type: "string" } }
    }
};

export const ReviewWorkerOutputSchema: ObjectJsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["versionId", "scope", "dimensions"],
    properties: {
        versionId: { type: "string" },
        scope: { type: "string" },
        dimensions: {
            type: "object",
            additionalProperties: false,
            required: ["source", "credibility", "completeness", "support"],
            properties: {
                source: reviewDimensionOutputSchema,
                credibility: reviewDimensionOutputSchema,
                completeness: reviewDimensionOutputSchema,
                support: reviewDimensionOutputSchema
            }
        }
    }
};
