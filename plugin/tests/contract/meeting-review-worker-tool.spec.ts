import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    assertObjectJsonSchema,
    type ToolDefinition,
    type ToolRunContext,
    validateJsonSchemaValue
} from "@deepseek-ai/dsh-tools";
import { expect, it, vi } from "vitest";
import { registerMeetingTools } from "@/tools/index.ts";

const workerFixture = () => {
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
    const resolvePrompt = vi.fn(async () => ({
        prompt: "trusted immutable version and baseline",
        claimId: "claim-1",
        roundId: "round-1"
    }));
    const accepted = { kind: "accepted", receipt: { requestId: "evidence-review:claim-1" } };
    const execute = vi.fn(async () => accepted);
    registerMeetingTools({
        registry: {
            register: (definition) => {
                definitions.push(definition);
                return () => undefined;
            }
        },
        application: { execute } as never,
        reviewWorkers: { start },
        reviewPrompts: { resolve: resolvePrompt },
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
    const tool = definitions.find(({ name }) => name === "convivium_run_review_worker")!;
    const controller = new AbortController();
    const invoke = () =>
        tool.execute({ input: { meetingId: "meeting-1", versionId: "version-1" } }, {
            agent: { id: "reviewer-agent-1" } as Agent,
            signal: controller.signal
        } as ToolRunContext);
    return {
        definitions,
        dispose,
        structured,
        start,
        resolvePrompt,
        accepted,
        execute,
        invoke,
        controller
    };
};

it("validates and submits a worker result under the captured claim and reviewer authority", async () => {
    const { definitions, dispose, structured, start, resolvePrompt, accepted, execute, invoke } =
        workerFixture();

    const result = await invoke();

    expect(execute).toHaveBeenCalledWith(
        {
            protocolVersion: 1,
            meetingId: "meeting-1",
            requestId: "evidence-review:claim-1",
            action: {
                kind: "submit_evidence_review",
                roundId: "round-1",
                claimId: "claim-1",
                ...structured
            }
        },
        {
            caller: {
                channel: "dsh_tool",
                principalId: "reviewer-1",
                sessionBindingId: "ownership-1"
            }
        },
        expect.any(AbortSignal)
    );
    expect(execute).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(
        "spawn",
        expect.objectContaining({
            prompt: [{ type: "text", text: "trusted immutable version and baseline" }],
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
    expect(resolvePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ meetingId: "meeting-1", versionId: "version-1" })
    );
    expect(result).toEqual(accepted);
    expect(dispose).toHaveBeenCalledOnce();

    const invalidDispose = vi.fn(async () => undefined);
    start.mockResolvedValueOnce({
        id: "worker-2",
        localAgent: undefined,
        result: Promise.resolve({
            output: [],
            stopReason: "completed" as const,
            structured: {
                ...structured,
                scope: "   "
            }
        }),
        dispose: invalidDispose
    });

    await expect(
        definitions
            .find(({ name }) => name === "convivium_run_review_worker")!
            .execute(
                {
                    input: {
                        meetingId: "meeting-1",
                        versionId: "version-1"
                    }
                },
                {
                    agent: { id: "reviewer-agent-1" } as Agent,
                    signal: new AbortController().signal
                } as ToolRunContext
            )
    ).resolves.toEqual({ kind: "failed", code: "REVIEW_WORKER_OUTPUT_INVALID" });
    expect(invalidDispose).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();

    resolvePrompt.mockResolvedValueOnce(undefined);
    await expect(
        definitions
            .find(({ name }) => name === "convivium_run_review_worker")!
            .execute({ input: { meetingId: "meeting-1", versionId: "version-1" } }, {
                agent: { id: "reviewer-agent-1" } as Agent,
                signal: new AbortController().signal
            } as ToolRunContext)
    ).resolves.toMatchObject({ kind: "rejected", error: { code: "REVIEWER_CONFLICT" } });
    expect(start).toHaveBeenCalledTimes(2);
});

it.each([
    ["wrong version", { versionId: "another-version" }, "REVIEW_WORKER_VERSION_MISMATCH"],
    ["missing dimension", { dimensions: {} }, "REVIEW_WORKER_OUTPUT_INVALID"],
    ["unknown field", { claimId: "forged-claim" }, "REVIEW_WORKER_OUTPUT_INVALID"]
])("does not submit %s worker output", async (_label, override, code) => {
    const { start, structured, execute, invoke, dispose } = workerFixture();
    start.mockResolvedValueOnce({
        id: "worker-1",
        localAgent: undefined,
        result: Promise.resolve({
            output: [],
            stopReason: "completed",
            structured: { ...structured, ...override }
        }),
        dispose
    });
    await expect(invoke()).resolves.toEqual({ kind: "failed", code });
    expect(execute).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
});

it("propagates application rejection without claiming that the worker was submitted", async () => {
    const { execute, invoke, dispose } = workerFixture();
    const rejection = { kind: "rejected", error: { code: "REVIEWER_CONFLICT" } };
    execute.mockResolvedValueOnce(rejection as never);
    await expect(invoke()).resolves.toEqual(rejection);
    expect(execute).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
});

it.each(["failed", "cancelled"])("does not submit a %s worker", async (stopReason) => {
    const { start, structured, execute, invoke, dispose } = workerFixture();
    start.mockResolvedValueOnce({
        id: "worker-1",
        localAgent: undefined,
        dispose,
        result: Promise.resolve({ output: [], stopReason, structured })
    } as never);
    await expect(invoke()).resolves.toEqual({
        kind: "failed",
        code: "REVIEW_WORKER_NOT_COMPLETED"
    });
    expect(execute).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
});

it("does not submit a completed result after cancellation and still disposes the worker", async () => {
    const { start, structured, controller, execute, invoke, dispose } = workerFixture();
    start.mockImplementationOnce(async () => {
        controller.abort();
        return {
            id: "worker-1",
            localAgent: undefined,
            result: Promise.resolve({ output: [], stopReason: "completed", structured }),
            dispose
        };
    });
    await expect(invoke()).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
});
