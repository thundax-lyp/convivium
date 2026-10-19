import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const parser = new URL(
    "../../../config/skills/research-planning/scripts/parse.mjs",
    import.meta.url
);
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
const parse = (text: string) =>
    JSON.parse(
        execFileSync(process.execPath, [parser.pathname], {
            input: JSON.stringify({ question: "原问题", draft: text }),
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"]
        })
    );

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
const validateReview = (value: unknown) =>
    JSON.parse(
        execFileSync(process.execPath, [parser.pathname, "review"], {
            input: JSON.stringify(value),
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"]
        })
    );
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
