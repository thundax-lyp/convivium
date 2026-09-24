import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectAgentPromptEvidence } from "../../scripts/smoke-profile/probe/support.js";
import {
    MEETING_BUSINESS_LOOP_DEFINITIONS,
    MEETING_BUSINESS_LOOP_LIMITS,
    MEETING_BUSINESS_LOOP_TOPIC,
    MEETING_BUSINESS_LOOP_ROUNDS
} from "../../scripts/smoke-profile/probe/scenarios/meeting-business-loop.js";

describe("Meeting business-loop smoke prompt evidence", () => {
    it("uses the currently published Meeting Agent Definition versions", () => {
        const catalog = JSON.parse(
            readFileSync(new URL("../../meeting-roles/definitions.json", import.meta.url), "utf8")
        );
        const published = catalog.definitions
            .map((definition: { agentDefinitionId: string; definitionVersion: string }) => [
                definition.agentDefinitionId,
                definition.definitionVersion
            ])
            .sort();
        const requested = MEETING_BUSINESS_LOOP_DEFINITIONS.map(
            ([, definitionId, definitionVersion]) => [definitionId, definitionVersion]
        ).sort();

        expect(requested).toEqual(published);
    });

    it("uses the agreed controllable-divergence research topic", () => {
        expect(MEETING_BUSINESS_LOOP_TOPIC).toEqual({
            objective:
                "Agent 执行长任务时，如何在保证一定发散性的前提下保证任务目标不漂移，实现可控的发散？请给出目标锚定机制、允许的探索边界、漂移检测与纠偏策略、验收指标，以及明确的继续／停止条件。",
            title: "Agent 长任务中的可控发散",
            question:
                "Agent 执行长任务时，如何在保证一定发散性的前提下保证任务目标不漂移，实现可控的发散？请给出目标锚定机制、允许的探索边界、漂移检测与纠偏策略、验收指标，以及明确的继续／停止条件。"
        });
    });

    it("predeclares four fixture-only research stages without claiming Manager agenda splitting", () => {
        expect(MEETING_BUSINESS_LOOP_ROUNDS).toEqual([
            expect.objectContaining({ id: "literature", sourceScope: "agent-research-fixture" }),
            expect.objectContaining({ id: "source", sourceScope: "agent-runtime-fixture" }),
            expect.objectContaining({
                id: "implementation",
                sourceScope: "control-design-fixture"
            }),
            expect.objectContaining({ id: "decision", sourceScope: "evaluation-fixture" })
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
