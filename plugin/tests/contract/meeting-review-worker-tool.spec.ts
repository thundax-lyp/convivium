import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    assertObjectJsonSchema,
    type ToolDefinition,
    type ToolRunContext,
    validateJsonSchemaValue
} from "@deepseek-ai/dsh-tools";
import { expect, it, vi } from "vitest";
import { registerMeetingTools } from "@/tools/index.js";

it("runs reviewer workers with a machine-enforced schema that permits an empty baseline", async () => {
    const definitions: ToolDefinition[] = [];
    const dispose = vi.fn(async () => undefined);
    const structured = {
        versionId: "version-1",
        scope: "first round",
        dimensions: Object.fromEntries(
            ["source", "credibility", "completeness", "support"].map((key) => [
                key,
                { score: 2, scope: key, reason: "verified", baselineEvidenceIds: [] }
            ])
        )
    };
    const start = vi.fn(async (_provider, request) => {
        assertObjectJsonSchema(request.outputSchema);
        expect(validateJsonSchemaValue(request.outputSchema, structured)).toEqual([]);
        return {
            id: "worker-1",
            localAgent: undefined,
            result: Promise.resolve({ output: [], stopReason: "completed" as const, structured }),
            dispose
        };
    });
    registerMeetingTools({
        registry: {
            register: (definition) => {
                definitions.push(definition);
                return () => undefined;
            }
        },
        application: { execute: vi.fn() },
        reviewWorkers: { start },
        reader: { read: vi.fn() },
        callers: {
            resolve: vi.fn(async () => ({
                caller: {
                    channel: "dsh_tool" as const,
                    principalId: "reviewer-1",
                    sessionBindingId: "ownership-1"
                },
                meetingId: "meeting-1",
                identityId: "reviewer-1",
                role: "evidence_reviewer" as const,
                ownership: {
                    id: "ownership-1",
                    meetingId: "meeting-1",
                    identityId: "reviewer-1",
                    sessionId: "reviewer-agent-1",
                    parentSessionId: "captain-1",
                    sessionLabel: "reviewer",
                    provider: "continuable",
                    role: "evidence_reviewer" as const,
                    lifecycleStatus: "active" as const,
                    capabilityStatus: "active" as const,
                    createdAt: 1,
                    updatedAt: 1
                }
            }))
        }
    });

    const result = await definitions
        .find(({ name }) => name === "convivium_run_review_worker")!
        .execute(
            {
                input: {
                    meetingId: "meeting-1",
                    versionId: "version-1",
                    prompt: "Review this immutable version."
                }
            },
            {
                agent: { id: "reviewer-agent-1" } as Agent,
                signal: new AbortController().signal
            } as ToolRunContext
        );

    expect(start).toHaveBeenCalledWith(
        "spawn",
        expect.objectContaining({
            parent: expect.objectContaining({ id: "reviewer-agent-1" }),
            outputSchema: expect.objectContaining({
                required: ["versionId", "scope", "dimensions"],
                properties: expect.objectContaining({
                    dimensions: expect.objectContaining({
                        properties: expect.objectContaining({
                            source: expect.objectContaining({
                                properties: expect.objectContaining({
                                    baselineEvidenceIds: {
                                        type: "array",
                                        items: { type: "string" }
                                    }
                                })
                            })
                        })
                    })
                })
            }),
            toolFilter: { allow: [] }
        })
    );
    expect(result).toMatchObject({
        kind: "completed",
        review: {
            versionId: "version-1",
            dimensions: { source: { baselineEvidenceIds: [] } }
        }
    });
    expect(dispose).toHaveBeenCalledOnce();
});
