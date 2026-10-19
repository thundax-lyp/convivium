import {
    runPlanning,
    parsePlan,
    validateReview as checkReview
} from "@/research-planning-execution/index.ts";
import { describe, expect, it, vi } from "vitest";

const draft = `[问题]
原问题
[要求 R1]
弄清机制
[对象 O1]
名称：机制
目标：判断机制如何成立
包含：
- 方法与条件
排除：
覆盖：R1
依赖：
边界：仅讨论机制
[横贯要求]
- 区分证据
[未决前提]
[下一步]
对象：O1
理由：先明确机制
`;
const parse = (text: string) => parsePlan("原问题", text);

describe("research planning list conversion", () => {
    it("converts explicit fields without inventing content and computes coverage", () => {
        const plan = parse(draft);
        expect(plan.researchObjects[0]).toMatchObject({
            id: "O1",
            name: "机制",
            dependencyInputs: []
        });
        expect(plan.coverageCheck.uncoveredRequirementIds).toEqual([]);
        expect(plan.originalQuestion).toBe("原问题");
    });
    it("rejects a cycle between distinct objects", () => {
        const second = `[对象 O2]
名称：第二对象
目标：回答第二个问题
包含：
- 第二个关系
排除：
覆盖：R1
依赖：
- O1 | 第一结论
边界：第二对象责任
`;
        const cyclic = draft
            .replace("依赖：\n", "依赖：\n- O2 | 第二结论\n")
            .replace("[横贯要求]", second + "[横贯要求]");
        expect(() => parse(cyclic)).toThrow(/Dependency cycle/);
    });

    it.each([
        ["uncovered requirement", draft.replace("覆盖：R1", "覆盖：R2")],
        ["unknown field", draft.replace("目标：", "状态：已完成\n目标：")],
        ["missing field", draft.replace("目标：判断机制如何成立\n", "")],
        ["self dependency", draft.replace("依赖：\n", "依赖：\n- O1 | 自身结论\n")],
        ["changed question", draft.replace("原问题\n", "其他问题\n")],
        ["extra section", draft + "[额外]\n内容\n"]
    ])("rejects %s without repairing the draft", (_name, text) => {
        expect(() => parse(text)).toThrow();
    });
});

const review = {
    status: "PASS",
    checks: ["coverage", "boundaries", "dependencies", "premises"].map((check) => ({
        check,
        status: "PASS",
        evidence: "O1 的目标回答 R1，边界仅研究机制，无外部依赖。"
    })),
    findings: [] as { location: string; rule: string; evidence: string }[]
};
const validateReview = (value: unknown) => checkReview(value);

describe("research planning review acceptance", () => {
    it("accepts a complete evidenced review", () => {
        expect(validateReview(review)).toEqual(review);
    });
    it.each([
        { ...review, checks: review.checks.slice(1) },
        { ...review, checks: review.checks.map((c, i) => (i ? c : { ...c, status: "FAIL" })) },
        {
            ...review,
            findings: [{ location: "O1", rule: "overwide", evidence: "two responsibilities" }]
        },
        { ...review, checks: review.checks.map((c) => ({ ...c, evidence: "" })) }
    ])("rejects missing evidence or inconsistent approval", (value) => {
        expect(() => validateReview(value)).toThrow();
    });
});

it("revises after independent rejection and preserves raw candidates without repairing fields", async () => {
    const failed = {
        ...review,
        status: "FAIL",
        checks: review.checks.map((c, i) => (i ? c : { ...c, status: "FAIL" })),
        findings: [{ location: "O1", rule: "boundary", evidence: "需要重新划界" }]
    };
    let count = 0;
    const generate = vi.fn(async ({ model }: { model: string }) => ({
        text: model === "deepseek-flash" ? draft : JSON.stringify(count++ ? review : failed),
        completed: true,
        metadata: {}
    }));
    const result = await runPlanning({ question: "原问题", skill: "技能方法", generate });
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
        throw new Error("not accepted");
    }
    expect(result.attempts.map((a) => a.draft)).toEqual([draft, draft]);
    expect(result.attempts[0]!.review).toBe(JSON.stringify(failed));
    const calls = generate.mock.calls as unknown as [
        { model: string; messages: { content: string }[] }
    ][];
    expect(JSON.stringify(calls[3]![0].messages)).not.toContain("需要重新划界");
    expect(calls[3]![0].messages).toHaveLength(2);
});
it("returns a bounded failure instead of a plan when all independent reviews reject", async () => {
    let calls = 0;
    const result = await runPlanning({
        question: "原问题",
        skill: "方法",
        generate: async ({ model }) => {
            calls++;
            return {
                text: model === "deepseek-flash" ? draft : "{}",
                completed: true,
                metadata: {}
            };
        }
    });
    expect(result).toMatchObject({ status: "failed", attempts: [{}, {}, {}] });
    expect(result).not.toHaveProperty("plan");
    expect(calls).toBe(6);
});
