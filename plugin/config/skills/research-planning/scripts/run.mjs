import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { runPlanning } from "../../../../lib/research-planning.js";

const main = async () => {
    const [questionFile, outputDirectory, envFile] = process.argv.slice(2);
    if (!questionFile || !outputDirectory) {
        throw new Error("Usage: node run.mjs question.txt NEW_OUTPUT_DIR [dev.env]");
    }
    const question = (await readFile(questionFile, "utf8")).trim();
    if (!question || question.includes("\n")) {
        throw new Error("Question must be one nonempty line");
    }
    const key = envFile
        ? parseEnv(await readFile(envFile, "utf8")).DEEPSEEK_API_KEY
        : process.env.DEEPSEEK_API_KEY;
    if (!key?.trim()) {
        throw new Error("DEEPSEEK_API_KEY missing");
    }
    await mkdir(outputDirectory, { recursive: false });
    const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
    const save = (name, value) =>
        writeFile(
            join(outputDirectory, name),
            typeof value === "string" ? value : JSON.stringify(value, null, 2)
        );
    await save("skill-input.md", skill);
    await save("input.json", {
        question,
        model: "deepseek-flash",
        reviewerModel: "deepseek-v4-pro",
        reasoningEffort: "high",
        maxRevisions: 2,
        skillSha256: createHash("sha256").update(skill).digest("hex")
    });
    const call = async (body) => {
        const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "deepseek-flash",
                thinking: { type: "enabled" },
                reasoning_effort: "high",
                max_tokens: 16000,
                ...body
            }),
            signal: AbortSignal.timeout(240000)
        });
        if (!response.ok) {
            throw new Error(`DeepSeek HTTP ${response.status}`);
        }
        return response.json();
    };
    const messages = [
        {
            role: "system",
            content:
                "你是研究对象规划生成者。先调用 skill 加载 research-planning，再严格输出其中规定的列表，不输出JSON或内部推理。只做规划，不检索、不调用会议工具。"
        },
        { role: "user", content: question }
    ];
    const loaded = await call({
        messages,
        tools: [
            {
                type: "function",
                function: {
                    name: "skill",
                    description: "加载研究规划技能",
                    parameters: {
                        type: "object",
                        properties: { name: { type: "string", enum: ["research-planning"] } },
                        required: ["name"],
                        additionalProperties: false
                    }
                }
            }
        ]
    });
    const message = loaded.choices[0].message;
    const tool = message.tool_calls?.[0];
    if (
        message.tool_calls?.length !== 1 ||
        tool.function.name !== "skill" ||
        JSON.parse(tool.function.arguments).name !== "research-planning"
    ) {
        throw new Error("Explicit Skill call missing");
    }
    await save("skill-call.json", { model: loaded.model, call: tool });
    messages.push(message, { role: "tool", tool_call_id: tool.id, content: skill });
    const outcome = await runPlanning({
        question,
        skill,
        save,
        generate: async ({ model, messages }) => {
            const response = await call({ model, messages });
            const choice = response.choices[0];
            return {
                text: choice.message.content ?? "",
                completed: choice.finish_reason === "stop",
                metadata: {
                    model: response.model,
                    usage: response.usage,
                    finishReason: choice.finish_reason
                }
            };
        }
    });
    await save("planning.json", outcome);
    if (outcome.status === "accepted") {
        await save("plan.json", outcome.plan);
    }
    const result = {
        status: outcome.status === "accepted" ? "accepted" : "not_accepted",
        attempt: outcome.attempts.length - 1,
        outputDirectory
    };
    await save("result.json", result);
    console.log(JSON.stringify(result));
    if (outcome.status !== "accepted") {
        process.exitCode = 2;
    }
};
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
