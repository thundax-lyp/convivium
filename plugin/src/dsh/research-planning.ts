import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runPlanning } from "@/research-planning-execution/index.ts";
import { realpath } from "node:fs/promises";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    createAssistantMessage,
    createUserMessage,
    ReasoningEffortId,
    type RequestMessage
} from "@deepseek-ai/dsh-llm";
import { resolve } from "node:path";
import { ResearchPlanningSchema, type ResearchPlanning } from "@/research-planning/index.ts";

const diagnosticsSpec = defineDomain({
    name: "convivium_research_planning",
    version: 1,
    tables: {
        diagnostics: domainTable<string, { sessionId: string; name: string; content: string }>(
            z.strictObject({ sessionId: z.string(), name: z.string(), content: z.string() })
        )
    }
});

type GenerateInput = {
    model: string;
    messages: { role: "system" | "user" | "assistant"; content: string }[];
};
export const createResearchPlanner =
    (ctx: Context, packageRoot: string) =>
    async (input: {
        agent: Agent;
        question: string;
        signal: AbortSignal;
    }): Promise<ResearchPlanning> => {
        const { agent, question, signal } = input;
        const skill = await ctx.skills.get("research-planning", {
            scope: agent,
            cwd: agent.session.header.cwd,
            signal
        });
        if (!skill || skill.resourceBase?.kind !== "directory") {
            throw new Error("RESEARCH_SKILL_UNAVAILABLE");
        }
        // Use the same installed bundle as this meeting's scoped Skill loader.
        const base = skill.resourceBase.path;
        const expected = resolve(packageRoot, "config/skills/research-planning");
        if ((await realpath(base)) !== (await realpath(expected))) {
            throw new Error("RESEARCH_SKILL_BINDING_INVALID");
        }
        const generate = async ({ model, messages }: GenerateInput) => {
            signal.throwIfAborted();
            const callSignal = AbortSignal.any([signal, AbortSignal.timeout(240000)]);
            let text = "";
            let completed = false;
            let metadata: unknown = {};
            const system = messages
                .filter((m) => m.role === "system")
                .map((m) => m.content)
                .join("\n");
            const requestMessages: RequestMessage[] = messages
                .filter((m) => m.role !== "system")
                .map((m) =>
                    m.role === "assistant"
                        ? createAssistantMessage({
                              content: [{ type: "text", text: m.content }],
                              source: { provider: "deepseek-official", model }
                          })
                        : createUserMessage({
                              content: [{ type: "text", text: m.content }],
                              source: { kind: "convivium" }
                          })
                );
            for await (const chunk of ctx.llm.stream({
                provider: "deepseek-official",
                model,
                reasoningEffort: ReasoningEffortId("high"),
                system,
                messages: requestMessages,
                maxTokens: 20000,
                signal: callSignal
            })) {
                if (chunk.type === "text-delta") {
                    text += chunk.text;
                }
                if (chunk.type === "usage") {
                    metadata = chunk.usage;
                }
                if (chunk.type === "finish") {
                    completed = chunk.reason.kind === "stop";
                }
            }
            signal.throwIfAborted();
            return { text, completed, metadata };
        };
        const domain = await ctx.storageDomain.open(diagnosticsSpec);
        const runId = randomUUID();
        try {
            return ResearchPlanningSchema.parse(
                await runPlanning({
                    question,
                    skill: skill.content,
                    generate,
                    save: async (name, value) => {
                        signal.throwIfAborted();
                        await domain.table("diagnostics").put(`${runId}:${name}`, {
                            sessionId: agent.session.id,
                            name,
                            content: typeof value === "string" ? value : JSON.stringify(value)
                        });
                    }
                })
            );
        } finally {
            await domain.close();
        }
    };
