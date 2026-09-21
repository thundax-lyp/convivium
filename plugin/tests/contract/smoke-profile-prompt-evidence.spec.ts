import { describe, expect, it } from "vitest";
import { collectAgentPromptEvidence } from "../../scripts/smoke-profile/probe/support.js";
import {
    MEETING_BUSINESS_LOOP_LIMITS,
    MEETING_BUSINESS_LOOP_TOPIC,
    MEETING_BUSINESS_LOOP_ROUNDS
} from "../../scripts/smoke-profile/probe/scenarios/meeting-business-loop.js";

describe("Meeting business-loop smoke prompt evidence", () => {
    it("uses the agreed vLLM KV Cache quantization research topic", () => {
        expect(MEETING_BUSINESS_LOOP_TOPIC).toEqual({
            objective:
                "是否应在 vLLM 中优先实现 FP8 KV Cache 量化？请基于 arXiv 论文和 vLLM 当前源码，给出可合并的最小实现方案、预期收益、主要质量风险，以及明确的继续／停止条件。",
            title: "vLLM FP8 KV Cache 量化的优先级与最小实现",
            question:
                "是否应在 vLLM 中优先实现 FP8 KV Cache 量化？请基于 arXiv 论文和 vLLM 当前源码，给出可合并的最小实现方案、预期收益、主要质量风险，以及明确的继续／停止条件。"
        });
    });

    it("predeclares four fixture-only research stages without claiming Manager agenda splitting", () => {
        expect(MEETING_BUSINESS_LOOP_ROUNDS).toEqual([
            expect.objectContaining({ id: "literature", sourceScope: "arxiv-fixture" }),
            expect.objectContaining({ id: "source", sourceScope: "vllm-source-fixture" }),
            expect.objectContaining({ id: "implementation", sourceScope: "design-fixture" }),
            expect.objectContaining({ id: "decision", sourceScope: "benchmark-fixture" })
        ]);
        expect(MEETING_BUSINESS_LOOP_ROUNDS).toHaveLength(4);
    });

    it("allows one expired review claim to recover within the smoke observation window", () => {
        expect(MEETING_BUSINESS_LOOP_LIMITS).toMatchObject({
            maxDurationMs: 600000,
            reviewDeadlineMs: 90000
        });
        expect(MEETING_BUSINESS_LOOP_LIMITS.reviewDeadlineMs).toBeGreaterThanOrEqual(90000);
        expect(MEETING_BUSINESS_LOOP_LIMITS.reviewDeadlineMs).toBeLessThan(
            MEETING_BUSINESS_LOOP_LIMITS.maxDurationMs
        );
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
