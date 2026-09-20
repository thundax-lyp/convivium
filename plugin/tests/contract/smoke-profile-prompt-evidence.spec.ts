import { describe, expect, it } from "vitest";
import { collectAgentPromptEvidence } from "../../scripts/smoke-profile/probe/support.js";
import { MEETING_BUSINESS_LOOP_TOPIC } from "../../scripts/smoke-profile/probe/scenarios/meeting-business-loop.js";

describe("Meeting business-loop smoke prompt evidence", () => {
    it("uses the agreed vLLM KV Cache quantization research topic", () => {
        expect(MEETING_BUSINESS_LOOP_TOPIC).toEqual({
            objective:
                "评估在 vLLM 推理链路中引入 FP8／INT8 KV Cache 量化，是否能在不显著损害长上下文生成质量的前提下，降低显存占用并提高可服务并发；应优先采用哪种量化粒度与校准策略。",
            title: "vLLM KV Cache 量化的收益与实现路径",
            question:
                "在 vLLM 的推理链路中，引入 KV Cache 量化（FP8／INT8）是否能在不显著损害长上下文生成质量的前提下，降低显存占用并提高可服务并发？应优先采用哪种量化粒度与校准策略？"
        });
    });

    it("records every observed text prompt by Agent session", () => {
        const agent = { id: "agent-1" };
        const evidence = collectAgentPromptEvidence(
            new Map([["agent-1", agent]]),
            new Map([
                [
                    "agent-1",
                    [
                        {
                            content: [
                                { type: "text", text: "first prompt" },
                                { type: "image", url: "ignored" }
                            ],
                            source: { kind: "runtime" }
                        },
                        { content: "second prompt" }
                    ]
                ]
            ])
        );

        expect(evidence).toEqual([
            {
                sessionId: "agent-1",
                prompts: [
                    { index: 0, texts: ["first prompt"], source: { kind: "runtime" } },
                    { index: 1, texts: ["second prompt"], source: null }
                ]
            }
        ]);
    });
});
