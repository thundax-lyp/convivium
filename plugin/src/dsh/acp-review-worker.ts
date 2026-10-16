import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-subagent";
import { SessionId } from "@deepseek-ai/dsh-session";
import { LlmError } from "@deepseek-ai/dsh-llm";
import type { SessionOwnership } from "@/repository/index.ts";
import type { CodexAcpProviderPort } from "./acp-codex/index.ts";
import { resolveMeetingCaller } from "./caller-resolver.ts";

export const runAcpReviewWorker = async (input: {
    ctx: Context;
    acpCodex: CodexAcpProviderPort;
    ownership: SessionOwnership;
    versionId: string;
    prompt: string;
    signal: AbortSignal;
}): Promise<{ workerSessionId: string; model: string; output: unknown }> => {
    const { ctx, acpCodex, ownership, signal } = input;
    signal.throwIfAborted();
    const parent = ctx.agents.get(SessionId(ownership.sessionId));
    const caller =
        parent &&
        (await resolveMeetingCaller(
            parent,
            {
                findBySessionId: async (id) =>
                    id === ownership.sessionId
                        ? { meetingId: ownership.meetingId, ownership }
                        : undefined
            },
            signal
        ));
    if (
        !parent ||
        !caller ||
        caller.role !== "evidence_reviewer" ||
        parent.session.header.parentSession !== undefined ||
        parent.options.provider !== "acp-codex" ||
        parent.options.model !== ownership.agentOptions.model ||
        parent.options.reasoningEffort !== ownership.agentOptions.reasoningEffort
    ) {
        throw new Error("REVIEW_OWNERSHIP_INVALID");
    }
    const checkBlock = () => {
        const block = acpCodex.blockFor(parent.id);
        if (block) {
            throw new LlmError("ACP review execution is blocked.", block.code);
        }
    };
    checkBlock();
    const run = await ctx.subagents.start("spawn", {
        label: `convivium:review:${input.versionId}`,
        parent,
        signal,
        toolFilter: { allow: [] },
        prompt: [
            {
                type: "text",
                text: `[Native review output]\n${input.prompt}\nReturn exactly one JSON object matching workerOutputSchema. No Markdown fences, prose, or tool calls. Use only your own native tools and Skills for analysis. The host validates and submits your result.`
            }
        ]
    });
    try {
        const child = run.localAgent;
        if (
            !child ||
            ctx.agents.get(child.id) !== child ||
            child.session.header.parentSession !== parent.id ||
            child.options.provider !== "acp-codex" ||
            child.options.model !== parent.options.model ||
            child.options.reasoningEffort !== parent.options.reasoningEffort ||
            typeof child.options.model !== "string"
        ) {
            throw new Error("REVIEW_WORKER_BINDING_INVALID");
        }
        const result = await run.result;
        signal.throwIfAborted();
        checkBlock();
        if (result.stopReason !== "completed") {
            throw new Error("REVIEW_WORKER_NOT_COMPLETED");
        }
        await acpCodex.checkpoint(child.id, signal);
        checkBlock();
        if (result.output.some((block) => block.type !== "text")) {
            throw new Error("REVIEW_WORKER_OUTPUT_INVALID");
        }
        const text = result.output
            .map((block) => (block.type === "text" ? block.text : ""))
            .join("");
        return { workerSessionId: child.id, model: child.options.model, output: JSON.parse(text) };
    } finally {
        await run.dispose();
    }
};
