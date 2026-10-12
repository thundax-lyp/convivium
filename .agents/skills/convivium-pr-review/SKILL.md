---
name: convivium-pr-review
description: Review a Convivium branch or pull request against its base diff for introduced or exposed correctness, architecture, meeting-protocol, lifecycle, persistence, security, and verification risks. Use for PR or branch review; report findings only and do not modify code.
---

# Convivium PR Review

对 Convivium 当前分支相对于目标基线的已提交变更执行严格、只读的 PR Review。`SKILL.md` 负责流程编排；具体风险模型、检查项和输出契约分别由 references 承载；Git 基线、changed files、模块分类和 diff 读取由 script 固化。

## 边界

- 默认审查 `main...HEAD`；用户明确提供其他 base 时使用该 base。
- 默认只审已提交 diff。工作区和未跟踪文件只作为状态信息，不纳入 findings；只有用户明确要求时才追加审查。
- 不修改、格式化、提交、推送、回复评论、合并或委派审查。
- 既有问题只有在当前 diff 引入、暴露、连通或实质放大时才报告。
- 不能把相邻项目作为源码、协议、目录分类或兼容基线。

## 1. 建立基线

在仓库根目录运行并完整读取：

```sh
node .agents/skills/convivium-pr-review/scripts/collect-review-context.mjs context --base main
node .agents/skills/convivium-pr-review/scripts/collect-review-context.mjs diff --base main
```

如果 patch 较大，按 context 返回的模块或路径分段运行 `diff --module <module>` / `diff --path <path>`，但必须覆盖全部 changed files。保存 snapshot：

```sh
node .agents/skills/convivium-pr-review/scripts/collect-review-context.mjs snapshot --base main
```

记录 `base_sha`、`merge_base`、`head`、`diff_hash` 和完整 changed-file 集。若 committed diff 为空，输出 0 个 changed files、coverage complete 和 `No actionable findings.`。

## 2. 路由上下文

以根 `AGENTS.md` 的 Read Order 为任务路由，按 [Document Rules](../../../docs/00-governance/DOCUMENT-RULES.md) 区分文档职责、权威和冲突。已读取且未变化的依据复用上下文；只加载能解释当前 diff 的最小上下文。

先读取 [PR Rules](../../../docs/00-governance/PR-RULES.md) 与 `.github/pull_request_template.md`；再按 changed surfaces 补读：

| 改动范围 | 当前依据 |
| --- | --- |
| 产品代码或设计 | [Architecture](../../../docs/00-governance/ARCHITECTURE.md)、[Engineering Rules](../../../docs/00-governance/ENGINEERING-RULES.md) 与相关需求；会议编排见 [Meeting Orchestration Requirements](../../../docs/10-requirements/MEETING-ORCHESTRATION-REQUIREMENTS.md)，证据轮次与审核见 [Meeting Evidence Round Requirements](../../../docs/10-requirements/MEETING-EVIDENCE-ROUND-REQUIREMENTS.md) |
| 协议、事件、Remote、投影、持久化 | [Meeting Interface](../../../docs/20-interfaces/MEETING-INTERFACE.md) 的相关章节 |
| Definition、角色资源、Catalog、预检、Session ownership | [DSH Role Interface](../../../docs/20-interfaces/DSH-ROLE-INTERFACE.md) |
| 源码目录、导入和入口边界 | [Architecture Rules](../../../docs/00-governance/ARCHITECTURE-RULES.md) |
| 测试 | [Test Rules](../../../docs/00-governance/TEST-RULES.md)；退役行为按其 Retired Behavior And Compatibility 判断，不自行新增旧格式专用拒绝契约 |
| 文档、治理规则 | Document Rules、被修改规则及直接引用；只有涉及产品行为或工程取舍时补读对应需求、架构和工程依据 |
| 已登记 TODO、RUNBOOK | 分别读取 [TODO Rules](../../../docs/00-governance/TODO-RULES.md) 或 [RUNBOOK Rules](../../../docs/00-governance/RUNBOOK-RULES.md)，及本次涉及的任务正文 |
| 安装、运行、诊断、恢复或发布 | 相关 `docs/50-operations/`；按需核对实际脚本与 `plugin/package.json` |
| 实现覆盖、验证或交付声明 | [Current Implementation Coverage](../../../docs/40-readiness/CURRENT-IMPLEMENTATION-COVERAGE.md) 与相关工程验证要求 |

