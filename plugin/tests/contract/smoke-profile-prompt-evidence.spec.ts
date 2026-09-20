import { describe, expect, it } from "vitest";
import { collectAgentPromptEvidence } from "../../scripts/smoke-profile/probe/support.js";
import { MEETING_BUSINESS_LOOP_TOPIC } from "../../scripts/smoke-profile/probe/scenarios/meeting-business-loop.js";

describe("Meeting business-loop smoke prompt evidence", () => {
    it("uses the agreed independent JEV discussion topic", () => {
        expect(MEETING_BUSINESS_LOOP_TOPIC).toEqual({
            objective:
                "评估 JEV 大模型的公开能力主张是否有充分、可验证的证据支持，并以 mono-jev 为具体案例分析是否存在过度包装。",
            title: "JEV 大模型能力主张与过度包装",
            question:
                "JEV 大模型（以 mono-jev 为例）的公开能力主张是否有充分、可验证的证据支持，是否存在过度包装？"
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