具体实现链路再按需读取 `docs/30-designs/`；设计不能代替需求，readiness 只证明其记录的实现与验证范围，`docs/60-human/` 不作为正式工程依据。路径不存在或依据冲突时查找当前真相源；无法确认则记录缺口，不套用退役文档或凭当前代码补出产品规则。

## 3. 建立文档驱动的审查模型

1. 从当前 PR 相关的有效治理、需求、接口、设计或操作文档中提取 1–5 条适用承诺，readiness 用于核对实现与验证证据。每条承诺必须记录文档路径和章节，并遵守 Document Rules 的职责与权威；本 Skill 不自行定义业务结论。
2. 根据 changed surfaces 选择相关的通用审查维度。主维度用于安排重点，但不能跳过其他实际触发的维度。读取 [`references/review-dimensions.md`](./references/review-dimensions.md)。
3. 读取 [`references/evidence-matrix.md`](./references/evidence-matrix.md)，为每条系统承诺建立 source → producer → adapter → validator → consumer/sink 证据链，并补充负向场景、历史数据和验证证据。
4. 读取 [`references/review-checks.md`](./references/review-checks.md)，对全部 changed hunks 执行基础检查，再执行证据矩阵实际触发的专项检查。
5. 读取 [`references/coverage-and-output.md`](./references/coverage-and-output.md)，建立 changed-file ledger 和 contract-surface ledger。

## 4. 审查完整 diff

- 逐个覆盖脚本返回的 changed files；测试、配置、迁移、脚本和文档不能因不是业务代码而跳过。
- 涉及测试时读取 [Test Rules](../../../docs/00-governance/TEST-RULES.md)，核对行为依据、增量保护、合并/代码减量与成本。不自动调用 convivium-testcase-review；只有用户显式调用该 Skill 时才组合使用，并继承本次 diff、只读与输出边界。
- 对改动建立 producer → adapter → validator → consumer/sink 链路，必要时追踪 fallback、历史数据、迁移、等价路径和测试。
- 对每条从正式文档提取的承诺，至少记录一个真实 validator、consumer/sink 或明确的终点；找不到时标记为 deferred，而不是凭经验补全规则。
- 对当前 PR 至少推演一个异常、并发、权限、恢复、历史数据或治理失败反例。
- 对新增、删除、替换、绕过或收窄的旧路径进行语义对账。
- 只报告满足 finding 门槛的问题，不为了凑数量提出建议。

## 5. 收敛 findings

输出前必须对全部 candidate findings 执行一次收敛：

1. 按根因、触发条件、修复位置和当前 consumer 分组。
2. 同一实现缺陷及其直接测试或 readiness 缺口默认合并；只有具备独立触发、独立影响和独立修复边界时才能拆分。
3. 分别判断 finding 是否成立、优先级是否准确、最小修复是否合适；不得因为建议方案过大而否定真实 finding，也不得因为 finding 成立而接受扩大范围的方案。
4. 如果删除、收窄、改正文档或局部校验即可消除触发条件，不建议建立新抽象、状态、接口、adapter、registry、migration 或 runtime path。
5. 仅影响尚未实现路径的问题，优先删除过早契约、收窄声明或标记 blocked，不要求提前实现未来 Runtime、持久化、UI、transport 或 capability composition。
6. 重新统计 findings 并按当前可触发影响校准优先级；不得用 finding 数量、概念重要性或未来实现难度替代风险判断。
7. 对范围与复杂度 finding，确认已说明新增成本、缺失的当前 caller/requirement、可行的直接替代方案，以及删除或保留的风险；复杂状态机由当前并发、恢复、安全或兼容要求证明时，不得仅因复杂而报告。

## 6. 关闭审查

重新运行 snapshot。若 `head`、`base_sha`、`merge_base`、`diff_hash` 或 changed-file 集发生变化，原 ledger 失效，必须重新审查。按照 [`references/coverage-and-output.md`](./references/coverage-and-output.md) 输出 findings、ledger、validation gaps、summary 和合并建议。

只有两个 ledger 闭合且无 deferred 时，才能报告 `No actionable findings.`；没有 confirmed finding 但 coverage 不完整时，必须报告 `No confirmed findings, but review coverage is incomplete.`，并建议补齐审查后再决定。
